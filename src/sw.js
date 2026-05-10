// trisapp service worker — cache-first offline shell.
// No cross-origin isolation gymnastics needed: this build doesn't use
// SharedArrayBuffer or pthreads, so plain caching is enough.

const CACHE = 'trisapp-__CACHE_VERSION__';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let list = [];
    try {
      list = await fetch('precache.json', { cache: 'no-store' }).then((r) => r.json());
    } catch (_) {}
    const urls = Array.from(new Set([...list, '.', 'index.html', 'manifest.webmanifest']));
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) await cache.put(url, res);
      } catch (_) {}
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) {
      // background revalidate
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh.ok) await cache.put(req, fresh);
        } catch (_) {}
      })());
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      // offline fallback: serve the SPA shell for any navigation
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html') || await cache.match('.');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
