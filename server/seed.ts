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
  if (await UserModel.exists({ email: admin.email })) return 'existing';
  await createMongoAdmin();
  return 'admin-only';
}

/** Explicit reset used by `npm run seed` to remove all dummy records. */
export async function resetAndSeedDatabase() {
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
