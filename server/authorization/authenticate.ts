import type { RequestHandler } from 'express';
import { ROLES, type SessionUser } from '../../shared/types.js';

export type AccountIdentity = {
  // Mongoose optional paths may be null in legacy lean documents.
  id?: string | null; _id?: unknown; role?: string | null; name?: string | null; email?: string | null;
  active?: boolean | null; guardId?: string | null; profilePhoto?: string | null;
  preferredLanguage?: string | null; assignedSiteIds?: readonly unknown[] | null;
  passwordChangeRequired?: boolean | null;
};

export function createRequireAuth(dependencies: {
  verifyToken: (token: string) => unknown;
  findAccount: (id: string) => Promise<AccountIdentity | null | undefined>;
}): RequestHandler {
  const authenticated = new WeakSet<object>();
  return async (req, res, next) => {
    if (authenticated.has(req)) return next();
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const token = req.cookies?.dg_access ?? bearer;
    if (typeof token !== 'string' || !token) {
      res.status(401).json({ success: false, error: 'AUTH_REQUIRED' }); return;
    }
    let claims: unknown;
    try { claims = dependencies.verifyToken(token); }
    catch { res.status(401).json({ success: false, error: 'SESSION_EXPIRED' }); return; }
    if (!claims || typeof claims !== 'object' || !('id' in claims) || typeof claims.id !== 'string' || !claims.id) {
      res.status(401).json({ success: false, error: 'SESSION_EXPIRED' }); return;
    }
    try {
      const account = await dependencies.findAccount(claims.id);
      if (!account || String(account.id ?? account._id) !== claims.id || account.active === false || !ROLES.includes(account.role as SessionUser['role'])) {
        res.status(401).json({ success: false, error: 'SESSION_EXPIRED' }); return;
      }
      req.user = {
        id: String(account.id ?? account._id), role: account.role as SessionUser['role'],
        name: account.name ?? '', email: account.email ?? '',
        guardId: account.role === 'GUARD' ? account.guardId || undefined : undefined,
        preferredLanguage: account.preferredLanguage === 'en' ? 'en' : 'gu',
        passwordChangeRequired: account.passwordChangeRequired === true,
        profilePhotoUrl: account.profilePhoto ? `/api/users/${String(account.id ?? account._id)}/photo` : undefined,
        assignedSiteIds: account.role === 'MAIN_SECURITY' && Array.isArray(account.assignedSiteIds)
          ? [...new Set(account.assignedSiteIds.filter((site): site is string => typeof site === 'string' && Boolean(site)))] : [],
      };
      authenticated.add(req); next();
    } catch (error) { next(error); }
  };
}
