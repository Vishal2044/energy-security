import fs from 'node:fs';
import path from 'node:path';

// Keep local development self-contained: dotenv is optional and the API can
// still load a conventional .env file without adding a runtime dependency.
const envPath = path.resolve(process.cwd(), '.env');
// Isolated tests supply their own configuration and never read local secrets.
if (process.env.NODE_ENV !== 'test' && fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI ?? '',
  accessSecret: process.env.JWT_ACCESS_SECRET ?? 'development-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'development-refresh-secret-change-me',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  mediaStorageRoot: path.resolve(process.env.MEDIA_STORAGE_ROOT ?? 'uploads'),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? '',
};

const insecureSecrets = new Set([
  'development-access-secret-change-me',
  'development-refresh-secret-change-me',
  'replace-with-a-long-random-access-secret',
  'replace-with-a-long-random-refresh-secret',
]);
if (env.nodeEnv === 'production') {
  const missing: string[] = [];
  if (!env.mongoUri) missing.push('MONGODB_URI');
  if (!env.clientUrl || env.clientUrl.startsWith('http://localhost')) missing.push('CLIENT_URL');
  if (env.accessSecret.length < 32 || insecureSecrets.has(env.accessSecret)) missing.push('JWT_ACCESS_SECRET');
  if (env.refreshSecret.length < 32 || insecureSecrets.has(env.refreshSecret)) missing.push('JWT_REFRESH_SECRET');
  if (!env.cookieSecure) missing.push('COOKIE_SECURE=true');
  if (!process.env.MEDIA_STORAGE_ROOT) missing.push('MEDIA_STORAGE_ROOT');
  if (missing.length) throw new Error(`Invalid production configuration: ${missing.join(', ')}`);
}
