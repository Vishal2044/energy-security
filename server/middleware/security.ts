import type { RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ensureCsrfCookie } from '../services/auth.js';

const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function sameOrigin(origin: string) {
  return origin === env.clientUrl;
}

export const requestSecurity: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !sameOrigin(origin)) return res.status(403).json({ success: false, error: 'ORIGIN_NOT_ALLOWED' });
  ensureCsrfCookie(req, res);
  if (unsafeMethods.has(req.method) && (req.cookies?.dg_access || req.cookies?.dg_refresh) && !/^\/auth\/(login|logout)$/.test(req.path)) {
    const cookie = String(req.cookies?.dg_csrf ?? '');
    const header = String(req.get('x-csrf-token') ?? '');
    const valid = cookie.length > 0 && cookie.length === header.length && timingSafeEqual(Buffer.from(cookie), Buffer.from(header));
    if (!valid) return res.status(403).json({ success: false, error: 'CSRF_TOKEN_INVALID' });
  }
  next();
};
