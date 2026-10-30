const VERSION = '6.4.1';
const CACHE = `rodando-utp-greenshare-v${VERSION}`;
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=6.4.1',
  '/js/app.js?v=6.4.1',
  '/js/notifications.js?v=6.4.1',
  '/js/qr.js?v=6.4.1',
  '/js/verificar-pase.js?v=6.4.1',
  '/verificar-pase.html',
  '/manifest.webmanifest',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
  '/vendor/leaflet/images/layers.png',
  '/vendor/leaflet/images/layers-2x.png',
  '/img/icon-192.png',
  '/img/icon-512.png'
];
const PRIVATE_PATH_PREFIXES = ['/api/', '/auth/'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isCacheable(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const cacheControl = (response.headers.get('Cache-Control') || '').toLowerCase();
  return !cacheControl.includes('no-store') && !cacheControl.includes('private');
}

function isPrivateRequest(url) {
  return PRIVATE_PATH_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await caches.match('/index.html')) || (await caches.match('/verificar-pase.html')) || Response.error();
    }
    throw new Error('Recurso no disponible sin conexión.');
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request).then(response => {
    if (isCacheable(response)) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => null);
  if (cached) return cached;
  return (await network) || new Response('', { status: 504, statusText: 'Sin conexión' });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivateRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (['style', 'script', 'image', 'font', 'manifest'].includes(request.destination)
    || url.pathname.startsWith('/vendor/')
    || url.pathname.startsWith('/img/')) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
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
