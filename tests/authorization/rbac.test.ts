import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { hasPermission, canReadOperational, canReadPrivate, PERMISSIONS } from '../../shared/permissions.js';
import { matchRoutePolicy } from '../../server/authorization/routes.js';
import { createAuthorizationMiddleware } from '../../server/authorization/middleware.js';
import { createRequireAuth } from '../../server/authorization/authenticate.js';
import type { SessionUser } from '../../shared/types.js';

// Router-only fixture server: never import server/index.ts, connect or seed.
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'rbac-test-fixture-secret-not-for-production';
process.env.MONGODB_URI = '';
process.env.COOKIE_SECURE = 'true';
const { router } = await import('../../server/route.js');
const { db } = await import('../../server/services/memory.js');
const { isDatabaseConnected } = await import('../../server/db.js');
let server: Server;
let origin: string;

before(async () => {
  assert.equal(isDatabaseConnected(), false, 'Tests must never use a connected database');
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/api', router);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ success: false, error: 'FIXTURE_SERVER_ERROR' }));
  server = await new Promise<Server>((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}/api`;
});
after(async () => { if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
beforeEach(() => {
  Object.values(db).forEach((items) => { items.length = 0; });
  for (const [id, role, guardId, sites] of [
    ['admin', 'ADMIN', undefined, []], ['supervisor', 'MAIN_SECURITY', undefined, ['site_a']],
    ['unassigned', 'MAIN_SECURITY', undefined, []], ['guard_user_a', 'GUARD', 'guard_a', []],
    ['guard_user_b', 'GUARD', 'guard_b', []], ['unlinked', 'GUARD', undefined, []],
  ] as const) db.users.push({ id, role, guardId, name: id, email: `${id}@example.test`, passwordHash: 'unused', preferredLanguage: 'gu', active: true, assignedSiteIds: [...sites] });
  for (const suffix of ['a', 'b']) {
    db.sites.push({ id: `site_${suffix}`, siteCode: `SITE-${suffix}`, siteName: `Site ${suffix}`, siteType: 'WIND', status: 'ACTIVE', assignedGuards: [`guard_${suffix}`] });
    db.guards.push({ id: `guard_${suffix}`, employeeCode: `G-${suffix}`, name: `Guard ${suffix}`, nameGujarati: `Guard ${suffix}`, mobile: `private-phone-${suffix}`, village: 'Village', district: 'District', assignedSite: `site_${suffix}`, employmentStatus: 'ACTIVE', monthlySalary: 25000, preferredLanguage: 'gu', documentCount: 1, bank: { bankName: 'Private bank', accountNumber: `private-account-${suffix}`, ifscCode: 'PRIVATE' } });
    db.attendance.push({ id: `att_${suffix}`, guardId: `guard_${suffix}`, siteId: `site_${suffix}`, clientRecordId: `client_${suffix}`, type: 'SHIFT_START', photo: `evidence-${suffix}`, status: 'MANUAL_REVIEW', capturedAt: new Date().toISOString(), receivedAt: new Date().toISOString() });
    db.salaries.push({ id: `salary_${suffix}`, guardId: `guard_${suffix}`, month: 10, year: 2026, attendanceDays: 10, baseSalary: 25000, adjustments: 0, finalSalary: 25000, status: 'PENDING' });
    db.documents.push({ id: `doc_${suffix}`, guardId: `guard_${suffix}`, type: 'AADHAAR', originalName: `private-document-${suffix}.pdf`, storageKey: path.resolve('outside-uploads-fixture.pdf'), uploadedBy: 'admin', uploadedAt: new Date().toISOString() });
    db.incidents.push({ id: `incident_${suffix}`, guardId: `guard_${suffix}`, siteId: `site_${suffix}`, category: 'OTHER', description: '', status: 'OPEN', capturedAt: new Date().toISOString() });
    db.notifications.push({ id: `notice_${suffix}`, userId: `guard_user_${suffix}`, guardId: `guard_${suffix}`, title: 'Private', body: 'Private', status: 'UNREAD', createdAt: new Date().toISOString() });
  }
});

async function request(userId: string | undefined, url: string, method = 'GET', body?: unknown, claims: Record<string, unknown> = {}) {
  // Deliberately forged/stale authorization claims: DB identity must win.
  const token = userId ? jwt.sign({ id: userId, role: 'ADMIN', guardId: 'guard_b', assignedSiteIds: ['site_b'], ...claims }, process.env.JWT_ACCESS_SECRET!) : undefined;
  const response = await fetch(origin + url, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, headers: response.headers, data: text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text };
}

test('permission names are explicit and unknown roles/routes are denied', async () => {
  const admin = { id: 'admin', role: 'ADMIN' } as SessionUser;
  assert.ok(PERMISSIONS.every((permission) => hasPermission(admin, permission)));
  assert.equal(hasPermission({ ...admin, role: 'toString' as SessionUser['role'] }, 'USER_CREATE'), false);
  assert.equal(canReadPrivate({ ...admin, role: 'UNKNOWN' as SessionUser['role'] }, { userId: 'admin' }), false);
  assert.equal(canReadOperational({ id: 's', role: 'MAIN_SECURITY', name: '', email: '', assignedSiteIds: [] }, { siteId: 'site_a' }), false);
  assert.equal(matchRoutePolicy('POST', '/users/bulk-disable'), undefined);
  assert.equal((await request('admin', '/unregistered-bulk-api', 'POST', {})).status, 403);
  assert.equal((await request('admin', '/emergency-access', 'POST', { justification: 'Escalate', permission: 'SALARY_VIEW' })).status, 403);
});

test('anonymous, deleted, inactive and unsupported identities fail closed', async () => {
  assert.equal((await request(undefined, '/profiles/guard_user_a')).status, 401);
  assert.equal((await request('missing-user', '/sites')).status, 401);
  db.users.find((user) => user.id === 'guard_user_a')!.active = false;
  assert.equal((await request('guard_user_a', '/attendance/history')).status, 401);
  db.users.find((user) => user.id === 'guard_user_a')!.active = true;
  db.users.find((user) => user.id === 'guard_user_a')!.role = 'UNKNOWN' as SessionUser['role'];
  assert.equal((await request('guard_user_a', '/sites')).status, 401);
});

test('guards cannot read another profile/photo/document/salary or privileged APIs', async () => {
  for (const url of ['/profiles/guard_user_b', '/profiles/guard_b', '/users/guard_user_b/photo', '/guards/guard_b/photo', '/guards/guard_b', '/guards/guard_b/attendance', '/guards/guard_b/salary', '/guards/guard_b/documents', '/documents/doc_b/preview', '/documents/doc_a/download', '/audit', '/reports/attendance.csv', '/reports/salaries.csv']) {
    assert.equal((await request('guard_user_a', url)).status, 403, url);
  }
  for (const [url, method, body] of [
    ['/users', 'POST', {}], ['/users/supervisor', 'PATCH', { active: false }],
    ['/sites', 'POST', {}], ['/attendance/att_a/verify', 'PATCH', {}],
    ['/salaries/salary_a/mark-paid', 'POST', {}], ['/users/supervisor/access', 'PATCH', {}],
  ] as const) assert.equal((await request('guard_user_a', url, method, body)).status, 403, url);
  assert.ok(db.audits.some((item) => item.action === 'AUTHORIZATION_DENIED'));
  assert.equal(db.salaries[0].status, 'PENDING');
});

test('own guard reads retain shape without server storage paths', async () => {
  const profile = await request('guard_user_a', '/profiles/guard_user_a');
  assert.equal(profile.status, 200); assert.equal(profile.data.data.user.id, 'guard_user_a');
  assert.equal(profile.data.data.documents[0].id, 'doc_a');
  assert.equal(profile.data.data.documents[0].storageKey, undefined);
  const guard = await request('guard_user_a', '/guards/guard_a');
  assert.equal(guard.status, 200); assert.equal(guard.data.data.documents[0].storageKey, undefined);
  const salary = await request('guard_user_a', '/salaries?guardId=guard_b');
  assert.equal(salary.status, 200); assert.deepEqual(salary.data.data.salaries.map((item: { guardId: string }) => item.guardId), ['guard_a']);
});

test('supervisor scope applies to profiles, lists, reports and mutations', async () => {
  const profile = await request('supervisor', '/profiles/guard_user_a');
  assert.equal(profile.status, 200); assert.equal(profile.data.data.scope, 'OPERATIONS_ONLY');
  assert.equal(profile.data.data.profile.monthlySalary, undefined); assert.equal(profile.data.data.guard.bank, undefined);
  assert.deepEqual(profile.data.data.documents, []);
  for (const url of ['/profiles/guard_user_b', '/guards/guard_b/photo', '/guards/guard_a/salary', '/guards/guard_a/documents', '/documents', '/documents/doc_a/preview', '/documents/doc_a/download', '/salaries', '/audit', '/reports/salaries.csv', '/sites/site_b/guards']) assert.equal((await request('supervisor', url)).status, 403, url);
  const guards = await request('supervisor', '/guards'); assert.deepEqual(guards.data.data.guards.map((item: { id: string }) => item.id), ['guard_a']);
  assert.equal(guards.data.data.guards[0].monthlySalary, undefined);
  const attendance = await request('supervisor', '/attendance/history?guardId=guard_b'); assert.deepEqual(attendance.data.data.attendance, []);
  const csv = await request('supervisor', '/reports/attendance.csv'); assert.equal(csv.status, 200); assert.ok(csv.data.includes('Guard a')); assert.ok(!csv.data.includes('Guard b'));
  assert.equal((await request('supervisor', '/attendance/att_b/verify', 'PATCH', {})).status, 403);
  assert.equal((await request('supervisor', '/attendance/att_a/verify', 'PATCH', {})).status, 200);
  assert.equal(db.attendance.find((item) => item.id === 'att_b')!.status, 'MANUAL_REVIEW');
  const dashboard = await request('supervisor', '/dashboard'); assert.equal(dashboard.data.data.totalGuards, 1); assert.deepEqual(dashboard.data.data.activities, []);
});

test('missing guard association and unassigned supervisor never fall back to global queries', async () => {
  for (const url of ['/attendance/today', '/attendance/history', '/salaries']) assert.equal((await request('unlinked', url)).status, 403, url);
  assert.deepEqual((await request('unlinked', '/incidents')).data.data.incidents, []);
  assert.deepEqual((await request('unassigned', '/guards')).data.data.guards, []);
  assert.deepEqual((await request('unassigned', '/sites')).data.data.sites, []);
  assert.deepEqual((await request('unassigned', '/attendance/history')).data.data.attendance, []);
  assert.equal((await request('unassigned', '/profiles/guard_user_a')).status, 403);
  assert.equal((await request('unassigned', '/dashboard')).data.data.totalGuards, 0);
});

test('revoked assignments and downgraded roles take effect on the next request', async () => {
  assert.equal((await request('supervisor', '/profiles/guard_user_a')).status, 200);
  db.users.find((user) => user.id === 'supervisor')!.assignedSiteIds = [];
  assert.equal((await request('supervisor', '/profiles/guard_user_a')).status, 403);
  db.users.find((user) => user.id === 'admin')!.role = 'MAIN_SECURITY';
  assert.equal((await request('admin', '/audit')).status, 403);
});

test('attendance idempotency keys cannot disclose a different guard or event', async () => {
  const other = await request('guard_user_a', '/attendance/start', 'POST', { photo: 'evidence-b', clientRecordId: 'client_b' });
  assert.equal(other.status, 409); assert.equal(other.data.error, 'CLIENT_RECORD_CONFLICT'); assert.equal(other.data.data, undefined);
  const retry = await request('guard_user_a', '/attendance/start', 'POST', { photo: 'evidence-a', clientRecordId: 'client_a' });
  assert.equal(retry.status, 200); assert.equal(retry.data.data.duplicate, true);
  assert.equal((await request('guard_user_a', '/attendance/end', 'POST', { photo: 'evidence-a', clientRecordId: 'client_a' })).status, 409);
});

test('bulk notifications are recipient scoped and cannot read another guard notification', async () => {
  assert.equal((await request('guard_user_a', '/notifications/notice_b/read', 'PATCH', {})).status, 403);
  assert.equal((await request('guard_user_a', '/notifications/read-all', 'PATCH', {})).status, 200);
  assert.equal(db.notifications.find((item) => item.id === 'notice_a')!.status, 'READ');
  assert.equal(db.notifications.find((item) => item.id === 'notice_b')!.status, 'UNREAD');
  assert.deepEqual((await request('supervisor', '/notifications')).data.data.notifications, []);
});

test('admin-only assignment changes require justification, reject elevation and preserve revision/history', async () => {
  assert.equal((await request('supervisor', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['site_b'], expectedRevision: 0, justification: 'Self grant' })).status, 403);
  assert.equal((await request('admin', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['site_b'], expectedRevision: 0, justification: '' })).status, 400);
  assert.equal((await request('admin', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['missing'], expectedRevision: 0, justification: 'Coverage update' })).status, 400);
  assert.equal((await request('admin', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['site_b'], expectedRevision: 0, justification: 'Coverage update', permissions: ['SALARY_APPROVE'] })).status, 400);
  const valid = await request('admin', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['site_b'], expectedRevision: 0, justification: 'Coverage update' });
  assert.equal(valid.status, 200); assert.equal(valid.data.data.user.accessRevision, 1);
  assert.equal((await request('admin', '/users/supervisor/access', 'PATCH', { assignedSiteIds: ['site_a'], expectedRevision: 0, justification: 'Stale update' })).status, 409);
  assert.equal((await request('supervisor', '/profiles/guard_user_a')).status, 403);
  assert.equal((await request('supervisor', '/profiles/guard_user_b')).status, 200);
  const history = await request('admin', '/users/supervisor/access-history');
  const change = history.data.data.history.find((item: { action: string }) => item.action === 'ACCESS_CHANGED');
  assert.deepEqual(change.metadata.before.assignedSiteIds, ['site_a']); assert.deepEqual(change.metadata.after.assignedSiteIds, ['site_b']);
  assert.equal(change.metadata.justification, 'Coverage update'); assert.equal(change.actor, 'admin');
  assert.equal((await request('admin', '/users/admin/access', 'PATCH', { assignedSiteIds: [], expectedRevision: 0, justification: 'Admin boundary' })).status, 404);
});

test('admin boundaries and privileged request/success audits are preserved', async () => {
  assert.equal((await request('admin', '/users/admin', 'PATCH', { active: false })).status, 400);
  const paid = await request('admin', '/salaries/salary_a/mark-paid', 'POST', {}); assert.equal(paid.status, 200);
  assert.ok(db.audits.some((item) => item.action === 'SALARY_PAID' && item.actor === 'admin'));
  assert.equal((await request('admin', '/documents/doc_a/download')).status, 403, 'Stored paths outside uploads must be denied before any file access');
  const correction = await request('admin', '/salaries/salary_b/correct', 'POST', { finalSalary: 24000, reason: 'Approved correction' }); assert.equal(correction.status, 200);
  assert.ok(db.audits.some((item) => item.action === 'SALARY_CORRECTED' && item.metadata?.justification === 'Approved correction'));
  const audit = await request('admin', '/audit'); assert.equal(audit.status, 200); assert.equal(audit.headers.get('cache-control'), 'private, no-store');
  assert.ok(db.audits.some((item) => item.action === 'PRIVILEGED_OPERATION_REQUESTED'));
});

test('historical attendance and incidents follow record site rather than current guard assignment', async () => {
  db.guards.find((guard) => guard.id === 'guard_a')!.assignedSite = 'site_b';
  assert.equal((await request('supervisor', '/profiles/guard_user_a')).status, 403);
  const history = await request('supervisor', '/attendance/history');
  assert.deepEqual(history.data.data.attendance.map((item: { id: string }) => item.id), ['att_a']);
  assert.equal((await request('supervisor', '/attendance/att_a/verify', 'PATCH', {})).status, 200);
  assert.equal((await request('supervisor', '/incidents/incident_b', 'PATCH', { status: 'RESOLVED' })).status, 403);
  assert.equal(db.incidents.find((item) => item.id === 'incident_b')!.status, 'OPEN');
  assert.equal((await request('supervisor', '/incidents/incident_a', 'PATCH', { status: 'RESOLVED' })).status, 200);
});

test('malformed correction amounts are rejected without changing salaries', async () => {
  for (const amount of [true, null, [], {}, '', 'not-a-number']) {
    assert.equal((await request('admin', '/salaries/salary_a/correct', 'POST', { finalSalary: amount, reason: 'Reviewed correction' })).status, 400);
    assert.equal(db.salaries[0].finalSalary, 25000);
  }
});

test('identity/resource/audit dependency failures stop before the privileged handler', async () => {
  const unavailable = new Error('Synthetic unavailable dependency');
  const user: SessionUser = { id: 'admin', role: 'ADMIN', name: 'Admin', email: 'admin@example.test', preferredLanguage: 'gu' };
  const response = { setHeader() {}, status() { throw new Error('Unexpected status'); }, json() { throw new Error('Unexpected response'); } } as unknown as express.Response;
  for (const failure of ['resource', 'audit'] as const) {
    let nextError: unknown; let handlerReached = false;
    const authorize = createAuthorizationMiddleware({
      loadResource: async () => { if (failure === 'resource') throw unavailable; return { userId: 'admin' }; },
      audit: async () => { if (failure === 'audit') throw unavailable; },
    });
    await authorize({ method: 'GET', path: '/profiles/admin', user } as express.Request, response, ((error?: unknown) => { nextError = error; handlerReached = !error; }) as express.NextFunction);
    assert.equal(nextError, unavailable); assert.equal(handlerReached, false);
  }
  let authError: unknown;
  const authenticate = createRequireAuth({ verifyToken: () => ({ id: 'admin' }), findAccount: async () => { throw unavailable; } });
  await authenticate({ headers: { authorization: 'Bearer fixture' } } as express.Request, response, ((error?: unknown) => { authError = error; }) as express.NextFunction);
  assert.equal(authError, unavailable);
});

test('review cannot mutate verification or shift links belonging to another guard/site', async () => {
  const attendance = db.attendance.find((item) => item.id === 'att_a')!;
  attendance.type = 'RANDOM_VERIFICATION'; attendance.verificationRequestId = 'foreign_request'; attendance.shiftId = 'foreign_shift';
  db.verifications.push({ id: 'foreign_request', guardId: 'guard_b', siteId: 'site_b', shiftId: 'foreign_shift', status: 'SUBMITTED', notificationStatus: 'SUBMITTED', requestCreatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() });
  db.shifts.push({ id: 'foreign_shift', guardId: 'guard_b', siteId: 'site_b', status: 'ACTIVE', verificationCount: 0, startedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  assert.equal((await request('supervisor', '/attendance/att_a/verify', 'PATCH', {})).status, 200);
  assert.equal(db.verifications[0].status, 'SUBMITTED', 'In-scope attendance must not grant access through a foreign link');
  assert.equal(db.shifts[0].verificationCount, 0);
});

test('supervisor searches cannot infer private village fields excluded by serialization', async () => {
  db.guards[0].village = 'PrivateVillageA';
  const restricted = await request('supervisor', '/guards?search=PrivateVillageA');
  assert.equal(restricted.status, 200); assert.deepEqual(restricted.data.data.guards, []);
  const admin = await request('admin', '/guards?search=PrivateVillageA');
  assert.deepEqual(admin.data.data.guards.map((guard: { id: string }) => guard.id), ['guard_a']);
});

test('logout expires the cookie with the same secure cross-site attributes as login', async () => {
  const logout = await request(undefined, '/auth/logout', 'POST', {});
  assert.equal(logout.status, 200);
  const cookie = logout.headers.get('set-cookie')!;
  assert.match(cookie, /dg_access=;/); assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=None/);
});

test('legacy nullable identity fields are normalized without inventing grants', async () => {
  const middleware = createRequireAuth({ verifyToken: () => ({ id: 'legacy' }), findAccount: async () => ({ _id: 'legacy', role: 'MAIN_SECURITY', name: null, email: null, active: null, guardId: null, profilePhoto: null, preferredLanguage: null, assignedSiteIds: ['site_a', null, 1, 'site_a'] }) });
  const req = { headers: { authorization: 'Bearer fixture' } } as express.Request;
  let reached = false;
  await middleware(req, {} as express.Response, (() => { reached = true; }) as express.NextFunction);
  assert.equal(reached, true); assert.equal(req.user?.name, ''); assert.equal(req.user?.email, '');
  assert.equal(req.user?.guardId, undefined); assert.deepEqual(req.user?.assignedSiteIds, ['site_a']);
});

test('admin onboarding/login/assignment and guard attendance/incident flows retain contracts', async () => {
  const created = await request('admin', '/guards', 'POST', { name: 'Fixture Guard', employeeCode: 'FIXTURE-03', mobile: '9000000003', email: 'fixture-guard@example.test', temporaryPassword: 'fixture-password', assignedSite: 'site_a' });
  assert.equal(created.status, 201);
  const guardId = created.data.data.guard.id;
  const login = await request(undefined, '/auth/login', 'POST', { email: 'fixture-guard@example.test', password: 'fixture-password' });
  assert.equal(login.status, 200); assert.equal(login.data.data.user.role, 'GUARD'); assert.equal(login.data.data.user.guardId, guardId);
  const userId = login.data.data.user.id;
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const me = await fetch(origin + '/auth/me', { headers: { Cookie: cookie } });
  assert.equal(me.status, 200); assert.equal((await me.json()).data.user.id, userId);
  assert.deepEqual((await request(userId, '/sites')).data.data.sites.map((site: { id: string }) => site.id), ['site_a']);
  const start = await request(userId, '/attendance/start', 'POST', { clientRecordId: 'fixture-start', photo: 'fixture-image' });
  assert.equal(start.status, 201); assert.equal(start.data.data.attendance.status, 'MANUAL_REVIEW');
  assert.equal((await request('supervisor', `/attendance/${start.data.data.attendance.id}/verify`, 'PATCH', {})).status, 200);
  assert.equal((await request('admin', `/attendance/${start.data.data.attendance.id}/verify`, 'PATCH', {})).data.data.alreadyVerified, true);
  const incident = await request(userId, '/incidents', 'POST', { category: 'OTHER', description: 'Fixture report' });
  assert.equal(incident.status, 201); assert.equal(incident.data.data.incident.siteId, 'site_a');
  assert.equal((await request('supervisor', `/incidents/${incident.data.data.incident.id}`, 'PATCH', { status: 'RESOLVED' })).status, 200);
  assert.equal((await request(userId, `/guards/${guardId}/documents`)).status, 200);
  assert.equal((await request(userId, '/salaries')).status, 200);
  assert.equal((await request('supervisor', `/profiles/${userId}`)).status, 200);
  assert.equal((await request('admin', `/guards/${guardId}`, 'PATCH', { assignedSite: 'site_b' })).status, 200);
  assert.equal((await request('supervisor', `/profiles/${userId}`)).status, 403);
  assert.deepEqual((await request(userId, '/sites')).data.data.sites.map((site: { id: string }) => site.id), ['site_b']);
  assert.equal((await request(undefined, '/profiles/' + userId)).status, 401);
});

test('legacy non-guard guardId links never grant guard profile or document ownership', async () => {
  db.users.find((user) => user.id === 'supervisor')!.guardId = 'guard_b';
  const own = await request('supervisor', '/profiles/supervisor');
  assert.equal(own.status, 200); assert.equal(own.data.data.guard, undefined);
  assert.deepEqual(own.data.data.documents, []);
  assert.equal((await request('supervisor', '/profiles/guard_b')).status, 403);
  assert.equal((await request('supervisor', '/profiles/guard_user_b')).status, 403);
});
