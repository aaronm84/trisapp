// Register the service worker AND establish cross-origin isolation.
//
// Why this is more involved than a normal SW register:
//   Apotris is compiled with Emscripten pthreads, which need SharedArrayBuffer,
//   which needs the page to be cross-origin isolated (COOP/COEP headers set).
//   GitHub Pages can't set custom headers, so the SW synthesizes them — but
//   the SW only intercepts requests once it's controlling the page, which
//   doesn't happen on the visit that registers it. So on first visit, we
//   register, wait for activation, and reload once. Subsequent loads are
//   isolated and pthreads work.

(function () {
  if (!('serviceWorker' in navigator)) return;

  const me = document.currentScript;
  const swUrl = me ? new URL('sw.js', me.src).href : 'sw.js';
  const scope = me ? new URL('./', me.src).href : './';

  // Already isolated? SW is doing its job — register for caching and exit.
  if (window.crossOriginIsolated) {
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
    return;
  }

  navigator.serviceWorker.register(swUrl, { scope }).then((reg) => {
    // Guard against reload loops: if we've reloaded once and still aren't
    // isolated, something else is wrong. Don't loop.
    const reloadKey = 'trisapp-coi-reload';
    if (sessionStorage.getItem(reloadKey)) return;

    const reloadOnce = () => {
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    };

    // If a SW is already active and controlling but we still aren't isolated,
    // a reload right now will make the SW intercept and stamp headers.
    if (navigator.serviceWorker.controller) {
      reloadOnce();
      return;
    }

    // Otherwise wait for the new SW to activate, then reload.
    const installing = reg.installing || reg.waiting;
    const watch = (worker) => {
      if (!worker) return;
      if (worker.state === 'activated') return reloadOnce();
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') reloadOnce();
      });
    };
    watch(installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch((err) => {
    console.warn('SW registration failed:', err);
  });
})();
