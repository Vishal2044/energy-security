// The previous service worker used one API cache for every account. Preserve
// app-shell caches and owner-tagged IndexedDB evidence; discard only that cache.
export async function clearLegacyApiCache() {
  if ('caches' in window) await caches.delete('api-cache');
}
