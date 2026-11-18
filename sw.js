// アプリ更新時はこのバージョンを上げる（例: natsudon-v2）
const CACHE_NAME = 'natsudon-v14';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './db.js',
  './utils.js',
  './recipes.js',
  './shopping.js',
  './custom_items.js',
  './history.js',
  './settings.js',
  './mealplan.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './ryourityou.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 外部リソース（CDN・フォント等）はキャッシュしない
  if (request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response && response.ok && request.method === 'GET') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
    );
  }
});
