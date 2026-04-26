// Cache name injected dynamically by server.js → always changes on deploy
const CACHE = 'bursa-v1';

// We only cache the shell HTML for offline fallback.
// JS / CSS / API are always fetched fresh from the network.
const OFFLINE_SHELL = '/';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.add(OFFLINE_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // API calls — always network, never cache
  if (url.includes('/api/')) return;

  // JS / CSS — network first, no cache (ensures fresh code on every load)
  if (url.includes('.js') || url.includes('.css')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Navigation (HTML) — network first, fall back to cached shell if offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(OFFLINE_SHELL))
  );
});
