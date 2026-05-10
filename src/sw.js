// Apotris PWA service worker.
//
// Strategy:
//   - On install, fetch precache.json and cache every listed asset.
//   - On fetch, serve cached responses first; fall back to the network and
//     cache successful GETs for next time. This keeps it working with no
//     connection at all once the install round trip has finished.

const CACHE = 'apotris-__CACHE_VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const list = await fetch('precache.json', { cache: 'no-store' }).then(r => r.json());
    // Always include the entry doc and manifest even if precache.json missed them.
    const urls = Array.from(new Set([...list, '.', 'manifest.webmanifest']));
    // Cache one-by-one so a single 404 doesn't abort the whole install.
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) await cache.put(url, res);
      } catch (_) { /* offline-first: best-effort precache */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Range requests (used by some emulators streaming the ROM) need to bypass
  // the cache — Cache API doesn't honor Range headers.
  if (req.headers.has('range')) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      // Revalidate in the background.
      event.waitUntil(refresh(cache, req));
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      // Last-ditch fallback: the SPA shell.
      const shell = await cache.match('.') || await cache.match('index.html');
      if (shell && req.mode === 'navigate') return shell;
      throw err;
    }
  })());
});

async function refresh(cache, req) {
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res);
  } catch (_) { /* fine, we're offline */ }
}
