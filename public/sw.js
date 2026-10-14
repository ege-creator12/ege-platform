// Minimal privacy-conscious service worker for the installable ОСНОВА shell.
const CACHE_NAME = 'osnova-pwa-shell-v1-20261014';
const OFFLINE_URL = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll([OFFLINE_URL, '/pwa-icon.svg', '/pwa-icon-192.png', '/pwa-icon-512.png']))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('osnova-pwa-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Always get authenticated SPA pages fresh. Never cache account or API data.
  event.respondWith(fetch(event.request, { cache: 'no-store' })
    .catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
});
