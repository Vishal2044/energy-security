import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { connectDatabase, isDatabaseConnected } from './db.js';
import { seedDatabase } from './seed.js';
import { router } from './route.js';
import { startJobs } from './jobs/index.js';
import { errorHandler, notFound } from './middleware/error.js';
import { requestSecurity } from './middleware/security.js';

const app = express();
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
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
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
const seedMode = await seedDatabase();
startJobs();
app.listen(env.port, () => console.log(`Elector API running on http://localhost:${env.port} (${seedMode})`));
