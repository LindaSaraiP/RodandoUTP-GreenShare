const CACHE = 'rodando-utp-greenshare-v6.3-push';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=6.3.0',
  '/js/app.js?v=6.3.0',
  '/js/notifications.js?v=6.3.0',
  '/js/qr.js?v=6.1.0',
  '/verificar-pase.html',
  '/js/verificar-pase.js?v=6.1.0',
  '/manifest.webmanifest',
  '/img/icon-192.png',
  '/img/icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(req, copy));
    return response;
  }).catch(() => caches.match('/index.html'))));
});


// Web Push: recepción aunque la página no esté visible.
self.addEventListener('push', event => {
  let message = { title: 'Rodando UTP', body: 'Tienes un aviso nuevo.', url: '/#avisos' };
  try { if (event.data) message = { ...message, ...event.data.json() }; }
  catch { /* Mensaje inválido: usar contenido genérico */ }
  const target = typeof message.url === 'string' && message.url.startsWith('/') && !message.url.startsWith('//') ? message.url : '/#avisos';
  event.waitUntil(Promise.all([
    self.registration.showNotification(String(message.title).slice(0, 90), {
      body: String(message.body).slice(0, 230),
      icon: '/img/icon-192.png', badge: '/img/icon-192.png',
      tag: String(message.tag || 'rodando-aviso'),
      data: { url: target }
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients =>
      Promise.all(clients.map(client => client.postMessage({ type: 'RODANDO_PUSH_RECEIVED' }))))
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/#avisos';
  const target = new URL(url, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const windowClient of windows) {
      if (new URL(windowClient.url).origin === self.location.origin && 'focus' in windowClient) {
        await windowClient.navigate(target);
        return windowClient.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
