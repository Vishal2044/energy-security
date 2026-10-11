import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction, CookieOptions } from 'express';
import type { Role, SessionUser } from '../../shared/types.js';
import { env } from '../config/env.js';
import { db, type SessionRecord } from './memory.js';
import { isDatabaseConnected } from '../db.js';
import { SessionModel, UserModel } from '../models/index.js';
import { createRequireAuth } from '../authorization/authenticate.js';

const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export async function verifyPassword(value: string, hash: string) { return bcrypt.compare(value, hash); }
export function signAccessToken(user: SessionUser) { return jwt.sign(user, env.accessSecret, { expiresIn: '15m' }); }
export function verifyAccessToken(token: string) { return jwt.verify(token, env.accessSecret); }

const sessionCookieOptions = (): CookieOptions => ({ httpOnly: true, secure: env.cookieSecure, sameSite: env.cookieSecure ? 'none' : 'lax', path: '/' });
const refreshCookieOptions = (): CookieOptions => ({ ...sessionCookieOptions(), path: '/api/auth' });
const csrfCookieOptions = (): CookieOptions => ({ secure: env.cookieSecure, sameSite: env.cookieSecure ? 'none' : 'lax', path: '/', maxAge: REFRESH_MAX_AGE });

export function setCsrfCookie(res: Response, value = randomBytes(24).toString('base64url')) {
  res.cookie('dg_csrf', value, csrfCookieOptions());
  return value;
}
export function ensureCsrfCookie(req: Request, res: Response) {
  return typeof req.cookies?.dg_csrf === 'string' && req.cookies.dg_csrf ? req.cookies.dg_csrf : setCsrfCookie(res);
}
export function setSession(res: Response, token: string, refreshToken?: string) {
  res.cookie('dg_access', token, { ...sessionCookieOptions(), maxAge: ACCESS_MAX_AGE });
  if (refreshToken) res.cookie('dg_refresh', refreshToken, { ...refreshCookieOptions(), maxAge: REFRESH_MAX_AGE });
  setCsrfCookie(res);
}
export function clearSession(res: Response) {
  res.clearCookie('dg_access', sessionCookieOptions());
  res.clearCookie('dg_refresh', refreshCookieOptions());
  res.clearCookie('dg_csrf', csrfCookieOptions());
}
export function refreshTokenFromRequest(req: Request) { return typeof req.cookies?.dg_refresh === 'string' ? req.cookies.dg_refresh : undefined; }
function hashRefreshToken(value: string) { return createHash('sha256').update(value).digest('hex'); }
function newRefreshToken() { return randomBytes(48).toString('base64url'); }
function requestIp(req: Request) { return String(req.ip ?? req.socket.remoteAddress ?? '').slice(0, 200); }

export async function createRefreshSession(userId: string, req: Request, familyId = randomBytes(24).toString('base64url')) {
  const raw = newRefreshToken();
  const now = new Date();
  const value = { userId, familyId, tokenHash: hashRefreshToken(raw), createdAt: now, expiresAt: new Date(now.getTime() + REFRESH_MAX_AGE), userAgent: String(req.get('user-agent') ?? '').slice(0, 500), ip: requestIp(req) };
  if (isDatabaseConnected()) await SessionModel.create({ _id: `sess_${randomBytes(12).toString('hex')}`, ...value });
  else db.sessions.unshift({ id: `sess_${randomBytes(12).toString('hex')}`, ...value, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + REFRESH_MAX_AGE).toISOString() });
  return { raw, familyId };
}

export async function rotateRefreshSession(raw: string, req: Request) {
  const tokenHash = hashRefreshToken(raw);
  const now = new Date();
  if (isDatabaseConnected()) {
    const session: any = await SessionModel.findOne({ tokenHash });
    if (!session) return undefined;
    if (session.revokedAt) {
      await SessionModel.updateMany({ familyId: session.familyId, revokedAt: { $exists: false } }, { $set: { revokedAt: now } });
      const error = new Error('REFRESH_TOKEN_REUSE'); error.name = 'REFRESH_TOKEN_REUSE'; throw error;
    }
    if (new Date(session.expiresAt).getTime() <= now.getTime()) return undefined;
    const next = await createRefreshSession(String(session.userId), req, String(session.familyId));
    session.revokedAt = now;
    session.replacedByHash = hashRefreshToken(next.raw);
    session.lastUsedAt = now;
    await session.save();
    return { userId: String(session.userId), refreshToken: next.raw };
  }
  const session = db.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) return undefined;
  if (session.revokedAt) {
    db.sessions.filter((item) => item.familyId === session.familyId && !item.revokedAt).forEach((item) => { item.revokedAt = now.toISOString(); });
    const error = new Error('REFRESH_TOKEN_REUSE'); error.name = 'REFRESH_TOKEN_REUSE'; throw error;
  }
  if (new Date(session.expiresAt).getTime() <= now.getTime()) return undefined;
  const next = await createRefreshSession(session.userId, req, session.familyId);
  session.revokedAt = now.toISOString(); session.replacedByHash = hashRefreshToken(next.raw); session.lastUsedAt = now.toISOString();
  return { userId: session.userId, refreshToken: next.raw };
}

export async function revokeRefreshSession(raw?: string) {
  if (!raw) return;
  const tokenHash = hashRefreshToken(raw);
  if (isDatabaseConnected()) await SessionModel.updateOne({ tokenHash, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  else { const item = db.sessions.find((session) => session.tokenHash === tokenHash && !session.revokedAt); if (item) item.revokedAt = new Date().toISOString(); }
}
export async function revokeAllRefreshSessions(userId: string) {
  if (isDatabaseConnected()) await SessionModel.updateMany({ userId, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  else db.sessions.filter((session) => session.userId === userId && !session.revokedAt).forEach((session) => { session.revokedAt = new Date().toISOString(); });
}
export async function listRefreshSessions(userId: string) {
  if (isDatabaseConnected()) return (await SessionModel.find({ userId }).sort({ createdAt: -1 }).lean()).map((item: any) => ({ id: String(item._id), createdAt: item.createdAt, expiresAt: item.expiresAt, revokedAt: item.revokedAt, lastUsedAt: item.lastUsedAt, userAgent: item.userAgent, ip: item.ip }));
  return db.sessions.filter((session) => session.userId === userId).map(({ tokenHash: _tokenHash, familyId: _familyId, replacedByHash: _replacedByHash, ...safe }) => safe);
}

export const requireAuth = createRequireAuth({
  verifyToken: (token) => verifyAccessToken(token),
  findAccount: async (id) => isDatabaseConnected() ? UserModel.findById(id).lean() : db.users.find((user) => user.id === id),
});
export function requireRoles(...roles: Role[]) { return (req: Request, res: Response, next: NextFunction) => req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ success: false, error: 'FORBIDDEN' }); }
export function userByEmail(email: string) { return db.users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.active); }
