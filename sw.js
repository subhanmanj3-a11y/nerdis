// ─── Neardis Service Worker ───────────────────────────────────────────────────
// Provides offline support, asset caching, and background sync

const SW_VERSION    = 'neardis-v1.0.0';
const STATIC_CACHE  = `${SW_VERSION}-static`;
const API_CACHE     = `${SW_VERSION}-api`;
const IMAGE_CACHE   = `${SW_VERSION}-images`;

// ─── Assets to pre-cache on install ──────────────────────────────────────────
const PRECACHE_ASSETS = [
  '/client/index.html',
  '/client/pages/map.html',
  '/client/pages/category.html',
  '/client/pages/deal.html',
  '/client/pages/online.html',
  '/client/pages/login.html',
  '/client/pages/signup.html',
  '/client/css/global.css',
  '/client/css/index.css',
  '/client/css/map.css',
  '/client/css/deal.css',
  '/client/css/category.css',
  '/client/css/online.css',
  '/client/css/auth.css',
  '/client/js/api.js',
  '/client/js/global.js',
  '/client/js/haversine.js',
  '/client/js/timer.js',
  '/client/js/index.js',
  '/client/js/map.js',
  '/client/js/deal.js',
  '/client/js/category.js',
  '/client/js/online.js',
  '/client/js/auth.js',
  '/client/manifest.json'
];

// ─── Offline Fallback HTML ────────────────────────────────────────────────────
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offline — Neardis</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #080c14;
      color: #f0f4ff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .offline-wrap { max-width: 360px; }
    .offline-icon { font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.7; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; }
    p  { color: #8b9ab5; font-size: 0.9375rem; line-height: 1.6; margin-bottom: 1.5rem; }
    button {
      background: linear-gradient(135deg, #ff2d55, #ff6b35);
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="offline-wrap">
    <div class="offline-icon">📡</div>
    <h1>You're Offline</h1>
    <p>No internet connection. Check your connection and try again — deals will be waiting for you!</p>
    <button onclick="window.location.reload()">Try Again</button>
  </div>
</body>
</html>`;

// ─── Install Event ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing:', SW_VERSION);

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      // Pre-cache static assets (fail silently on missing files)
      await Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err.message))
        )
      );
      console.log('[SW] Static assets cached');
    })
  );

  // Take control immediately (skip waiting)
  self.skipWaiting();
});

// ─── Activate Event ───────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating:', SW_VERSION);

  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      const validCaches = [STATIC_CACHE, API_CACHE, IMAGE_CACHE];

      await Promise.all(
        cacheNames
          .filter(name => !validCaches.includes(name))
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );

  // Take control of all open clients immediately
  self.clients.claim();
});

// ─── Fetch Event ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser-extension requests
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── API Requests: Network first, cache fallback ──────────────────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstAPI(request));
    return;
  }

  // ── Image Requests: Cache first, network fallback ────────────────────────
  if (
    request.destination === 'image' ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('res.cloudinary.com')
  ) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  // ── CDN Resources (Leaflet, Chart.js etc): Cache first ───────────────────
  if (
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // ── App Shell (HTML/CSS/JS): Stale while revalidate ──────────────────────
  if (
    request.destination === 'document' ||
    request.destination === 'script'   ||
    request.destination === 'style'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ── Default: Network first ───────────────────────────────────────────────
  event.respondWith(networkFirst(request));
});

// ─── Caching Strategies ───────────────────────────────────────────────────────

// Network first → cache fallback (for API calls)
async function networkFirstAPI(request) {
  try {
    const response = await fetch(request.clone(), { signal: AbortSignal.timeout(8000) });

    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      // Only cache GET deal/category listing endpoints
      const url = new URL(request.url);
      const shouldCache = url.pathname.startsWith('/api/deals') || url.pathname.startsWith('/api/businesses');
      if (shouldCache) {
        cache.put(request, response.clone()).catch(() => {});
      }
    }

    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({
      success: false,
      message: 'You are offline. Showing cached data may be unavailable.',
      offline: true
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Cache first → network fallback → placeholder (for images)
async function cacheFirstImage(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone(), { signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const cache = await caches.open(IMAGE_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    // Return SVG placeholder
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#141d2e"/>
        <text x="200" y="160" font-size="48" text-anchor="middle" fill="#4a5568">🖼️</text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

// Cache first → network fallback (for static assets + CDN)
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response('Resource unavailable offline.', { status: 503 });
  }
}

// Stale while revalidate (for HTML/CSS/JS app shell)
async function staleWhileRevalidate(request) {
  const cache  = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request.clone())
    .then(response => {
      if (response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);

  return cached || await networkFetch || offlineFallback(request);
}

// Network first (general fallback)
async function networkFirst(request) {
  try {
    return await fetch(request.clone(), { signal: AbortSignal.timeout(8000) });
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

// Offline fallback page
function offlineFallback(request) {
  if (request.destination === 'document') {
    return new Response(OFFLINE_HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
  return new Response('Offline', { status: 503 });
}

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data?.json() || {};
  } catch {
    data = { title: 'Neardis', body: event.data?.text() || 'New deal near you!' };
  }

  const options = {
    body:    data.body    || 'Check out the latest deals near you!',
    icon:    data.icon    || '/client/assets/icon-192.png',
    badge:   data.badge   || '/client/assets/badge-72.png',
    image:   data.image   || undefined,
    data:    data.url     || '/client/index.html',
    tag:     data.tag     || 'neardis-deal',
    renotify: true,
    requireInteraction: data.urgent || false,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'view', title: '🔥 View Deal' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || '🔥 New Deal Near You!', options)
  );
});

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data || '/client/index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-bookmarks') {
    event.waitUntil(syncBookmarks());
  }
  if (event.tag === 'sync-sightings') {
    event.waitUntil(syncSightings());
  }
});

async function syncBookmarks() {
  // Placeholder: sync queued bookmarks when back online
  console.log('[SW] Syncing bookmarks…');
}

async function syncSightings() {
  // Placeholder: sync queued sightings when back online
  console.log('[SW] Syncing sightings…');
}

// ─── Message Handler (from client pages) ─────────────────────────────────────
self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (type === 'CACHE_DEAL') {
    // Cache a specific deal page proactively
    if (payload?.url) {
      caches.open(STATIC_CACHE).then(cache => cache.add(payload.url).catch(() => {}));
    }
  }

  if (type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

console.log('[SW] Neardis Service Worker loaded:', SW_VERSION);
