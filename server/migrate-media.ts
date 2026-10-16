import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose, { type Model } from 'mongoose';
import type { Express } from 'express';
import { env } from './config/env.js';
import { UserModel, GuardModel, DocumentModel } from './models/index.js';
import { resolveStoredUpload, saveLocalUpload } from './services/storage.js';

// Explicit operator utility; never runs during startup, build or deployment.
// Copies local bytes, conditionally updates references, and retains source files.
async function migrateMedia() {
  const apply = process.argv.includes('--apply');
  const expectedDatabase = process.argv.find((value) => value.startsWith('--database='))?.slice('--database='.length);
  if (!expectedDatabase) throw new Error('Supply --database=<exact-target-database>; default mode is read-only.');
  if (!env.mongoUri) throw new Error('MEDIA_MIGRATION_DATABASE_MISMATCH');
  // Disable Mongoose's implicit collection/index writes, including in dry-run mode.
  await mongoose.connect(env.mongoUri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.name !== expectedDatabase) throw new Error('MEDIA_MIGRATION_DATABASE_MISMATCH');
  const counts = { scanned: 0, ready: 0, migrated: 0, missingOrInvalid: 0, concurrentChanges: 0 };
  const uploaded = new Map<string, string>();
  const targets: Array<{ model: Model<any>; field: string }> = [
    { model: UserModel, field: 'profilePhoto' }, { model: GuardModel, field: 'profilePhoto' }, { model: DocumentModel, field: 'storageKey' },
  ];
  env.mediaStorageDriver = 'mongo';
  for (const { model, field } of targets) {
    for await (const record of model.find({ [field]: { $type: 'string', $ne: '' } }).select(field).lean().cursor()) {
      const oldKey = String(record[field]);
      if (oldKey.startsWith('gridfs:')) continue;
      counts.scanned += 1;
      const resolved = resolveStoredUpload(oldKey);
      if (!resolved) { counts.missingOrInvalid += 1; continue; }
      const stat = await fs.stat(resolved).catch(() => undefined);
      if (!stat?.isFile() || stat.size > 8 * 1024 * 1024 || !stat.size) { counts.missingOrInvalid += 1; continue; }
      counts.ready += 1;
      if (!apply) continue;
      let newKey = uploaded.get(resolved);
      if (!newKey) {
        const buffer = await fs.readFile(resolved);
        const saved = await saveLocalUpload({ buffer, size: buffer.length, originalname: path.basename(resolved), mimetype: '' } as Express.Multer.File);
        newKey = saved.storageKey;
        uploaded.set(resolved, newKey);
      }
      const result = await model.updateOne({ _id: record._id, [field]: oldKey }, { $set: { [field]: newKey } });
      if (result.modifiedCount) counts.migrated += 1; else counts.concurrentChanges += 1;
    }
  }
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }));
  if (counts.missingOrInvalid || counts.concurrentChanges) process.exitCode = 1;
}

try { await migrateMedia(); }
catch (error) {
  // Database/storage errors may contain private paths or connection details.
  console.error(error instanceof Error && /^(Supply --database|MEDIA_MIGRATION_DATABASE_MISMATCH)/.test(error.message) ? error.message : 'MEDIA_MIGRATION_FAILED: source files were retained; inspect the target configuration and retry.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
