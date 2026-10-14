import type { SessionUser } from './types.js';

export const PERMISSIONS = [
  'USER_CREATE', 'USER_DISABLE', 'USER_MANAGE', 'SITE_MANAGE', 'GUARD_MANAGE',
  'ATTENDANCE_VERIFY', 'SALARY_VIEW', 'SALARY_APPROVE',
  'DOCUMENT_DOWNLOAD', 'AUDIT_VIEW', 'REPORT_EXPORT',
  'OPERATIONS_VIEW', 'ATTENDANCE_SUBMIT', 'INCIDENT_MANAGE', 'NOTIFICATION_MANAGE',
  'PROFILE_VIEW', 'DOCUMENT_VIEW', 'ACCESS_MANAGE',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const rolePermissions: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MAIN_SECURITY: ['OPERATIONS_VIEW', 'ATTENDANCE_VERIFY', 'USER_CREATE', 'GUARD_MANAGE', 'SALARY_VIEW', 'INCIDENT_MANAGE', 'NOTIFICATION_MANAGE', 'REPORT_EXPORT', 'PROFILE_VIEW', 'DOCUMENT_VIEW', 'DOCUMENT_DOWNLOAD'],
  GUARD: ['OPERATIONS_VIEW', 'ATTENDANCE_SUBMIT', 'SALARY_VIEW', 'PROFILE_VIEW', 'DOCUMENT_VIEW', 'DOCUMENT_DOWNLOAD'],
};

export function permissionsFor(role: string): readonly Permission[] {
  return Object.prototype.hasOwnProperty.call(rolePermissions, role) ? rolePermissions[role] : [];
}

export function hasPermission(user: SessionUser | undefined, permission: Permission): boolean {
  return Boolean(user?.id && permissionsFor(user.role).includes(permission));
}

export function canAccessSite(user: SessionUser | undefined, siteId?: string): boolean {
  if (!user?.id) return false;
  if (user.role === 'ADMIN') return true;
  return user.role === 'MAIN_SECURITY' && Boolean(siteId && user.assignedSiteIds?.includes(siteId));
}

export type OwnedResource = { guardId?: string; userId?: string; siteId?: string };

/** Managers may maintain guards only inside their assigned sites. */
export function canManageGuard(user: SessionUser | undefined, resource: OwnedResource): boolean {
  return hasPermission(user, 'GUARD_MANAGE') && canAccessSite(user, resource.siteId);
}

export function canReadDocument(user: SessionUser | undefined, resource: OwnedResource): boolean {
  return canReadOwnedPrivate(user, resource) || canManageGuard(user, resource);
}

export function ownsResource(user: SessionUser | undefined, resource: OwnedResource): boolean {
  if (!user?.id || !permissionsFor(user.role).length) return false;
  return resource.userId === user.id || Boolean(user.role === 'GUARD' && user.guardId && resource.guardId === user.guardId);
}

export function canReadPrivate(user: SessionUser | undefined, resource: OwnedResource): boolean {
  return Boolean(user?.id && (user.role === 'ADMIN' || ownsResource(user, resource) || (user.role === 'MAIN_SECURITY' && canAccessSite(user, resource.siteId))));
}

/** Personal records such as salary and documents are owner/admin-only. */
export function canReadOwnedPrivate(user: SessionUser | undefined, resource: OwnedResource): boolean {
  return Boolean(user?.id && (user.role === 'ADMIN' || ownsResource(user, resource)));
}

export function canReadOperational(user: SessionUser | undefined, resource: OwnedResource): boolean {
  if (!hasPermission(user, 'OPERATIONS_VIEW')) return false;
  return user?.role === 'GUARD' ? ownsResource(user, resource) : canAccessSite(user, resource.siteId);
}

export function canReadProfile(user: SessionUser | undefined, resource: OwnedResource): boolean {
  return hasPermission(user, 'PROFILE_VIEW') && (ownsResource(user, resource) || canAccessSite(user, resource.siteId));
}
