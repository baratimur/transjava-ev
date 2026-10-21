const CACHE_NAME = 'spklu-v2'; // Bump this version on every update
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './stations.json',
  './highway.json',
  './cities.json',
  './i18n.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // Delete old cached versions
          }
        })
      )
    )
  );
  return self.clients.claim(); // Take control of all open client tabs immediately
});