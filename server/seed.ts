import bcrypt from 'bcryptjs';
import { isDatabaseConnected } from './db.js';
import {
  ActivityModel, AttendanceModel, AttendanceCorrectionModel, AuditLogModel, DocumentModel, GuardModel, IncidentModel,
  LeaveRequestModel, NotificationModel, NotificationPreferenceModel, OvertimeModel, PushSubscriptionModel, ReplacementModel, RosterModel, SalaryModel, SessionModel, ShiftModel, SiteModel, UserModel, VerificationRequestModel
} from './models/index.js';
import { ensureMemoryAdmin, resetMemory, seedMemory } from './services/memory.js';
import { env } from './config/env.js';

const admin = {
  _id: 'user_admin',
  email: 'admin@dgenergy.local',
  name: 'Nirali Shah',
  role: 'ADMIN',
  preferredLanguage: 'en',
  active: true
};

async function adminHash() {
  return bcrypt.hash('demo1234', 10);
}

async function createMongoAdmin() {
  const passwordHash = await adminHash();
  await UserModel.create({ ...admin, passwordHash });
}

/** Ensures a fresh development environment has only the single admin account. */
export async function seedDatabase() {
  if (!isDatabaseConnected()) {
    if (env.nodeEnv === 'production') throw new Error('DATABASE_UNAVAILABLE');
    await seedMemory();
    return 'memory';
  }
  if (env.nodeEnv === 'production') {
    const existingAdmins = await UserModel.find({ role: 'ADMIN', active: { $ne: false } }).select('passwordHash');
    for (const account of existingAdmins) {
      if (!account.passwordHash || await bcrypt.compare('demo1234', account.passwordHash)) {
        throw new Error('UNSAFE_ADMIN_PASSWORD: change the existing demo admin password before production deployment.');
      }
    }
    if (existingAdmins.length) return 'existing';
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 16 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('ADMIN_SETUP_REQUIRED: provide BOOTSTRAP_ADMIN_EMAIL and a unique BOOTSTRAP_ADMIN_PASSWORD (16-72 characters) for an empty production database.');
    }
    // Never overwrite an existing account, including inactive administrators.
    if (await UserModel.exists({ email })) throw new Error('ADMIN_SETUP_CONFLICT: bootstrap email already exists.');
    await UserModel.create({ _id: 'production_admin', email, name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administrator', role: 'ADMIN', preferredLanguage: 'gu', active: true, passwordChangeRequired: true, passwordHash: await bcrypt.hash(password, 12) });
    return 'production-admin';
  }
  if (await UserModel.exists({ email: admin.email })) return 'existing';
  await createMongoAdmin();
  return 'admin-only';
}

/** Explicit reset used by `npm run seed` to remove all dummy records. */
export async function resetAndSeedDatabase() {
  if (env.nodeEnv === 'production' || process.env.RENDER === 'true') throw new Error('SEED_RESET_FORBIDDEN_IN_PRODUCTION');
  if (!isDatabaseConnected()) {
    resetMemory();
    await ensureMemoryAdmin();
    return 'memory-reset';
  }

  await Promise.all([
    UserModel.deleteMany({}),
    GuardModel.deleteMany({}),
    SiteModel.deleteMany({}),
    AttendanceModel.deleteMany({}),
    AttendanceCorrectionModel.deleteMany({}),
    RosterModel.deleteMany({}),
    LeaveRequestModel.deleteMany({}),
    ReplacementModel.deleteMany({}),
    OvertimeModel.deleteMany({}),
    ShiftModel.deleteMany({}),
    VerificationRequestModel.deleteMany({}),
    DocumentModel.deleteMany({}),
    IncidentModel.deleteMany({}),
    SalaryModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    NotificationPreferenceModel.deleteMany({}),
    PushSubscriptionModel.deleteMany({}),
    SessionModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    ActivityModel.deleteMany({})
  ]);
  await createMongoAdmin();
  return 'mongodb-reset';
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const { connectDatabase } = await import('./db.js');
  await connectDatabase();
  console.log(`Database reset: ${await resetAndSeedDatabase()}`);
}
