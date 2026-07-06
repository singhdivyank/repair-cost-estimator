// Service worker: offline-first shell. Bump CACHE_VERSION whenever any
// precached file changes so clients pick up the update.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `spark-estimator-${CACHE_VERSION}`;

// Every static file the app needs to run with zero connectivity.
// IMPORTANT: keep this in sync as new js/screens files are added.
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/core/db.js',
  './js/core/localStore.js',
  './js/core/utils.js',
  './js/data/priceList.js',
  './js/data/roomTemplates.js',
  './js/repositories/projectRepository.js',
  './js/repositories/roomRepository.js',
  './js/repositories/repairRepository.js',
  './js/repositories/photoRepository.js',
  './js/repositories/equipmentRepository.js',
  './js/repositories/aiReportRepository.js',
  './js/services/pricingService.js',
  './js/screens/projectsScreen.js',
  './js/screens/newProjectWizard.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './assets/logo.png',
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

// Cache-first for everything same-origin (this app is fully self-contained).
// Falls back to the cached shell for navigation requests if a fetch fails,
// so the app still opens with no network at all.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (e.g. future AI model CDN fetches)

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
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
