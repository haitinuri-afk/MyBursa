// Cache name injected dynamically by server.js → always changes on deploy
const CACHE = 'bursa-v5';

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

// ── Web Push ──────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: '📋 בורסה — עדכון', body: 'דוח חדש זמין', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.svg',
      badge: '/icon-192.svg',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url },
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
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
