import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { router } from '../server/route.js';
import { DocumentModel } from '../server/models/index.js';
import { db, resetMemory } from '../server/services/memory.js';
import { signAccessToken } from '../server/services/auth.js';
import type { SessionUser } from '../shared/types.js';

let server: Server; let base = '';
const identities: Record<string, SessionUser> = {
  ADMIN: { id: 'admin', role: 'ADMIN', name: 'Admin', email: 'admin@example.test' },
  MAIN_SECURITY: { id: 'supervisor', role: 'MAIN_SECURITY', name: 'Supervisor', email: 'supervisor@example.test', assignedSiteIds: ['site-a'] },
  GUARD: { id: 'user-a', role: 'GUARD', name: 'Guard A', email: 'a@example.test', guardId: 'guard-a' },
};
before(async () => {
  const app = express(); app.use(express.json()); app.use(router);
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); resetMemory(); });
beforeEach(() => {
  resetMemory();
  for (const identity of Object.values(identities)) db.users.push({ ...identity, passwordHash: 'unused-test-hash', active: true, preferredLanguage: 'en' });
  for (const letter of ['a', 'b']) {
    db.sites.push({ id: `site-${letter}`, siteCode: letter, siteName: `Site ${letter}`, siteType: 'STORE', status: 'ACTIVE', assignedGuards: [`guard-${letter}`] });
    db.guards.push({ id: `guard-${letter}`, name: `Guard ${letter}`, nameGujarati: `Guard ${letter}`, employeeCode: `DG000${letter === 'a' ? '1' : '2'}`, mobile: '9999999999', village: '', district: '', assignedSite: `site-${letter}`, employmentStatus: 'ACTIVE', monthlySalary: 24000, preferredLanguage: 'en', documentCount: 1, bank: { bankName: '', accountNumber: '', ifscCode: '' } });
    db.documents.push({ id: `doc-${letter}`, guardId: `guard-${letter}`, type: 'AADHAAR', originalName: `${letter}.pdf`, uploadedBy: 'admin', uploadedAt: '2026-10-01T00:00:00.000Z', status: 'PENDING' });
  }
});
async function request(role: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base + path, { method, headers: { authorization: `Bearer ${signAccessToken(identities[role])}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() as any };
}
const profile = { role: 'GUARD', fullName: 'New guard', mobile: '9999999999', alternateMobile: '8888888888', email: 'new@example.test', aadharNumber: '123456789012', bankName: 'Test bank', branchName: 'Test branch', bankAccountNumber: '1234567890', ifscCode: 'TEST000001', password: 'test-password', confirmPassword: 'test-password', assignedSite: 'site-a', dutyShift: 'NIGHT', photoRate: '125.50' };

test('supervisor creates a guard with a shift and rate in an assigned site', async () => {
  const response = await request('MAIN_SECURITY', '/users', 'POST', profile);
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const guard = db.guards.find((g) => g.name === 'New guard')!;
  assert.equal(guard.dutyShift, 'NIGHT'); assert.equal(guard.photoRate, 125.5);
  assert.equal(guard.photoPolicyHistory?.length, 1); assert.equal(guard.photoPolicyHistory?.[0].siteId, 'site-a');
});
test('supervisor cannot create another supervisor or a guard in another site', async () => {
  assert.equal((await request('MAIN_SECURITY', '/users', 'POST', { ...profile, role: 'MAIN_SECURITY' })).status, 403);
  assert.equal((await request('MAIN_SECURITY', '/users', 'POST', { ...profile, assignedSite: 'site-b' })).status, 403);
  assert.equal(db.guards.length, 2);
});
test('guard creation requires an explicit site, shift and paise-precision rate', async () => {
  assert.equal((await request('ADMIN', '/users', 'POST', { ...profile, photoRate: undefined })).status, 400);
  assert.equal((await request('ADMIN', '/users', 'POST', { ...profile, dutyShift: undefined })).status, 400);
  assert.equal((await request('ADMIN', '/users', 'POST', { ...profile, photoRate: '0.333' })).status, 400);
  assert.equal(db.guards.length, 2);
});
test('supervisor may configure an existing assigned guard but cannot transfer out of scope', async () => {
  assert.equal((await request('MAIN_SECURITY', '/guards/guard-a', 'PATCH', { dutyShift: 'DAY', photoRate: '100' })).status, 200);
  assert.equal(db.guards[0].photoRate, 100);
  const oldPolicies = JSON.stringify(db.guards[0].photoPolicyHistory);
  assert.equal((await request('MAIN_SECURITY', '/guards/guard-a', 'PATCH', { assignedSite: 'site-b' })).status, 403);
  assert.equal(db.guards[0].assignedSite, 'site-a'); assert.equal(JSON.stringify(db.guards[0].photoPolicyHistory), oldPolicies);
  assert.equal((await request('MAIN_SECURITY', '/guards/guard-b', 'PATCH', { photoRate: '200' })).status, 403);
  assert.equal(db.guards[1].photoRate, undefined);
});
test('supervisor document lists are scoped before both paginated and unpaginated responses', async () => {
  for (const suffix of ['', '?page=1&pageSize=20']) {
    const response = await request('MAIN_SECURITY', `/documents${suffix}`);
    assert.equal(response.status, 200); assert.deepEqual(response.data.data.documents.map((d: any) => d.id), ['doc-a']);
  }
  assert.equal((await request('MAIN_SECURITY', '/documents?guardId=guard-b&page=1&pageSize=20')).status, 403);
});
test('manager-added documents are approved without a review action', async () => {
  assert.equal(new DocumentModel({ _id: 'model-only-test' }).status, 'APPROVED');
  const response = await request('MAIN_SECURITY', '/guards/guard-a/documents');
  assert.equal(response.status, 200); assert.equal(response.data.data.documents[0].status, 'APPROVED');
  assert.equal((await request('MAIN_SECURITY', '/guards/guard-b/documents')).status, 403);
});
test('guard cannot alter their profile or documents through the actual API router', async () => {
  assert.equal((await request('GUARD', '/guards/guard-a', 'PATCH', { photoRate: 999 })).status, 403);
  assert.equal((await request('GUARD', '/guards/guard-a/documents', 'POST', {})).status, 403);
  assert.equal(db.guards[0].photoRate, undefined); assert.equal(db.documents.length, 2);
});
