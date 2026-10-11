export interface PendingCapture { clientRecordId: string; endpoint: string; body: Record<string, unknown>; createdAt: string; ownerId?: string; }
const DB_NAME = 'dg-energy-offline';
const DB_VERSION = 3;

function openCaptureDb() {
  return new Promise<IDBDatabase | undefined>((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transaction = request.transaction;
      if (!database.objectStoreNames.contains('captures')) {
        database.createObjectStore('captures', { keyPath: 'clientRecordId' });
        return;
      }

      // Remove location data from captures created by the previous attendance flow.
      const store = transaction?.objectStore('captures');
      const cursorRequest = store?.openCursor();
      if (!cursorRequest) return;
      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (!cursor) return;
        const item = cursor.value as PendingCapture;
        delete item.body.latitude;
        delete item.body.longitude;
        delete item.body.accuracy;
        cursor.update(item);
        cursor.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

export async function queueCapture(item: PendingCapture) {
  if (!('indexedDB' in window)) return false;
  const database = await openCaptureDb();
  if (!database) return false;
  return new Promise<boolean>((resolve) => {
    const tx = database.transaction('captures', 'readwrite');
    tx.objectStore('captures').put(item);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function pendingCount() {
  if (!('indexedDB' in window)) return 0;
  const database = await openCaptureDb();
  if (!database) return 0;
  return new Promise<number>((resolve) => {
    const count = database.transaction('captures', 'readonly').objectStore('captures').count();
    count.onsuccess = () => resolve(count.result);
    count.onerror = () => resolve(0);
  });
}

export async function drainCaptures(send: (item: PendingCapture) => Promise<void>, ownerId?: string, isCurrentSession: () => boolean = () => true): Promise<boolean> {
  if (!('indexedDB' in window)) return false;
  const database = await openCaptureDb();
  if (!database) return false;
  let failed = false;
  await new Promise<void>((resolve) => {
    const request = database.transaction('captures', 'readonly').objectStore('captures').getAll();
    request.onsuccess = async () => {
      const items = (request.result as PendingCapture[])
        .filter((item) => Boolean(ownerId && item.ownerId === ownerId))
        .sort((a, b) => {
          const aCapturedAt = typeof a.body.capturedAt === 'string' ? a.body.capturedAt : a.createdAt;
          const bCapturedAt = typeof b.body.capturedAt === 'string' ? b.body.capturedAt : b.createdAt;
          const byTime = new Date(aCapturedAt).getTime() - new Date(bCapturedAt).getTime();
          return byTime || a.clientRecordId.localeCompare(b.clientRecordId);
        });
      for (const item of items) {
        if (!isCurrentSession()) break;
        try {
          await send(item);
          // Retain evidence on a session change, even if a prior request settled.
          // The original owner can retry with the same idempotency key later.
          if (!isCurrentSession()) break;
          const remove = database.transaction('captures', 'readwrite').objectStore('captures').delete(item.clientRecordId);
          await new Promise<void>((done) => { remove.onsuccess = () => done(); remove.onerror = () => done(); });
        } catch {
          failed = true;
          break;
        }
      }
      resolve();
    };
    request.onerror = () => resolve();
  });
  return failed;
}
