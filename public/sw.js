const STATIC_CACHE = 'voyageai-static-v1';
const API_CACHE = 'voyageai-api-v1';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const valid = new Set([STATIC_CACHE, API_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !valid.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ───────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let origin;
  try {
    origin = new URL(request.url).origin;
  } catch {
    return;
  }
  if (origin !== self.location.origin) return;

  const path = new URL(request.url).pathname;

  // Next.js immutable build chunks → cache-first
  if (path.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Trip API calls → network-first with JSON fallback
  if (path.startsWith('/api/trips')) {
    event.respondWith(networkFirstJSON(request, API_CACHE));
    return;
  }

  // Navigation HTML → network-first with shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstHTML(request, STATIC_CACHE));
  }
});

// ─── Strategy helpers ─────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Service unavailable', { status: 503 });
  }
}

async function networkFirstJSON(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({
        success: false,
        error: { message: 'You are offline and no cached response is available.' },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function networkFirstHTML(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline', { status: 503 });
  }
}
