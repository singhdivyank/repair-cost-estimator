const CACHE_VERSION = 'v1';
const CACHE_NAME = `spark-estimator-${CACHE_VERSION}`;
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
  './js/services/photoService.js',
  './js/services/ocrService.js',
  './js/services/exportService.js',
  './js/services/aiService.js',
  './js/services/speechService.js',
  './js/screens/projectsScreen.js',
  './js/screens/newProjectWizard.js',
  './js/screens/roomsScreen.js',
  './js/screens/roomDetailScreen.js',
  './js/screens/summaryScreen.js',
  './js/screens/aiAdvisorScreen.js',
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