import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { Writable, Readable } from 'node:stream';
import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from '../server/config/env.js';
import { seedDatabase, resetAndSeedDatabase } from '../server/seed.js';
import { UserModel } from '../server/models/index.js';
import { saveLocalUpload, sendStoredUpload, deleteLocalUpload, isStoredUpload } from '../server/services/storage.js';

test('Render derives its origin and durable media defaults without loading the local .env', () => {
  const childEnv = { ...process.env, NODE_ENV: 'production', RENDER: 'true', RENDER_EXTERNAL_URL: 'https://deployment.example.test', JWT_ACCESS_SECRET: 'access-test-secret-'.repeat(3), JWT_REFRESH_SECRET: 'refresh-test-secret-'.repeat(3), MONGODB_URI: 'mongodb://127.0.0.1/synthetic-only' };
  for (const key of ['CLIENT_URL', 'COOKIE_SECURE', 'MEDIA_STORAGE_DRIVER', 'MEDIA_STORAGE_ROOT', 'CLIENT_ADDITIONAL_ORIGINS']) delete (childEnv as NodeJS.ProcessEnv)[key];
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "const {env}=await import('./server/config/env.ts'); console.log(JSON.stringify({origin:env.clientUrl,media:env.mediaStorageDriver,secure:env.cookieSecure}));"], { env: childEnv, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), { origin: 'https://deployment.example.test', media: 'mongo', secure: true });
  const invalid = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "await import('./server/config/env.ts')"], { env: { ...childEnv, CLIENT_ADDITIONAL_ORIGINS: 'http://untrusted.example.test' }, encoding: 'utf8', timeout: 30000 });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /HTTPS CLIENT_URL/);
});

test('production admin setup preserves accounts and rejects unsafe bootstrap/reset', async (t) => {
  const previousMode = env.nodeEnv;
  const previousState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const previousEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  env.nodeEnv = 'production';
  try {
    await t.test('existing secure admin is preserved without creating a demo account', async (s) => {
      const passwordHash = await bcrypt.hash('synthetic-secure-admin-password', 4);
      s.mock.method(UserModel, 'find', () => ({ select: async () => [{ passwordHash }] }) as any);
      const create = s.mock.method(UserModel, 'create', async () => { throw new Error('must not create'); });
      assert.equal(await seedDatabase(), 'existing');
      assert.equal(create.mock.callCount(), 0);
    });
    await t.test('known demo administrator blocks production startup', async (s) => {
      const passwordHash = await bcrypt.hash('demo1234', 4);
      s.mock.method(UserModel, 'find', () => ({ select: async () => [{ passwordHash }] }) as any);
      await assert.rejects(seedDatabase(), /UNSAFE_ADMIN_PASSWORD/);
    });
    await t.test('empty DB requires an explicit strong initial administrator', async (s) => {
      s.mock.method(UserModel, 'find', () => ({ select: async () => [] }) as any);
      delete process.env.BOOTSTRAP_ADMIN_EMAIL;
      delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
      await assert.rejects(seedDatabase(), /ADMIN_SETUP_REQUIRED/);
      process.env.BOOTSTRAP_ADMIN_EMAIL = 'synthetic-admin@example.test';
      process.env.BOOTSTRAP_ADMIN_PASSWORD = 'synthetic-bootstrap-password';
      s.mock.method(UserModel, 'exists', async () => null);
      let created: any;
      s.mock.method(UserModel, 'create', async (value: any) => { created = value; return value; });
      assert.equal(await seedDatabase(), 'production-admin');
      assert.equal(created.passwordChangeRequired, true);
      assert.equal(created.role, 'ADMIN');
      assert.notEqual(created.passwordHash, process.env.BOOTSTRAP_ADMIN_PASSWORD);
      assert.equal(await bcrypt.compare(process.env.BOOTSTRAP_ADMIN_PASSWORD, created.passwordHash), true);
    });
    await t.test('bootstrap never overwrites an existing email and reset is forbidden', async (s) => {
      s.mock.method(UserModel, 'find', () => ({ select: async () => [] }) as any);
      s.mock.method(UserModel, 'exists', async () => ({ _id: 'existing-account' }));
      await assert.rejects(seedDatabase(), /ADMIN_SETUP_CONFLICT/);
      await assert.rejects(resetAndSeedDatabase(), /SEED_RESET_FORBIDDEN/);
    });
  } finally {
    env.nodeEnv = previousMode;
    if (previousState) Object.defineProperty(mongoose.connection, 'readyState', previousState);
    else delete (mongoose.connection as any).readyState;
    if (previousEmail === undefined) delete process.env.BOOTSTRAP_ADMIN_EMAIL; else process.env.BOOTSTRAP_ADMIN_EMAIL = previousEmail;
    if (previousPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD; else process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
  }
});

test('private GridFS media round trip streams original bytes and deletes via its opaque ID', async (t) => {
  const oldDriver = env.mediaStorageDriver;
  const oldDb = mongoose.connection.db;
  const oldState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1/synthetic-only');
  // Real driver objects, mocked I/O only: this fixture never connects to MongoDB.
  mongoose.connection.db = client.db('synthetic-only');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
  env.mediaStorageDriver = 'mongo';
  const id = new mongoose.mongo.ObjectId();
  const contents = Buffer.from('%PDF-1.7\nsynthetic private document');
  let bytes = Buffer.alloc(0);
  let deleted = false;
  t.mock.method(mongoose.mongo.GridFSBucket.prototype, 'openUploadStream', () => Object.assign(new Writable({ write(chunk, _encoding, done) { bytes = Buffer.concat([bytes, chunk]); done(); } }), { id, abort: async () => undefined }) as any);
  t.mock.method(mongoose.mongo.GridFSBucket.prototype, 'find', () => ({ next: async () => deleted ? null : { _id: id, length: bytes.length, metadata: { mimeType: 'application/pdf' } } }) as any);
  t.mock.method(mongoose.mongo.GridFSBucket.prototype, 'openDownloadStream', () => Readable.from([bytes]) as any);
  t.mock.method(mongoose.mongo.GridFSBucket.prototype, 'delete', async (deletedId) => { assert.equal(deletedId.toString(), id.toString()); deleted = true; });
  const app = express();
  app.get('/private', (_req, res, next) => { void sendStoredUpload(res, `gridfs:${id}`, 'document.pdf').catch(next); });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const saved = await saveLocalUpload({ buffer: contents, size: contents.length, originalname: 'document.pdf', mimetype: 'application/pdf' } as Express.Multer.File);
    assert.equal(saved.storageKey, `gridfs:${id}`);
    assert.deepEqual(bytes, contents);
    assert.equal(isStoredUpload(saved.storageKey), true);
    assert.equal(isStoredUpload('gridfs:bad-id'), false);
    assert.equal(isStoredUpload('../package.json'), false);
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const response = await fetch(`${base}/private`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), contents);
    await deleteLocalUpload(saved.storageKey);
    assert.equal(deleted, true);
    assert.equal((await fetch(`${base}/private`)).status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    env.mediaStorageDriver = oldDriver;
    mongoose.connection.db = oldDb;
    if (oldState) Object.defineProperty(mongoose.connection, 'readyState', oldState); else delete (mongoose.connection as any).readyState;
    await client.close();
  }
});
