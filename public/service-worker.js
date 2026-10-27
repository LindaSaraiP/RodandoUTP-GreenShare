const CACHE = 'rodando-utp-greenshare-v6.1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/css/styles.css?v=6.1.0',
  '/js/app.js?v=6.1.0',
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
