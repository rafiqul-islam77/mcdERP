// sw.js - GMS MCD ERP Service Worker (Offline + Push Notifications + Badge)
const CACHE_NAME = 'gms-erp-v3';
const OFFLINE_PAGE = '/index.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/notice.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((names) => 
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match(OFFLINE_PAGE);
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// 🔔 BACKGROUND PUSH NOTIFICATIONS
self.addEventListener('push', (event) => {
  let payload = { title: 'GMS ERP', body: 'New notice' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    payload = { title: 'GMS ERP', body: event.data?.text() || 'New notice' };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  
  const options = {
    body: notif.body || payload.body || 'New notice',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [100, 50, 100],
    sound: 'default',
    tag: 'gms-notice-' + Date.now(),
    actions: [
      { action: 'open', title: '📖 Open' },
      { action: 'close', title: '❌ Close' }
    ],
    data: { url: data.url || '/notice.html' }
  };

  event.waitUntil(
    self.registration.showNotification(notif.title || payload.title || 'GMS ERP', options).then(() => {
      if (self.registration.setAppBadge) {
        self.registration.getNotifications().then(notifs => {
          self.registration.setAppBadge(notifs.length);
        });
      }
    })
  );
});

//  NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notice.html';
  
  if (event.action === 'close' || event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('notice.html') || client.url.includes('index.html')) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// 📨 MESSAGE FROM CLIENT (Badge Clear / Sync)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_BADGE' && self.registration.clearAppBadge) {
    self.registration.clearAppBadge();
  }
});
