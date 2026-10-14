import type { Permission } from '../../shared/permissions.js';

export type ResourceKind = 'user' | 'profile' | 'guard' | 'guardSalary' | 'guardDocuments' | 'site' | 'attendance' | 'incident' | 'document' | 'documentDownload' | 'verification' | 'notification' | 'salary';
export type RoutePolicy = { method: string; pattern: RegExp; permission?: Permission; requiredPermissions?: readonly Permission[]; resource?: ResourceKind; audit?: boolean; public?: boolean };

// Explicit allowlist: a newly added API does not inherit authenticated access.
export const routePolicies: readonly RoutePolicy[] = [
  { method: 'GET', pattern: /^\/photo-duty\/(current|days|operations)\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'GET', pattern: /^\/photo-duty\/photo\/([^/]+)\/?$/, permission: 'OPERATIONS_VIEW', resource: 'attendance' },
  { method: 'POST', pattern: /^\/photo-duty\/(capture-session|capture)\/?$/, permission: 'ATTENDANCE_SUBMIT' },
  { method: 'GET', pattern: /^\/photo-payroll(?:\/payslip\/([^/]+))?\/?$/, permission: 'SALARY_VIEW' },
  { method: 'POST', pattern: /^\/photo-payroll\/credit\/([^/]+)\/?$/, permission: 'SALARY_APPROVE', audit: true },
  { method: 'POST', pattern: /^\/auth\/(login|logout|refresh)\/?$/, public: true },
  { method: 'GET', pattern: /^\/auth\/me\/?$/ },
  { method: 'POST', pattern: /^\/auth\/(change-password|logout-all)\/?$/ },
  { method: 'GET', pattern: /^\/auth\/sessions\/?$/ },
  { method: 'DELETE', pattern: /^\/auth\/sessions\/([^/]+)\/?$/ },
  { method: 'GET', pattern: /^\/users\/?$/, permission: 'USER_MANAGE' },
  { method: 'GET', pattern: /^\/users\/next-employee-code\/?$/, permission: 'USER_CREATE' },
  { method: 'POST', pattern: /^\/(users|guards)\/?$/, permission: 'USER_CREATE', audit: true },
  { method: 'PATCH', pattern: /^\/users\/([^/]+)\/?$/, permission: 'USER_DISABLE', audit: true },
  { method: 'PATCH', pattern: /^\/users\/([^/]+)\/access\/?$/, permission: 'ACCESS_MANAGE', audit: true },
  { method: 'GET', pattern: /^\/users\/([^/]+)\/access-history\/?$/, permission: 'ACCESS_MANAGE', audit: true },
  { method: 'GET', pattern: /^\/users\/([^/]+)\/photo\/?$/, permission: 'PROFILE_VIEW', resource: 'user', audit: true },
  { method: 'GET', pattern: /^\/profiles\/([^/]+)\/?$/, permission: 'PROFILE_VIEW', resource: 'profile', audit: true },
  { method: 'GET', pattern: /^\/(dashboard|guards|sites|attendance\/(today|history)|shifts\/mine|incidents|verifications|notifications)\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'GET', pattern: /^\/guards\/([^/]+)\/salary\/?$/, permission: 'SALARY_VIEW', resource: 'guardSalary', audit: true },
  { method: 'GET', pattern: /^\/guards\/([^/]+)\/documents\/?$/, permission: 'DOCUMENT_VIEW', resource: 'guardDocuments' },
  { method: 'GET', pattern: /^\/guards\/([^/]+)(?:\/(photo|attendance))?\/?$/, permission: 'OPERATIONS_VIEW', resource: 'guard', audit: true },
  { method: 'POST', pattern: /^\/guards\/import\/?$/, permission: 'USER_CREATE', audit: true },
  { method: 'POST', pattern: /^\/guards\/([^/]+)\/lifecycle\/?$/, permission: 'USER_DISABLE', resource: 'guard', audit: true },
  { method: 'POST', pattern: /^\/guards\/bulk-lifecycle\/?$/, permission: 'USER_DISABLE', audit: true },
  { method: 'GET', pattern: /^\/guards\/([^/]+)\/id-card\/?$/, permission: 'PROFILE_VIEW', resource: 'guard', audit: true },
  { method: 'PATCH', pattern: /^\/guards\/([^/]+)\/?$/, permission: 'GUARD_MANAGE', resource: 'guard', audit: true },
  { method: 'POST', pattern: /^\/guards\/([^/]+)\/reset-password\/?$/, permission: 'USER_MANAGE', audit: true },
  { method: 'POST', pattern: /^\/sites\/?$/, permission: 'SITE_MANAGE', audit: true },
  { method: 'PATCH', pattern: /^\/sites\/([^/]+)\/?$/, permission: 'SITE_MANAGE', audit: true },
  { method: 'GET', pattern: /^\/sites\/([^/]+)\/guards\/?$/, permission: 'OPERATIONS_VIEW', resource: 'site' },
  { method: 'GET', pattern: /^\/operations\/dashboard\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'GET', pattern: /^\/rosters\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'POST', pattern: /^\/rosters\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'PATCH', pattern: /^\/rosters\/([^/]+)\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'POST', pattern: /^\/rosters\/([^/]+)\/acknowledge\/?$/, permission: 'ATTENDANCE_SUBMIT' },
  { method: 'GET', pattern: /^\/leave-requests\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'POST', pattern: /^\/leave-requests\/?$/, permission: 'ATTENDANCE_SUBMIT', audit: true },
  { method: 'PATCH', pattern: /^\/leave-requests\/([^/]+)\/decision\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'GET', pattern: /^\/replacements\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'POST', pattern: /^\/replacements\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'PATCH', pattern: /^\/replacements\/([^/]+)\/decision\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'GET', pattern: /^\/overtime\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'POST', pattern: /^\/overtime\/?$/, permission: 'ATTENDANCE_SUBMIT', audit: true },
  { method: 'PATCH', pattern: /^\/overtime\/([^/]+)\/decision\/?$/, permission: 'ATTENDANCE_VERIFY', audit: true },
  { method: 'POST', pattern: /^\/incidents\/?$/, permission: 'ATTENDANCE_SUBMIT' },
  { method: 'PATCH', pattern: /^\/incidents\/([^/]+)\/?$/, permission: 'INCIDENT_MANAGE', resource: 'incident', audit: true },
  { method: 'GET', pattern: /^\/salaries\/?$/, permission: 'SALARY_VIEW', audit: true },
  { method: 'POST', pattern: /^\/salaries\/([^/]+)\/(mark-paid|correct)\/?$/, permission: 'SALARY_APPROVE', audit: true },
  { method: 'POST', pattern: /^\/guards\/([^/]+)\/documents\/?$/, permission: 'GUARD_MANAGE', resource: 'guardDocuments', audit: true },
  { method: 'GET', pattern: /^\/documents\/?$/, permission: 'DOCUMENT_VIEW', audit: true },
  { method: 'GET', pattern: /^\/documents\/([^/]+)\/history\/?$/, permission: 'DOCUMENT_VIEW', resource: 'document', audit: true },
  { method: 'GET', pattern: /^\/documents\/([^/]+)\/preview\/?$/, permission: 'DOCUMENT_VIEW', resource: 'document', audit: true },
  { method: 'GET', pattern: /^\/documents\/([^/]+)\/download\/?$/, permission: 'DOCUMENT_DOWNLOAD', resource: 'documentDownload', audit: true },
  { method: 'GET', pattern: /^\/documents\/([^/]+)\/?$/, permission: 'DOCUMENT_DOWNLOAD', resource: 'documentDownload', audit: true },
  { method: 'GET', pattern: /^\/verifications\/([^/]+)\/?$/, permission: 'OPERATIONS_VIEW', resource: 'verification' },
  { method: 'PATCH', pattern: /^\/notifications\/read-all\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'PATCH', pattern: /^\/notifications\/([^/]+)\/read\/?$/, permission: 'OPERATIONS_VIEW', resource: 'notification' },
  { method: 'POST', pattern: /^\/notifications\/([^/]+)\/acknowledge\/?$/, permission: 'OPERATIONS_VIEW', resource: 'notification', audit: true },
  { method: 'GET', pattern: /^\/notifications\/preferences\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'PATCH', pattern: /^\/notifications\/preferences\/?$/, permission: 'OPERATIONS_VIEW' },
  { method: 'POST', pattern: /^\/notifications\/broadcast\/?$/, permission: 'NOTIFICATION_MANAGE', audit: true },
  { method: 'POST', pattern: /^\/push\/subscribe\/?$/ },
  { method: 'GET', pattern: /^\/audit\/?$/, permission: 'AUDIT_VIEW', audit: true },
  { method: 'GET', pattern: /^\/reports\/attendance\.csv\/?$/, permission: 'REPORT_EXPORT', audit: true },
  { method: 'GET', pattern: /^\/reports\/salaries\.csv\/?$/, permission: 'REPORT_EXPORT', requiredPermissions: ['SALARY_VIEW'], audit: true },
  { method: 'GET', pattern: /^\/reports\/(payroll|documents|incidents|site-coverage)\.csv\/?$/, permission: 'REPORT_EXPORT', audit: true },
  { method: 'POST', pattern: /^\/payroll\/preview\/?$/, permission: 'SALARY_VIEW', audit: true },
  { method: 'POST', pattern: /^\/payroll\/run\/?$/, permission: 'SALARY_APPROVE', audit: true },
  { method: 'GET', pattern: /^\/payroll\/?$/, permission: 'SALARY_VIEW', audit: true },
  { method: 'PATCH', pattern: /^\/payroll\/([^/]+)\/(approve|lock|pay|reconcile|correction)\/?$/, permission: 'SALARY_APPROVE', resource: 'salary', audit: true },
  { method: 'GET', pattern: /^\/payroll\/([^/]+)\/payslip\/?$/, permission: 'SALARY_VIEW', resource: 'salary', audit: true },
  { method: 'POST', pattern: /^\/payroll\/bulk-approve\/?$/, permission: 'SALARY_APPROVE', audit: true },
];

export function matchRoutePolicy(method: string, path: string): { policy: RoutePolicy; id?: string } | undefined {
  // Match Express's case-insensitive, optional-trailing-slash route convention.
  const effectiveMethod = method === 'HEAD' ? 'GET' : method;
  for (const policy of routePolicies) {
    if (policy.method !== effectiveMethod) continue;
    const match = new RegExp(policy.pattern.source, 'i').exec(path);
    if (match) return { policy, id: match[1] ? decodeURIComponent(match[1]) : undefined };
  }
  return undefined;
}
