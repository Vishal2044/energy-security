import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { connectDatabase, isDatabaseConnected } from './db.js';
import { seedDatabase } from './seed.js';
import { router } from './route.js';
import { startJobs } from './jobs/index.js';
import { errorHandler, notFound } from './middleware/error.js';
import { requestSecurity } from './middleware/security.js';

const app = express();
// Render terminates TLS at its reverse proxy; trust only the nearest hop.
if (process.env.RENDER === 'true') app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: (origin, callback) => callback(null, !origin || env.clientOrigins.includes(origin)), credentials: true }));
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use(requestSecurity);
app.use((req, res, next) => { const requestId = req.get('x-request-id')?.slice(0, 80) || randomUUID(); res.setHeader('X-Request-Id', requestId); res.locals.requestId = requestId; next(); });
app.get('/api/health/live', (_req, res) => res.status(200).json({ success: true, data: { service: 'dg-energy-api', status: 'live', time: new Date().toISOString() } }));
app.get('/api/health', (_req, res) => {
  const connected = isDatabaseConnected();
  return res.status(env.nodeEnv === 'production' && !connected ? 503 : 200).json({ success: connected || env.nodeEnv !== 'production', data: { service: 'dg-energy-api', database: connected ? 'mongodb' : 'memory', time: new Date().toISOString() } });
});
app.get('/api/health/ready', (_req, res) => { const database = isDatabaseConnected(); return res.status(database ? 200 : 503).json({ success: database, data: { service: 'dg-energy-api', database: database ? 'mongodb' : 'unavailable', jobs: 'started-after-database-connect' } }); });
app.use('/api', (req, res, next) => {
  if (env.nodeEnv === 'production' && !isDatabaseConnected()) return res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE' });
  return next();
});
app.use('/api', router);
app.use('/api', notFound);

if (env.nodeEnv === 'production') {
  const clientDist = path.resolve('client/dist');
  if (!fs.existsSync(path.join(clientDist, 'index.html'))) throw new Error('CLIENT_BUILD_MISSING: run npm run build before npm start');
  app.use(express.static(clientDist, { setHeaders: (res, file) => {
    res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
  } }));
  app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(clientDist, 'index.html')); });
}
app.use(notFound);
app.use(errorHandler);

let databaseConnected = false;
try {
  databaseConnected = await connectDatabase();
} catch {
  console.error('Database startup failed.');
  process.exit(1);
}
if (env.nodeEnv === 'production' && !databaseConnected) {
  console.error('Production startup requires MongoDB.');
  process.exit(1);
}
try {
  const seedMode = await seedDatabase();
  const jobs = startJobs();
  const server = app.listen(env.port, '0.0.0.0', () => console.log(`DG Energy running on port ${env.port} (${seedMode})`));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    jobs.stop();
    const timeout = setTimeout(() => process.exit(1), 25000);
    timeout.unref();
    server.close(() => {
      void mongoose.disconnect().then(() => { clearTimeout(timeout); process.exit(0); }).catch(() => process.exit(1));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Production initialization failed.');
  await mongoose.disconnect();
  process.exit(1);
}
