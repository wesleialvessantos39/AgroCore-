// AgroCore — OE-008.006 — Service Worker dedicado exclusivamente a Web Push.
// Escopo de registro: /push-notifications/. Não controla o AppShell nem caches do PWA.

function safeText(value, fallback, maximum) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (normalized || fallback).slice(0, maximum);
}

function safeRoute(value) {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('://') ||
    value.length > 500
  ) {
    return '/agenda';
  }
  return value;
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = safeText(payload.title, 'AgroCore', 120);
  const body = safeText(payload.body, 'Há um novo aviso disponível no AgroCore.', 320);
  const route = safeRoute(payload.route);
  const notificationId =
    typeof payload.notificationId === 'string' && payload.notificationId.length <= 80
      ? payload.notificationId
      : 'general';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/favicon-32x32.png',
      tag: `agrocore-notification-${notificationId}`,
      renotify: false,
      data: { route },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = safeRoute(event.notification.data?.route);
  const targetUrl = new URL(route, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(targetUrl);
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })
  );
});
