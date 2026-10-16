import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

test('built production server serves React, deep links and API on the same Render port', async () => {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as net.AddressInfo).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  // Only database I/O is replaced. Exercise the actual built server/static middleware.
  const fixture = `
    import mongoose from 'mongoose';
    import bcrypt from 'bcryptjs';
    const models = await import('./dist/server/models/index.js');
    const passwordHash = await bcrypt.hash('synthetic-production-admin', 4);
    mongoose.connect = async () => { Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, writable: true, value: 1 }); return mongoose; };
    mongoose.disconnect = async () => { mongoose.connection.readyState = 0; };
    models.UserModel.find = () => ({ select: async () => [{ passwordHash }] });
    for (const name of ['GuardModel', 'IncidentModel', 'SalaryModel', 'NotificationModel']) models[name].find = () => ({ lean: async () => [], limit: async () => [] });
    process.stdin.on('data', () => process.emit('SIGTERM'));
    await import('./dist/server/index.js');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', fixture], { env: {
    ...process.env, NODE_ENV: 'production', RENDER: 'true', PORT: String(port), RENDER_EXTERNAL_URL: 'https://deployment.example.test', CLIENT_URL: 'https://deployment.example.test', CLIENT_ADDITIONAL_ORIGINS: '', COOKIE_SECURE: 'true', MEDIA_STORAGE_DRIVER: 'mongo', MONGODB_URI: 'mongodb://127.0.0.1/synthetic-only', JWT_ACCESS_SECRET: 'synthetic-access-'.repeat(3), JWT_REFRESH_SECRET: 'synthetic-refresh-'.repeat(3),
  }, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  const exited = once(child, 'exit');
  const timer = setTimeout(() => child.kill(), 20000);
  try {
    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.stdout.on('data', (chunk) => { output += chunk; if (output.includes(`running on port ${port}`)) resolve(); });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.once('exit', () => reject(new Error(output || 'Production fixture exited early')));
    });
    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type') ?? '', /text\/html/);
    const html = await home.text();
    const deepLink = await fetch(`${base}/guard/salary`);
    assert.equal(deepLink.status, 200);
    assert.equal(await deepLink.text(), html);
    assert.equal(deepLink.headers.get('cache-control'), 'no-cache');
    const ready = await fetch(`${base}/api/health/ready`);
    assert.equal(ready.status, 200);
    assert.equal((await ready.json() as any).data.database, 'mongodb');
    const missingApi = await fetch(`${base}/api/not-a-route`);
    assert.equal(missingApi.status, 401); // Unauthenticated API requests reach auth, never the SPA fallback.
    assert.match(missingApi.headers.get('content-type') ?? '', /application\/json/);
    const asset = html.match(/src="([^\"]+\.js)"/)?.[1];
    assert.ok(asset, 'built index references its JavaScript bundle');
    const bundle = await fetch(base + asset);
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get('cache-control') ?? '', /immutable/);
    await bundle.arrayBuffer();
    assert.equal((await fetch(`${base}/sw.js`)).headers.get('cache-control'), 'no-cache');
    const blocked = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://untrusted.example.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(blocked.status, 403);
    child.stdin.write('stop\n');
    const [code] = await exited;
    assert.equal(code, 0, output);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) { child.kill(); await exited; }
  }
});
