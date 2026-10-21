/* global self, clients */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || '' };
  }

  const title = String(data.title || 'AI_nnoe Learning Ecosystem');
  const options = {
    body: String(data.body || ''),
    icon: String(data.icon || '/logo-ale.png'),
    data: { url: String(data.url || '/') },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      windows.forEach((client) => client.postMessage({ title, ...options }));
    }),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url;
  try {
    url = new URL(event.notification.data?.url || '/', self.location.origin);
  } catch {
    url = new URL('/', self.location.origin);
  }
  if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        return existing.focus().then((client) => client?.navigate?.(url.href));
      }
      return clients.openWindow(url.href);
    }),
  );
});
