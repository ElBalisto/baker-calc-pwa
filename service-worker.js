const CACHE = 'baker-calc-inline-v2'; // ← bump this on each deploy
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const isHTML = req.destination === 'document' || req.url.endsWith('.html') || req.url.endsWith('/');

  if (isHTML) {
    // Network-first for HTML: always try to get fresh content
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
          return resp;
        })
        .catch(() => caches.match(req)) // fall back to cache if offline
    );
  } else {
    // Cache-first for static assets (icons, manifest, etc.)
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy));
        return resp;
      }))
    );
  }
});
