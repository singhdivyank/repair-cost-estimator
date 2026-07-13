const CACHE_VERSION = 'v1';
const CACHE_NAME = `spark-estimator-${CACHE_VERSION}`;
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
];

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

const MODEL_HOST_PATTERN = /(^|\.)(huggingface\.co|hf\.co)$/i;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (MODEL_HOST_PATTERN.test(requestUrl.hostname)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const isSameOrigin = requestUrl.origin === self.location.origin;
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