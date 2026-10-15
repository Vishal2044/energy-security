import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { PNG } from 'pngjs';
import { env } from './config/env.js';
import * as models from './models/index.js';
import { analyzeAttendancePhoto } from './services/imageAnalysis.js';
import { indiaBusinessDate } from '../shared/time.js';

// Additive, restartable fixtures. Never call the application's reset seed.
const prefix = 'demo_duty_20261012_';
const managerId = `${prefix}manager`;
const mediaDir = path.resolve('uploads/duty-demo-20261012');
const reportPath = path.join(mediaDir, 'report.json');
const credentialPath = path.join(mediaDir, 'credentials.json');
const apply = process.argv.includes('--run');
const verify = process.argv.includes('--verify');
type Fixture = Record<string, any> & { _id: string };
const groups = new Map<mongoose.Model<any>, Fixture[]>();
function add(model: mongoose.Model<any>, record: Fixture) {
  groups.set(model, [...(groups.get(model) ?? []), record]);
  return record;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const localTime = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+05:30`);
const afterHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3600000);

// Clearly synthetic PNG cards, with DEMO lettering and unique pattern per record.
function demoImage(key: string) {
  const png = new PNG({ width: 160, height: 100 });
  const hash = createHash('sha256').update(key).digest();
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const offset = (y * png.width + x) * 4;
    const bit = (hash[Math.floor(x / 10) % 32] >> (Math.floor(y / 10) % 8)) & 1;
    png.data[offset] = bit ? 35 : 70;
    png.data[offset + 1] = bit ? 70 : 110;
    png.data[offset + 2] = 140 + hash[(x + y) % 32] % 60;
    png.data[offset + 3] = 255;
  }
  const letters = ['1111010001100011000111110', '1111110000111101000011111', '1000111011101011000110001', '0111010001100011000101110'];
  letters.forEach((letter, index) => [...letter].forEach((pixel, cell) => {
    if (pixel !== '1') return;
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) {
      const offset = ((35 + Math.floor(cell / 5) * 5 + dy) * png.width + 20 + index * 30 + cell % 5 * 5 + dx) * 4;
      png.data.fill(255, offset, offset + 4);
    }
  }));
  return PNG.sync.write(png);
}
const imageData = (key: string) => `data:image/png;base64,${demoImage(key).toString('base64')}`;

async function main() {
  if (env.nodeEnv === 'production' || !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(env.mongoUri)) {
    throw new Error('This fixture script only permits the configured local development MongoDB.');
  }
  await mongoose.connect(env.mongoUri, { autoIndex: false, serverSelectionTimeoutMS: 8000 });
  const admin: any = await models.UserModel.findOne({ role: 'ADMIN', active: { $ne: false } }).lean();
  assert(admin, 'An existing admin is required; this script never creates or replaces admins.');
  assert.equal(await models.UserModel.countDocuments({ role: 'MAIN_SECURITY', _id: { $ne: managerId } }), 0,
    'Another manager exists. Stop rather than create a second manager or modify the existing one.');
  let credentials: { password: string; managerEmail: string; guardEmails: string[] };
  try { credentials = JSON.parse(await fs.readFile(credentialPath, 'utf8')); }
  catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    credentials = { password: `Demo-${randomBytes(12).toString('base64url')}`, managerEmail: 'duty.manager@demo.dgenergy.local', guardEmails: [] };
  }
  const passwordHash = await bcrypt.hash(credentials.password, 10);
  const sites: Fixture[] = [];
  for (let index = 1; index <= 12; index++) {
    const store = index > 10;
    sites.push(add(models.SiteModel, {
      _id: `${prefix}site_${index}`, siteCode: `DEMO-${store ? 'STORE' : 'WIND'}-${String(store ? index - 10 : index).padStart(2, '0')}`,
      siteName: `Demo ${store ? 'Store' : 'Windmill'} ${store ? index - 10 : index}`,
      siteType: store ? 'STORE' : 'WIND', status: 'ACTIVE', assignedGuards: [],
      district: 'Kutch', subDistrict: 'Bhuj', village: 'Demo village',
      farmerAddress: store ? undefined : 'Dummy farmer address, Kutch',
      siteAddress: 'Dummy test location, Kutch, Gujarat', clientName: 'Demo Energy',
      description: 'Synthetic salary and duty testing fixture; not a real location.',
      approvedGuardStrength: store ? 5 : 1, requiredShiftCoverage: store ? 5 : 1,
      reportingInstructions: 'Demo image upload; manual supervisor review.',
    }));
  }
  add(models.UserModel, { _id: managerId, email: credentials.managerEmail, passwordHash,
    name: 'Demo Site Manager', role: 'MAIN_SECURITY', active: true, preferredLanguage: 'gu',
    assignedSiteIds: sites.map(site => site._id), accessRevision: 1,
    profilePhoto: path.join(mediaDir, 'manager.png') });
  const names = ['જયેશ પટેલ', 'રમેશ પરમાર', 'મહેશ જાડેજા', 'સંજય ગોહિલ', 'વિજય સોલંકી', 'મુકેશ રાઠોડ', 'હિતેશ ચૌહાણ', 'દિનેશ વાઘેલા', 'સુરેશ મકવાણા', 'કિરણ શાહ', 'અજય પટેલ', 'ભરત પરમાર', 'ચિરાગ જાડેજા', 'દીપક ગોહિલ', 'અશોક સોલંકી', 'નરેશ રાઠોડ', 'પ્રકાશ ચૌહાણ', 'રાજેશ વાઘેલા', 'ઉમેશ મકવાણા', 'યોગેશ શાહ'];
  const salaryReport: any[] = [];
  const incidents: Fixture[] = [];
  const today = indiaBusinessDate(new Date());
  // Stable history so later reruns never invent newly completed duties.
  const now = localTime('2026-10-12', 0);
  assert(today >= '2026-10-12', 'Fixtures cannot precede their approved date.');
  const attendances: Fixture[] = [];
  for (let index = 1; index <= 20; index++) {
    const site = sites[index <= 10 ? index - 1 : index <= 15 ? 10 : 11];
    const hours = index >= 8 && index <= 10 ? 24 : 12;
    // Store 1: 3 day + 2 night; Store 2: 2 day + 3 night, all unique.
    const night = index > 10 && (index >= 14 && index <= 15 || index >= 18);
    const guardId = `${prefix}guard_${String(index).padStart(2, '0')}`;
    const userId = `${prefix}user_${String(index).padStart(2, '0')}`;
    const email = `duty.guard${String(index).padStart(2, '0')}@demo.dgenergy.local`;
    const monthlySalary = hours === 24 ? 36000 : 24000;
    const absentDays = index % 3 === 1 ? [] : index % 3 === 2 ? [7, 21] : [5, 12, 20, 27];
    site.assignedGuards.push(guardId);
    const profilePhoto = path.join(mediaDir, `guard-${index}.png`);
    add(models.GuardModel, { _id: guardId, userId, employeeCode: `DEMO-G${String(index).padStart(2, '0')}`,
      name: `Demo Guard ${String(index).padStart(2, '0')}`, nameGujarati: names[index - 1],
      mobile: `000000${String(index).padStart(4, '0')}`, assignedSite: site._id,
      village: 'Demo village', district: 'Kutch', address: 'Synthetic test address',
      joiningDate: localTime('2026-09-01', 0), employmentStatus: 'ACTIVE', employmentType: 'FULL_TIME',
      monthlySalary, preferredLanguage: 'gu', profilePhoto, documentCount: 0,
      bank: { accountHolderName: `Demo Guard ${index}`, bankName: 'Demo bank', accountNumber: `DEMOONLY${index}`, ifscCode: 'DEMO0000000' },
      policeVerificationStatus: 'PENDING', skills: ['Demo duty testing'] });
    add(models.UserModel, { _id: userId, email, passwordHash, name: `Demo Guard ${String(index).padStart(2, '0')}`,
      role: 'GUARD', guardId, active: true, preferredLanguage: 'gu', profilePhoto });
    const guardAttendance: Fixture[] = [];
    for (const month of [9, 10]) for (let day = 1; day <= (month === 9 ? 30 : 18); day++) {
      const date = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const startAt = localTime(date, night ? 19 : 7);
      const endAt = afterHours(startAt, hours);
      const past = endAt < now;
      const absent = past && (month === 9 ? absentDays.includes(day) : index % 3 !== 1 && day === 5);
      const key = `${guardId}_${date}`;
      const roster = add(models.RosterModel, { _id: `${key}_roster`, guardId, siteId: site._id,
        businessDate: date, shiftType: hours === 24 ? '24H' : night ? 'NIGHT' : 'DAY', startAt, endAt,
        overnight: hours === 24 || night, weeklyOff: false,
        status: past && !absent ? 'COMPLETED' : 'SCHEDULED',
        dutyStatus: absent ? 'ABSENT' : past ? 'PRESENT' : 'SCHEDULED', assignedBy: managerId,
        notes: `DEMO ${hours}h ${night ? 'night' : 'day'} duty${absent ? '; absent, no attendance submitted' : ''}`,
        handoverNotes: past && !absent ? 'Demo handover completed; equipment checked.' : undefined });
      if (!past || absent) continue;
      const shiftId = `${key}_shift`;
      const eventSpecs = [ { type: 'SHIFT_START', at: startAt, suffix: 'start' },
        { type: 'RANDOM_VERIFICATION', at: afterHours(startAt, hours / 2), suffix: 'verify' },
        { type: 'SHIFT_END', at: endAt, suffix: 'end' } ];
      const requestId = `${key}_request`;
      add(models.VerificationRequestModel, { _id: requestId, guardId, siteId: site._id, shiftId,
        requestCreatedAt: afterHours(startAt, hours / 2 - 0.1), notificationSentAt: afterHours(startAt, hours / 2 - 0.1),
        notificationOpenedAt: afterHours(startAt, hours / 2 - 0.05), verificationSubmittedAt: eventSpecs[1].at,
        expiresAt: afterHours(startAt, hours / 2 + 0.5), status: 'VERIFIED', notificationStatus: 'OPENED' });
      for (const event of eventSpecs) {
        const photo = imageData(`${key}_${event.suffix}`);
        const verifiedAt = afterHours(event.at, 0.05);
        const record = add(models.AttendanceModel, { _id: `${key}_${event.suffix}`, clientRecordId: `${key}_${event.suffix}`,
          guardId, siteId: site._id, shiftId, type: event.type, photo, ...analyzeAttendancePhoto(photo),
          capturedAt: event.at, capturedAtClient: event.at, receivedAt: event.at,
          status: 'VERIFIED', verificationStatus: 'verified', verifiedAt, verifiedBy: managerId,
          verificationRequestId: event.suffix === 'verify' ? requestId : undefined,
          notes: 'DEMO synthetic evidence, simulated manual supervisor approval', reviewFlags: [], similarPhotoMatches: [] });
        guardAttendance.push(record); attendances.push(record);
      }
      add(models.ShiftModel, { _id: shiftId, guardId, siteId: site._id, startedAt: startAt, endedAt: endAt,
        status: 'COMPLETED', startAttendanceId: `${key}_start`, endAttendanceId: `${key}_end`, verificationCount: 1 });
      if (month === 10 && day === 3 && (index <= 10 || index === 11 || index === 16)) {
        const capturedAt = afterHours(startAt, 2);
        const acknowledgedAt = afterHours(capturedAt, 1);
        const resolved = index % 3 === 0;
        const acknowledged = resolved || index % 3 === 2;
        const category = ['LOCK_DAMAGE', 'FENCE_DAMAGE', 'SUSPICIOUS_ACTIVITY'][index % 3];
        const activity = [{ type: 'CREATED', actorId: userId, at: capturedAt.toISOString(), note: 'Demo incident reported during duty.' }];
        if (acknowledged) activity.push({ type: 'STATUS_ACKNOWLEDGED', actorId: managerId, at: acknowledgedAt.toISOString(), note: 'Demo manager inspected report.' });
        if (resolved) activity.push({ type: 'STATUS_RESOLVED', actorId: managerId, at: afterHours(capturedAt, 3).toISOString(), note: 'Demo repair completed and evidence reviewed.' });
        incidents.push(add(models.IncidentModel, { _id: `${prefix}incident_${index}`, guardId, siteId: site._id, shiftId,
          category, severity: acknowledged ? 'MEDIUM' : 'HIGH', priority: acknowledged ? 'NORMAL' : 'HIGH',
          description: `DEMO: Guard ${index} reported ${category.toLowerCase().replaceAll('_', ' ')} at ${site.siteName} during assigned duty.`,
          photo: imageData(`incident-${index}`), capturedAt, status: resolved ? 'RESOLVED' : acknowledged ? 'ACKNOWLEDGED' : 'OPEN',
          assignedOfficerId: managerId, activity, acknowledgedAt: acknowledged ? acknowledgedAt : undefined,
          comments: acknowledged ? [{ actorId: managerId, at: acknowledgedAt, text: 'Demo inspection and follow-up assigned.' }] : [],
          witnesses: [{ name: 'Demo shift witness', note: 'Synthetic witness for testing only' }],
          correctiveActions: resolved ? 'Demo damaged item repaired.' : undefined,
          preventiveActions: resolved ? 'Demo daily inspection checklist updated.' : undefined,
          resolutionEvidence: resolved ? { note: 'Demo repair checked', photo: imageData(`incident-resolution-${index}`) } : undefined }));
      }
      assert.equal(roster.guardId, guardId);
    }
    const payableDates = new Set(guardAttendance.filter(a => indiaBusinessDate(a.capturedAt).startsWith('2026-09-')).map(a => indiaBusinessDate(a.capturedAt)));
    const deductions = monthlySalary / 30 * absentDays.length;
    const net = monthlySalary - deductions;
    const policy = { version: 'demo-explicit-absence-30days-v1', deductions };
    add(models.SalaryModel, { _id: `${guardId}_salary_202609`, guardId, month: 9, year: 2026,
      payPeriodStart: '2026-09-01', payPeriodEnd: '2026-09-30', basicSalary: monthlySalary, baseSalary: monthlySalary,
      attendanceDays: payableDates.size, payableDays: payableDates.size, scheduledDays: 30,
      adjustments: -deductions, deductions, allowances: 0, advances: 0, arrears: 0, overtimeHours: 0, overtimeAmount: 0, holidayPay: 0,
      finalSalary: net, netPayable: net, status: 'PENDING', workflowStatus: 'REVIEW', currency: 'INR',
      calculationPolicyVersion: policy.version,
      approvalHistory: [{ action: 'RUN', actor: String(admin._id), at: now.toISOString(), demo: true, policy,
        note: `Synthetic explicit absence deduction: ${absentDays.length} days × INR ${monthlySalary / 30}. No automatic absence deduction assumed.` }] });
    salaryReport.push({ guardId, email, site: site.siteCode, hours, shift: night ? 'NIGHT' : hours === 24 ? '24H' : 'DAY',
      monthlySalary, scheduledDays: 30, presentDuties: 30 - absentDays.length, absentDays, absenceDeduction: deductions,
      expectedNet: net, currentPayrollPayableDates: payableDates.size,
      previewPayload: { month: 9, year: 2026, guardIds: [guardId], policy } });
  }
  credentials.guardEmails = salaryReport.map(row => row.email);
  // Validate every model and foreign key before any writes.
  const ids = new Set([...groups.values()].flat().map(row => row._id));
  for (const [model, records] of groups) for (const record of records) {
    await new model(record).validate();
    for (const field of ['guardId', 'siteId', 'shiftId', 'userId', 'startAttendanceId', 'endAttendanceId', 'verificationRequestId']) {
      if (record[field]) assert(ids.has(record[field]), `Missing ${field} in ${record._id}`);
    }
  }
  const totalNet = salaryReport.reduce((sum, row) => sum + row.expectedNet, 0);
  const report = { fixture: prefix, database: mongoose.connection.name, period: 'September 2026',
    counts: Object.fromEntries([...groups].map(([model, records]) => [model.modelName, records.length])),
    totalNet, rows: salaryReport,
    payrollLimitations: ['Default payroll does not automatically deduct absences. Use each row previewPayload for exact seeded totals.',
      'Current payroll counts verified calendar dates, including overnight checkout dates, instead of completed roster duty dates.'],
    credentialsFile: credentialPath, reportFile: reportPath };
  if (!apply && !verify) {
    console.log(JSON.stringify({ result: 'PLAN_VALIDATED_NO_WRITES', counts: report.counts, totalNet,
      salaryScenarios: salaryReport.map(row => ({ guard: row.email, present: row.presentDuties,
        absent: row.absentDays.length, deductions: row.absenceDeduction, net: row.expectedNet })) }, null, 2));
    return;
  }
  const preserved: Array<{ model: mongoose.Model<any>; rows: any[]; hash: string }> = [];
  for (const [model] of groups) {
    const rows = await model.collection.find({ _id: { $not: new RegExp(`^${prefix}`) } } as any).sort({ _id: 1 }).toArray();
    preserved.push({ model, rows, hash: digest(rows) });
  }
  if (apply) {
    // Detect conflicting natural keys before beginning the resumable insert.
    const naturalKeys: Array<[mongoose.Model<any>, string]> = [
      [models.UserModel, 'email'],
      [models.GuardModel, 'employeeCode'],
      [models.SiteModel, 'siteCode'],
    ];
    for (const [model, field] of naturalKeys) {
      for (const record of groups.get(model) ?? []) {
        const existing: any = await model.findOne({ [field]: record[field] }).lean();
        assert(!existing || existing._id === record._id, `Existing ${field} collision; no records changed.`);
      }
    }
    await fs.mkdir(mediaDir, { recursive: true });
    try { await fs.writeFile(credentialPath, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 }); }
    catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    for (const [index, key] of [[0, 'manager'], ...Array.from({ length: 20 }, (_, i) => [i + 1, `guard-${i + 1}`])] as Array<[number, string]>) {
      try { await fs.writeFile(path.join(mediaDir, `${key}.png`), demoImage(`profile-${index}`), { flag: 'wx' }); }
      catch (error: any) { if (error.code !== 'EEXIST') throw error; }
    }
    for (const [model, records] of groups) {
      const operations = records.map(record => {
        const data = new model(record).toObject();
        data.createdAt ??= now; data.updatedAt ??= now;
        return { updateOne: { filter: { _id: record._id }, update: { $setOnInsert: data }, upsert: true } };
      });
      await model.collection.bulkWrite(operations as any[], { ordered: true });
    }
    await models.AuditLogModel.collection.updateOne({ _id: `${prefix}seed_audit` } as any,
      { $setOnInsert: { _id: `${prefix}seed_audit`, actor: String(admin._id), action: 'DEMO_DUTY_DATA_ADDED', entityType: 'DemoFixture',
        entityId: prefix, at: now, metadata: { counts: report.counts, synthetic: true, requestedBy: 'User in local Codex session' } } }, { upsert: true });
  }
  for (const { model, rows, hash } of preserved) {
    const current = await model.collection.find({ _id: { $in: rows.map(row => row._id) } }).sort({ _id: 1 }).toArray();
    assert.equal(digest(current), hash, `Existing ${model.modelName} records changed.`);
  }
  for (const [model, records] of groups) {
    assert.equal(await model.countDocuments({ _id: { $in: records.map(record => record._id) } }), records.length, `Missing ${model.modelName} fixtures`);
  }
  for (const row of salaryReport) {
    const salary: any = await models.SalaryModel.findById(`${row.guardId}_salary_202609`).lean();
    assert.equal(salary.netPayable, row.expectedNet); assert.equal(salary.deductions, row.absenceDeduction);
    const rosters = await models.RosterModel.find({ guardId: row.guardId, businessDate: /^2026-09-/ }).lean();
    assert.equal(rosters.filter(r => r.dutyStatus === 'ABSENT').length, row.absentDays.length);
    assert.equal(await models.ShiftModel.countDocuments({ guardId: row.guardId, startedAt: { $gte: localTime('2026-09-01', 0), $lt: localTime('2026-10-01', 0) } }), row.presentDuties);
    const attendance: any[] = await models.AttendanceModel.find({ guardId: row.guardId, capturedAt: { $gte: localTime('2026-09-01', 0), $lt: localTime('2026-10-01', 0) } }).lean();
    const payableDates = new Set(attendance.filter(a => a.verificationStatus === 'verified').map(a => indiaBusinessDate(a.capturedAt)));
    assert.equal(salary.payableDays, payableDates.size);
    assert.equal(salary.finalSalary, salary.basicSalary - salary.deductions);
  }
  for (const [model, records] of groups) {
    const storedRows: any[] = await model.find({ _id: { $in: records.map(record => record._id) } }).lean();
    const storedMap = new Map(storedRows.map(row => [row._id, row]));
    for (const record of records) {
      const stored = storedMap.get(record._id);
      assert(stored, `Missing ${record._id}`);
      for (const field of ['guardId', 'siteId', 'shiftId', 'userId', 'startAttendanceId', 'endAttendanceId', 'verificationRequestId']) {
        if (record[field]) assert.equal(stored[field], record[field], `Incorrect ${field} in ${record._id}`);
      }
      if (record.photo) {
        assert.equal(stored.photo, record.photo);
        if (model === models.AttendanceModel) assert.equal(stored.photoHash, analyzeAttendancePhoto(stored.photo).photoHash);
      }
    }
  }
  const manager: any = await models.UserModel.findById(managerId).lean();
  assert.equal(await bcrypt.compare(credentials.password, manager.passwordHash), true);
  assert.deepEqual([...manager.assignedSiteIds].sort(), sites.map(s => s._id).sort());
  await fs.access(path.join(mediaDir, 'manager.png'));
  for (let i = 1; i <= 20; i++) await fs.access(path.join(mediaDir, `guard-${i}.png`));
  if (apply) await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: apply ? 'INSERTED_AND_VERIFIED' : 'VERIFIED', counts: report.counts, totalNet,
    existingRecordsPreserved: true, reportPath, credentialPath }, null, 2));
}
try { await main(); }
catch (error: any) { console.error(error.message?.includes('mongodb') ? error.name : error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
