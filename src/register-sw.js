// Register the service worker AND establish cross-origin isolation.
//
// Apotris is compiled with Emscripten pthreads, which need SharedArrayBuffer,
// which needs the page to be cross-origin isolated (COOP/COEP set). GitHub
// Pages can't set custom headers, so the SW synthesizes them — but the SW
// only intercepts requests once it's controlling the page, which doesn't
// happen on the visit that registers it. So on a non-isolated load, we
// register, wait for activation, and reload once. Subsequent loads through
// the SW are isolated and pthreads work.
//
// The reload guard is a ?coi=N query param on the URL, capped at N=2. Using
// a URL param (not sessionStorage) makes the guard tied to this specific
// page load attempt — so a later non-isolated load on the same tab can
// reload again instead of being permanently locked out by a stale flag.

(function () {
  if (!('serviceWorker' in navigator)) return;

  const me = document.currentScript;
  const swUrl = me ? new URL('sw.js', me.src).href : 'sw.js';
  const scope = me ? new URL('./', me.src).href : './';

  const url = new URL(location.href);
  const attempts = parseInt(url.searchParams.get('coi') || '0', 10) || 0;
  const MAX_ATTEMPTS = 2;

  // Already isolated? SW is doing its job. Register for caching and exit.
  if (window.crossOriginIsolated) {
    if (url.searchParams.has('coi')) {
      // Strip the marker so the address bar stays clean and shareable.
      url.searchParams.delete('coi');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
    return;
  }

  if (attempts >= MAX_ATTEMPTS) {
    console.warn('[trisapp] not cross-origin isolated after ' + attempts + ' reload(s); giving up. Pthreads will not work.');
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
    return;
  }

  navigator.serviceWorker.register(swUrl, { scope }).then((reg) => {
    const reloadOnce = () => {
      const next = new URL(location.href);
      next.searchParams.set('coi', String(attempts + 1));
      location.replace(next.href);
    };

    // Already-controlled page that still isn't isolated → reload through SW.
    if (navigator.serviceWorker.controller) {
      reloadOnce();
      return;
    }

    // Otherwise watch for the new SW to activate, then reload.
    const watch = (worker) => {
      if (!worker) return;
      if (worker.state === 'activated') return reloadOnce();
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') reloadOnce();
      });
    };
    watch(reg.installing || reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch((err) => {
    console.warn('SW registration failed:', err);
  });
})();
