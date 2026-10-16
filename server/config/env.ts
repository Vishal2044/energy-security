import fs from 'node:fs';
import path from 'node:path';

// Keep local development self-contained: dotenv is optional and the API can
// still load a conventional .env file without adding a runtime dependency.
const envPath = path.resolve(process.cwd(), '.env');
// Isolated tests supply their own configuration and never read local secrets.
if (!['test', 'production'].includes(process.env.NODE_ENV ?? '') && process.env.RENDER !== 'true' && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const clientUrl = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173';
const clientOrigins = [...new Set([clientUrl, process.env.RENDER_EXTERNAL_URL, ...(process.env.CLIENT_ADDITIONAL_ORIGINS ?? '').split(',')]
  .filter((origin): origin is string => Boolean(origin?.trim())).map((origin) => origin.trim().replace(/\/$/, '')))];

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  clientUrl,
  clientOrigins,
  mongoUri: process.env.MONGODB_URI ?? '',
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'development-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'development-refresh-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === undefined ? nodeEnv === 'production' : process.env.COOKIE_SECURE === 'true',
  mediaStorageDriver: process.env.MEDIA_STORAGE_DRIVER ?? (nodeEnv === 'production' ? 'mongo' : 'local'),
  mediaStorageRoot: path.resolve(process.env.MEDIA_STORAGE_ROOT ?? 'uploads'),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? '',
};

if (!['local', 'mongo'].includes(env.mediaStorageDriver)) throw new Error('Invalid MEDIA_STORAGE_DRIVER: use local or mongo');
if (!Number.isInteger(env.port) || env.port < 1 || env.port > 65535) throw new Error('Invalid PORT');

const insecureSecrets = new Set([
  'development-access-secret-change-me',
  'development-refresh-secret-change-me',
  'replace-with-a-long-random-access-secret',
  'replace-with-a-long-random-refresh-secret',
]);
if (env.nodeEnv === 'production') {
  const missing: string[] = [];
  if (!env.mongoUri) missing.push('MONGODB_URI');
  if (env.clientOrigins.some((origin) => { try { const url = new URL(origin); return url.protocol !== 'https:' || url.origin !== origin || Boolean(url.username || url.password); } catch { return true; } })) missing.push('HTTPS CLIENT_URL / CLIENT_ADDITIONAL_ORIGINS');
  if (env.accessSecret.length < 32 || insecureSecrets.has(env.accessSecret)) missing.push('JWT_ACCESS_SECRET');
  if (env.refreshSecret.length < 32 || insecureSecrets.has(env.refreshSecret)) missing.push('JWT_REFRESH_SECRET');
  if (env.accessSecret === env.refreshSecret) missing.push('distinct JWT secrets');
  if (!env.cookieSecure) missing.push('COOKIE_SECURE=true');
  if (env.mediaStorageDriver === 'local' && !process.env.MEDIA_STORAGE_ROOT) missing.push('MEDIA_STORAGE_ROOT');
  if (process.env.RENDER === 'true' && env.mediaStorageDriver !== 'mongo') missing.push('MEDIA_STORAGE_DRIVER=mongo on Render');
  if (missing.length) throw new Error(`Invalid production configuration: ${missing.join(', ')}`);
}
