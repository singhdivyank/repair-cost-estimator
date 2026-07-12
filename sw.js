// Service worker for the single-file build. Precache list is intentionally
// tiny — index.html is fully self-contained (CSS/JS/logo all inlined), so
// there's nothing else local to cache besides itself and the manifest.
//
// IMPORTANT: only activates when this app is served over HTTPS or
// localhost — service workers cannot register at all over file://, per
// the browser's secure-context requirement. That's true for every PWA,
// not specific to this app.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `spark-estimator-single-${CACHE_VERSION}`;

const PRECACHE_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for everything, including cross-origin. Same-origin covers
// the app shell; cross-origin covers the lazily-loaded OCR/export/AI CDN
// modules, which get cached after their first successful (online) load so
// subsequent uses work fully offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const isSameOrigin = new URL(request.url).origin === self.location.origin;
          const cacheable = response && (response.ok || (!isSameOrigin && response.type === 'opaque'));
          if (cacheable) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
          return caches.match(request);
        });
    })
  );
});