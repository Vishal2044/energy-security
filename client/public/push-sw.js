self.addEventListener('push', (event) => {
  let data = { title: 'DG Energy', body: 'નવી સૂચના છે.', deepLink: '/guard/notifications' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/favicon.svg', badge: '/favicon.svg', data: { deepLink: data.deepLink } }));
});
self.addEventListener('notificationclick', (event) => { event.notification.close(); const deepLink = event.notification.data?.deepLink || '/guard/notifications'; event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => { const existing = clients.find((client) => 'focus' in client); if (existing) { existing.navigate(deepLink); return existing.focus(); } return self.clients.openWindow(deepLink); })); });
