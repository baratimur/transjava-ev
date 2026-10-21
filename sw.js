const CACHE_NAME = 'transjava-ev-v1';
const ASSETS = [
  './',
  './index.html',
  './stations.json',
  './cities.json',
  './highway.json',
  './i18n.json',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
