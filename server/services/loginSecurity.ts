type Attempt = { count: number; firstAt: number; blockedUntil?: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function clean(now: number) {
  for (const [key, value] of attempts) if (now - value.firstAt > WINDOW_MS && (!value.blockedUntil || value.blockedUntil < now)) attempts.delete(key);
}
export function loginGate(key: string) {
  const now = Date.now(); clean(now);
  const current = attempts.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) return { allowed: false, retryAfter: Math.ceil((current.blockedUntil - now) / 1000) };
  if (!current || now - current.firstAt > WINDOW_MS) { attempts.set(key, { count: 0, firstAt: now }); return { allowed: true, retryAfter: 0 }; }
  return { allowed: current.count < MAX_ATTEMPTS, retryAfter: 0 };
}
export function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  const next = !current || now - current.firstAt > WINDOW_MS ? { count: 1, firstAt: now } : { ...current, count: current.count + 1 };
  if (next.count >= MAX_ATTEMPTS) next.blockedUntil = now + BLOCK_MS;
  attempts.set(key, next);
  return { blocked: Boolean(next.blockedUntil), retryAfter: next.blockedUntil ? Math.ceil((next.blockedUntil - now) / 1000) : 0 };
}
export function clearLoginFailures(key: string) { attempts.delete(key); }
