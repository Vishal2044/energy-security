import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import { encode } from 'jpeg-js';
import type { Server } from 'node:http';
import { dutyDay, monthDutyDays, photoSalary, type DutyPhoto, type PhotoPolicy } from '../shared/photoDuty.js';
import { canManageGuard, canReadDocument } from '../shared/permissions.js';
import { createAuthorizationMiddleware } from '../server/authorization/middleware.js';
import { photoDutyRouter } from '../server/photoDutyRoutes.js';
import { currentPhotoDuty, newPhotoPolicy, photoPayroll } from '../server/services/photoDuty.js';
import { db, resetMemory } from '../server/services/memory.js';
import type { SessionUser } from '../shared/types.js';

const policy: PhotoPolicy = { effectiveFrom: '2026-10-01', configuredAt: '2026-10-01T00:00:00+05:30', shiftType: 'DAY', photoRate: 100, siteId: 'site-a', active: true };
const instant = (time: string) => new Date(`2026-10-13T${time}+05:30`);
const photo = (index: number, date = '2026-10-13', rate = 100): DutyPhoto => ({ id: `photo-${date}-${index}`, guardId: 'guard-a', siteId: 'site-a', businessDate: date, slotIndex: index, photoRate: rate, capturedAt: instant('08:15:00').toISOString() });

test('day shift has exactly four IST slots with two-hour windows', () => {
  const day = dutyDay('guard-a', '2026-10-13', policy, [], instant('07:59:59'));
  assert.deepEqual(day.slots.map((s) => new Date(s.opensAt).getUTCHours()), [2, 6, 10, 14]);
  assert(day.slots.every((s) => new Date(s.closesAt).getTime() - new Date(s.opensAt).getTime() === 7200000));
  assert(day.slots.every((s) => s.status === 'UPCOMING'));
});
test('window includes 08:00, excludes 10:00, and excludes early capture', () => {
  assert.equal(dutyDay('guard-a', '2026-10-13', policy, [], instant('07:59:59')).slots[0].status, 'UPCOMING');
  assert.equal(dutyDay('guard-a', '2026-10-13', policy, [], instant('08:00:00')).slots[0].status, 'OPEN');
  assert.equal(dutyDay('guard-a', '2026-10-13', policy, [], instant('09:59:59')).slots[0].status, 'OPEN');
  assert.equal(dutyDay('guard-a', '2026-10-13', policy, [], instant('10:00:00')).slots[0].status, 'MISSED');
});
test('night duty remains on its starting business date across midnight', () => {
  const day = dutyDay('guard-a', '2026-10-13', { ...policy, shiftType: 'NIGHT' }, [], new Date('2026-10-14T00:15:00+05:30'));
  assert.equal(day.businessDate, '2026-10-13');
  assert.equal(day.slots[1].status, 'OPEN');
  assert.equal(day.slots[3].opensAt, '2026-10-14T02:30:00.000Z');
});
test('evening photo remains open until 22:00 for both shifts', () => {
  for (const shiftType of ['DAY', 'NIGHT'] as const) {
    const slotIndex = shiftType === 'DAY' ? 3 : 0;
    const slot = (time: string) => dutyDay('guard-a', '2026-10-13', { ...policy, shiftType }, [], instant(time)).slots[slotIndex];
    assert.equal(slot('19:59:59').status, 'UPCOMING');
    assert.equal(slot('20:00:00').status, 'OPEN');
    assert.equal(slot('21:59:59').status, 'OPEN');
    assert.equal(slot('22:00:00').status, 'MISSED');
  }
});
test('four, three, and zero photos produce 400, 300, and 0 earnings', () => {
  const now = instant('22:00:00');
  const full = dutyDay('guard-a', '2026-10-13', policy, [0, 1, 2, 3].map((i) => photo(i)), now);
  const partial = dutyDay('guard-a', '2026-10-13', policy, [0, 1, 2].map((i) => photo(i)), now);
  const absent = dutyDay('guard-a', '2026-10-13', policy, [], now);
  assert.deepEqual([full.earnings, full.deduction, full.status], [400, 0, 'PRESENT']);
  assert.deepEqual([partial.earnings, partial.deduction, partial.status], [300, 100, 'PARTIAL']);
  assert.deepEqual([absent.earnings, absent.deduction, absent.status], [0, 400, 'ABSENT']);
});
test('missed first photo does not prevent later photos earning their rate', () => {
  const day = dutyDay('guard-a', '2026-10-13', policy, [photo(1), photo(2), photo(3)], instant('22:00:00'));
  assert.equal(day.slots[0].status, 'MISSED'); assert.equal(day.earnings, 300);
});
test('future slots are not deducted, and a shift is not absent before it closes', () => {
  const day = dutyDay('guard-a', '2026-10-13', policy, [], instant('10:00:00'));
  assert.equal(day.deduction, 100); assert.equal(day.status, 'SCHEDULED');
});
test('onboarding mid-window allows capture without penalizing earlier closed windows', () => {
  const day = dutyDay('guard-a', '2026-10-13', { ...policy, configuredAt: instant('12:15:00').toISOString() }, [], instant('12:30:00'));
  assert.equal(day.slots[0].status, 'NOT_REQUIRED'); assert.equal(day.slots[1].status, 'OPEN'); assert.equal(day.deduction, 0);
});
test('a duplicate slot in input is counted once; another guard photo is ignored', () => {
  const day = dutyDay('guard-a', '2026-10-13', policy, [photo(0), photo(0), { ...photo(1), guardId: 'another' }], instant('22:00:00'));
  assert.equal(day.receivedPhotos, 1); assert.equal(day.earnings, 100);
});
test('rate changes apply to future duty dates and retain captured rate snapshots', () => {
  const policies = newPhotoPolicy({ siteId: 'site-a', shiftType: 'DAY', photoRate: 150 }, instant('13:00:00'), [policy]);
  assert.equal(policies[1].effectiveFrom, '2026-10-14');
  const days = monthDutyDays('guard-a', 10, 2026, policies, [photo(0), photo(0, '2026-10-14', 150)], new Date('2026-10-14T09:00:00+05:30'));
  assert.equal(days.find((d) => d.businessDate === '2026-10-13')?.earnings, 100);
  assert.equal(days.find((d) => d.businessDate === '2026-10-14')?.earnings, 150);
});
test('unconfigured guards and inactive future policies have no automatic deductions', () => {
  assert.deepEqual(monthDutyDays('guard-a', 10, 2026, [], [], instant('22:00:00')), []);
  assert.equal(dutyDay('guard-a', '2026-10-13', { ...policy, active: false }, [], instant('22:00:00')).requiredPhotos, 0);
});
test('monthly work counts distinguish partial days from full attendance', () => {
  const days = [dutyDay('guard-a', '2026-10-13', policy, [photo(0), photo(1), photo(2)], instant('22:00:00')), dutyDay('guard-a', '2026-10-12', policy, [], instant('22:00:00'))];
  const salary = photoSalary('guard-a', 10, 2026, days, instant('22:00:00'));
  assert.equal(salary.netPayable, 300); assert.equal(salary.attendanceDays, 1); assert.equal(salary.partialDays, 1); assert.equal(salary.absentDays, 1); assert.equal(salary.deductions, 500);
});
test('fractional rates are calculated in integer paise', () => {
  const day = dutyDay('guard-a', '2026-10-13', { ...policy, photoRate: 100.1 }, [0, 1, 2].map((i) => photo(i, '2026-10-13', 100.1)), instant('22:00:00'));
  assert.equal(day.earnings, 300.3); assert.equal(day.deduction, 100.1);
  assert.equal(photoSalary('guard-a', 10, 2026, [day], instant('22:00:00')).baseSalary, 400.4);
});
test('month payment waits for final overnight window at 10:00 next month', () => {
  assert.equal(photoSalary('guard-a', 10, 2026, [], new Date('2026-11-01T09:59:59+05:30')).periodClosed, false);
  assert.equal(photoSalary('guard-a', 10, 2026, [], new Date('2026-11-01T10:00:00+05:30')).periodClosed, true);
});

const admin: SessionUser = { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' };
const supervisor: SessionUser = { id: 'supervisor', name: 'Supervisor', email: 'supervisor@example.test', role: 'MAIN_SECURITY', assignedSiteIds: ['site-a'] };
const guardUser: SessionUser = { id: 'user-a', name: 'Guard', email: 'guard@example.test', role: 'GUARD', guardId: 'guard-a' };
test('supervisors maintain only assigned-site guard documents and profiles', () => {
  assert.equal(canManageGuard(supervisor, { siteId: 'site-a' }), true);
  assert.equal(canReadDocument(supervisor, { guardId: 'guard-a', siteId: 'site-a' }), true);
  assert.equal(canManageGuard(supervisor, { siteId: 'site-b' }), false);
  assert.equal(canReadDocument(supervisor, { guardId: 'guard-b', siteId: 'site-b' }), false);
  assert.equal(canManageGuard(guardUser, { siteId: 'site-a' }), false);
});

let server: Server; let base = '';
before(async () => {
  const app = express(); app.use(express.json({ limit: '12mb' }));
  app.use((req, _res, next) => { req.user = req.get('x-test-role') === 'ADMIN' ? admin : req.get('x-test-role') === 'MAIN_SECURITY' ? supervisor : guardUser; next(); });
  app.use(createAuthorizationMiddleware({ audit: async () => undefined, loadResource: async (kind, id) => {
    if (kind === 'attendance') { const item = db.attendance.find((r) => r.id === id); return item ? { guardId: item.guardId, siteId: item.siteId } : undefined; }
    const guard = db.guards.find((g) => g.id === id); return guard ? { guardId: id, siteId: guard.assignedSite } : undefined;
  } }));
  app.use(photoDutyRouter); app.use((_req, res) => res.status(404).json({ success: false }));
  server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); resetMemory(); });
function fixtures() {
  resetMemory();
  db.sites.push({ id: 'site-a', siteCode: 'A', siteName: 'Site A', siteType: 'STORE', status: 'ACTIVE', assignedGuards: ['guard-a'] });
  db.guards.push({ id: 'guard-a', name: 'Guard A', nameGujarati: 'Guard A', employeeCode: 'A', mobile: '9999999999', village: '', district: '', assignedSite: 'site-a', employmentStatus: 'ACTIVE', monthlySalary: 0, documentCount: 0, preferredLanguage: 'en', bank: { bankName: '', accountNumber: '', ifscCode: '' }, dutyShift: 'DAY', photoRate: 100, photoPolicyHistory: [policy] });
}
async function request(path: string, method = 'GET', body?: unknown, role = 'GUARD') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-test-role': role }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() as any };
}
const jpeg = `data:image/jpeg;base64,${encode({ width: 256, height: 256, data: new Uint8Array(256 * 256 * 4).fill(180) }, 80).data.toString('base64')}`;

test('guard server rejects all other write actions, including documents and incidents', async () => {
  for (const path of ['/incidents', '/guards/guard-a/documents', '/rosters/one/acknowledge', '/auth/change-password', '/leave-requests', '/overtime', '/notifications/preferences']) {
    const response = await request(path, path === '/notifications/preferences' ? 'PATCH' : 'POST', {}); assert.equal(response.status, 403, path);
  }
});
test('retired attendance and document verification APIs are denied for managers', async () => {
  for (const path of ['/attendance/one/verify', '/attendance/one/reject', '/documents/one/review']) assert.equal((await request(path, 'PATCH', {}, 'ADMIN')).status, 403);
});
test('capture session is available only inside a slot and only to a guard', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('07:59:59') });
  assert.equal((await request('/photo-duty/capture-session', 'POST', {})).status, 409);
  t.mock.timers.setTime(instant('08:15:00').getTime());
  assert.equal((await request('/photo-duty/capture-session', 'POST', {})).status, 200);
  assert.equal((await request('/photo-duty/capture-session', 'POST', {}, 'ADMIN')).status, 403);
  t.mock.timers.setTime(instant('09:30:00').getTime());
  const secondHourSession = await request('/photo-duty/capture-session', 'POST', {});
  assert.equal(secondHourSession.status, 200);
  assert.equal((await request('/photo-duty/capture', 'POST', { photo: jpeg, captureToken: secondHourSession.data.data.captureToken, clientRecordId: 'd51e491e-c7d6-4f12-9098-fc4a35819935' })).status, 201);
  t.mock.timers.setTime(instant('10:00:00').getTime());
  assert.equal((await request('/photo-duty/capture-session', 'POST', {})).status, 409);
});
test('same capture retry earns once, and a second photo cannot replace the slot', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('08:15:00') });
  const session = await request('/photo-duty/capture-session', 'POST', {});
  const body = { photo: jpeg, captureToken: session.data.data.captureToken, clientRecordId: 'd51e491e-c7d6-4f12-9098-fc4a35819935' };
  assert.equal((await request('/photo-duty/capture', 'POST', body)).status, 201);
  assert.equal((await request('/photo-duty/capture', 'POST', body)).status, 200);
  assert.equal((await request('/photo-duty/capture', 'POST', { ...body, clientRecordId: 'd51e491e-c7d6-4f12-9098-fc4a35819936' })).status, 409);
  assert.equal(db.attendance.length, 1);
  assert.equal((await photoPayroll(db.guards, instant('22:00:00')))[0].netPayable, 100);
});
test('client-supplied date, slot, rate and invalid token cannot bypass capture policy', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('08:15:00') });
  const session = await request('/photo-duty/capture-session', 'POST', {});
  const body = { photo: jpeg, captureToken: session.data.data.captureToken, clientRecordId: 'd51e491e-c7d6-4f12-9098-fc4a35819935' };
  assert.equal((await request('/photo-duty/capture', 'POST', { ...body, photoRate: 999 })).status, 400);
  assert.equal((await request('/photo-duty/capture', 'POST', { ...body, captureToken: 'forged' })).status, 409);
  t.mock.timers.setTime(instant('08:18:00').getTime());
  assert.equal((await request('/photo-duty/capture', 'POST', body)).status, 409);
  assert.equal(db.attendance.length, 0);
});
test('invalid JPEG pixels cannot earn attendance even with a valid session', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('08:15:00') });
  const session = await request('/photo-duty/capture-session', 'POST', {});
  const invalid = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x00, 0x01, 0x00, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
  const body = { photo: `data:image/jpeg;base64,${invalid.toString('base64')}`, captureToken: session.data.data.captureToken, clientRecordId: 'd51e491e-c7d6-4f12-9098-fc4a35819935' };
  assert.equal((await request('/photo-duty/capture', 'POST', body)).status, 400); assert.equal(db.attendance.length, 0);
});
test('concurrent submissions for a slot create only one payable record', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('08:15:00') });
  const session = await request('/photo-duty/capture-session', 'POST', {});
  const responses = await Promise.all(['d51e491e-c7d6-4f12-9098-fc4a35819935', 'd51e491e-c7d6-4f12-9098-fc4a35819936'].map((clientRecordId) => request('/photo-duty/capture', 'POST', { photo: jpeg, captureToken: session.data.data.captureToken, clientRecordId })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]); assert.equal(db.attendance.length, 1);
});
test('an open payroll month cannot be marked credited', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('22:00:00') });
  assert.equal((await request('/photo-payroll/credit/photo_guard-a_2026_10', 'POST', { paymentReference: 'BANK-TEST' }, 'ADMIN')).status, 409);
  assert.equal(db.photoPayroll.length, 0);
});
test('another guard cannot read the evidence URL or payroll', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: instant('08:15:00') });
  db.attendance.push({ id: 'private-photo', type: 'DUTY_PHOTO', status: 'RECORDED', guardId: 'guard-b', siteId: 'site-b', capturedAt: instant('08:00:00').toISOString(), receivedAt: instant('08:00:00').toISOString(), photo: jpeg });
  assert.equal((await request('/photo-duty/photo/private-photo')).status, 403);
  assert.deepEqual((await request('/photo-payroll?guardId=guard-b')).data.data.salaries, []);
});
test('night current duty resolves yesterday at midnight and month boundary', async () => {
  fixtures(); db.guards[0].photoPolicyHistory = [{ ...policy, shiftType: 'NIGHT' }];
  const current = await currentPhotoDuty(db.guards[0], new Date('2026-11-01T00:15:00+05:30'));
  assert.equal(current.day?.businessDate, '2026-10-31'); assert.equal(current.day?.slots[1].status, 'OPEN');
});
test('credited payroll snapshot is immutable and credit remains admin-only', async (t) => {
  fixtures(); t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T10:00:00+05:30') });
  db.attendance.push({ ...photo(0), id: 'earned-october-photo', type: 'DUTY_PHOTO', status: 'RECORDED', receivedAt: instant('08:15:00').toISOString() });
  const id = 'photo_guard-a_2026_10';
  assert.equal((await request(`/photo-payroll/credit/${id}`, 'POST', { paymentReference: 'BANK-TEST' }, 'MAIN_SECURITY')).status, 403);
  assert.equal((await request(`/photo-payroll/credit/${id}`, 'POST', { paymentReference: 'BANK-TEST' }, 'ADMIN')).status, 200);
  assert.equal((await request(`/photo-payroll/credit/${id}`, 'POST', { paymentReference: 'BANK-TEST' }, 'ADMIN')).status, 409);
  const savedAmount = db.photoPayroll[0].snapshot.netPayable;
  assert.equal(savedAmount, 100);
  db.guards[0].photoPolicyHistory![0].photoRate = 500;
  const salaries = await photoPayroll(db.guards, new Date('2026-11-01T10:00:00+05:30'));
  assert.equal(salaries.find((s) => s.id === id)?.netPayable, savedAmount);
  assert.equal(salaries.find((s) => s.id === id)?.status, 'PAID');
});
