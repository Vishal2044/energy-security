import type { RequestHandler } from 'express';
import { canReadOperational, canReadPrivate, canReadOwnedPrivate, canReadProfile, canAccessSite, canManageGuard, canReadDocument, hasPermission, type OwnedResource } from '../../shared/permissions.js';
import { matchRoutePolicy, type ResourceKind } from './routes.js';

export function createAuthorizationMiddleware(dependencies: {
  loadResource: (kind: ResourceKind, id: string) => Promise<OwnedResource | undefined>;
  audit: (actor: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) => Promise<void>;
}): RequestHandler {
  return async (req, res, next) => {
    try {
      const matched = matchRoutePolicy(req.method, req.path);
      if (matched?.policy.public) return next();
      if (!req.user) { res.status(401).json({ success: false, error: 'AUTH_REQUIRED' }); return; }
      // No cached private response may bypass changed ownership/grants.
      res.setHeader('Cache-Control', 'private, no-store');
      const deny = async () => {
        await dependencies.audit(req.user!.id, 'AUTHORIZATION_DENIED', 'API', matched?.id ?? '', {
          method: req.method, route: matched?.policy.pattern.source ?? 'UNREGISTERED', permission: matched?.policy.permission,
        });
        res.status(403).json({ success: false, error: 'FORBIDDEN' });
      };
      // Guard data is read-only except for a scheduled live-camera submission.
      const guardWriteAllowed = /^\/auth\/(logout|refresh)\/?$/.test(req.path) || /^\/photo-duty\/(capture-session|capture)\/?$/.test(req.path);
      if (req.user.role === 'GUARD' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !guardWriteAllowed) {
        await deny(); return;
      }
      if (!matched || (matched.policy.permission && !hasPermission(req.user, matched.policy.permission)) ||
          matched.policy.requiredPermissions?.some((permission) => !hasPermission(req.user, permission))) {
        await deny(); return;
      }
      if (matched.policy.resource && matched.id) {
        const resource = await dependencies.loadResource(matched.policy.resource, matched.id);
        if (!resource) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
        const privateResource = ['guardSalary', 'guardDocuments', 'document', 'documentDownload', 'salary'].includes(matched.policy.resource);
        const profileResource = ['profile', 'user'].includes(matched.policy.resource);
        const documentResource = ['guardDocuments', 'document', 'documentDownload'].includes(matched.policy.resource);
        const allowed = matched.policy.permission === 'GUARD_MANAGE' ? canManageGuard(req.user, resource)
          : matched.policy.resource === 'site' ? canAccessSite(req.user, resource.siteId)
          : documentResource ? canReadDocument(req.user, resource)
          : privateResource ? canReadOwnedPrivate(req.user, resource) || canManageGuard(req.user, resource)
          : profileResource ? canReadProfile(req.user, resource)
          : matched.policy.resource === 'notification' ? canReadPrivate(req.user, resource)
          : canReadOperational(req.user, resource);
        if (!allowed) { await deny(); return; }
      }
      if (matched.policy.audit) {
        // Persist before exposing data/mutating. This is an authorized request,
        // not a claim of successful completion; domain writes keep their audits.
        await dependencies.audit(req.user.id, 'PRIVILEGED_OPERATION_REQUESTED', 'API', matched.id ?? '', {
          method: req.method, route: matched.policy.pattern.source, permission: matched.policy.permission,
        });
      }
      next();
    } catch (error) { next(error); }
  };
}
