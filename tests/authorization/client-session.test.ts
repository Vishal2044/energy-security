import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { advanceApiSession, api } from '../../client/src/lib/api.js';
import { drainCaptures, type PendingCapture } from '../../client/src/lib/offline.js';
import { clearLegacyApiCache } from '../../client/src/lib/session.js';

// Fake browser facilities and Axios adapter only: no real network, caches or IDB.
const originals = new Map(['window', 'indexedDB', 'caches'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalAdapter = api.defaults.adapter;
const fixtureWindow = new EventTarget();
before(() => Object.defineProperty(globalThis, 'window', { configurable: true, value: fixtureWindow }));
after(() => {
  api.defaults.adapter = originalAdapter;
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Fixture expired session', 'ERR_BAD_REQUEST', config, undefined, { config, status: 401, statusText: 'Unauthorized', headers: {}, data: { success: false, error: 'SESSION_EXPIRED' } });
}

test('late 401 from the previous account cannot expire the new session', async () => {
  let expirations = 0;
  const expired = () => { expirations += 1; };
  fixtureWindow.addEventListener('dg-session-expired', expired);
  try {
    let release!: () => void; let started!: () => void;
    const adapterStarted = new Promise<void>((resolve) => { started = resolve; });
    api.defaults.adapter = (config) => new Promise((_resolve, reject) => { release = () => reject(unauthorized(config)); started(); });
    const previousRequest = api.get('/sites').catch((error: Error) => error);
    await adapterStarted; advanceApiSession(); release(); await previousRequest;
    assert.equal(expirations, 0);
    api.defaults.adapter = (config) => Promise.reject(unauthorized(config));
    await assert.rejects(api.get('/sites')); assert.equal(expirations, 1);
    await assert.rejects(api.post('/auth/login')); assert.equal(expirations, 1, 'Failed credentials must not broadcast expiry');
  } finally { fixtureWindow.removeEventListener('dg-session-expired', expired); api.defaults.adapter = originalAdapter; }
});

function fakeCaptures(rows: PendingCapture[]) {
  const deleted: string[] = [];
  function resultRequest(result: unknown) {
    const request = { result, onsuccess: undefined as ((event: unknown) => void) | undefined };
    queueMicrotask(() => request.onsuccess?.({ target: request })); return request;
  }
  const database = { transaction: () => ({ objectStore: () => ({
    getAll: () => resultRequest(structuredClone(rows)),
    delete: (id: string) => { deleted.push(id); return resultRequest(undefined); },
  }) }) };
  const indexedDB = { open: () => resultRequest(database) };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
  Object.defineProperty(fixtureWindow, 'indexedDB', { configurable: true, value: indexedDB });
  return deleted;
}
const captures = (): PendingCapture[] => [
  { clientRecordId: 'a_end', ownerId: 'guard_a', endpoint: '/attendance/end', createdAt: '2026-10-10T04:00:00Z', body: { photo: 'private-a-end' } },
  { clientRecordId: 'b_start', ownerId: 'guard_b', endpoint: '/attendance/start', createdAt: '2026-10-10T02:00:00Z', body: { photo: 'private-b-start' } },
  { clientRecordId: 'a_start', ownerId: 'guard_a', endpoint: '/attendance/start', createdAt: '2026-10-10T03:00:00Z', body: { photo: 'private-a-start' } },
];

test('account change during replay stops later evidence and retains the original queue', async () => {
  const rows = captures(), deleted = fakeCaptures(rows), sent: string[] = []; let active = true;
  await drainCaptures(async (item) => { sent.push(item.clientRecordId); active = false; }, 'guard_a', () => active);
  assert.deepEqual(sent, ['a_start']); assert.deepEqual(deleted, []);
  await drainCaptures(async () => { assert.fail('Ended session must not send'); }, 'guard_a', () => false);
  assert.deepEqual(deleted, []);
});

test('unchanged session retains chronological owner filtering and stops on replay failure', async () => {
  let deleted = fakeCaptures(captures()); const sent: string[] = [];
  await drainCaptures(async (item) => { sent.push(item.clientRecordId); }, 'guard_a');
  assert.deepEqual(sent, ['a_start', 'a_end']); assert.deepEqual(deleted, sent);
  deleted = fakeCaptures(captures());
  await drainCaptures(async () => { throw new Error('Fixture network failure'); }, 'guard_a', () => true);
  assert.deepEqual(deleted, []);
});

test('legacy privacy cleanup removes only the API cache', async () => {
  const removed: string[] = [];
  const caches = { delete: async (name: string) => { removed.push(name); return true; } };
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: caches });
  Object.defineProperty(fixtureWindow, 'caches', { configurable: true, value: caches });
  await clearLegacyApiCache(); assert.deepEqual(removed, ['api-cache']);
});
