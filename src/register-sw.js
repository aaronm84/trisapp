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
  // On-screen diagnostic — iOS PWA standalone mode has no address bar
  // and no easy devtools, so we mirror state to a visible overlay.
  // ?diag=1 also enables it in regular Safari for testing.
  const showDiag = window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone
    || new URL(location.href).searchParams.has('diag');
  const log = (msg) => {
    if (!showDiag) return;
    try {
      let el = document.getElementById('trisapp-diag');
      if (!el) {
        el = document.createElement('div');
        el.id = 'trisapp-diag';
        el.style.cssText = 'position:fixed;top:env(safe-area-inset-top);left:0;right:0;background:#000;color:#0f0;font:10px ui-monospace,monospace;padding:6px 8px;z-index:2147483647;white-space:pre-wrap;opacity:.92;pointer-events:none;max-height:50vh;overflow:hidden';
        const attach = () => (document.body || document.documentElement).appendChild(el);
        if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
      }
      const t = new Date().toISOString().slice(11, 19);
      el.textContent = `[${t}] ${msg}\n` + el.textContent;
      if (el.textContent.length > 2000) el.textContent = el.textContent.slice(0, 2000);
    } catch (_) {}
  };

  if (!('serviceWorker' in navigator)) {
    log('no SW support');
    return;
  }

  const me = document.currentScript;
  const swUrl = me ? new URL('sw.js', me.src).href : 'sw.js';
  const scope = me ? new URL('./', me.src).href : './';

  const url = new URL(location.href);
  const attempts = parseInt(url.searchParams.get('coi') || '0', 10) || 0;
  const MAX_ATTEMPTS = 2;

  const hasSAB = typeof SharedArrayBuffer !== 'undefined';
  log(`url=${url.pathname}${url.search} COI=${window.crossOriginIsolated} SAB=${hasSAB} ctrl=${!!navigator.serviceWorker.controller} attempts=${attempts}`);

  if (window.crossOriginIsolated) {
    if (url.searchParams.has('coi')) {
      url.searchParams.delete('coi');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    // iOS standalone PWAs occasionally report crossOriginIsolated=true while
    // SharedArrayBuffer is still undefined — a delayed-engagement bug. One
    // hard reload through the SW usually engages SAB. Guard with sessionStorage
    // (fresh per PWA launch) so we don't loop.
    if (!hasSAB && !sessionStorage.getItem('trisapp-sab-prime')) {
      sessionStorage.setItem('trisapp-sab-prime', '1');
      log('COI but no SAB — priming reload');
      location.reload();
      return;
    }
    log('isolated' + (hasSAB ? ' + SAB' : ' but NO SAB') + ', registering for caching');
    navigator.serviceWorker.register(swUrl, { scope }).catch((e) => log('reg fail: ' + e));
    return;
  }

  if (attempts >= MAX_ATTEMPTS) {
    log('giving up after ' + attempts + ' reloads — COI never engaged');
    navigator.serviceWorker.register(swUrl, { scope }).catch(() => {});
    return;
  }

  const reloadOnce = () => {
    const next = new URL(location.href);
    next.searchParams.set('coi', String(attempts + 1));
    log('reloading -> ' + next.search);
    location.replace(next.href);
  };

  navigator.serviceWorker.register(swUrl, { scope }).then((reg) => {
    log('reg ok scope=' + reg.scope);

    if (navigator.serviceWorker.controller) {
      log('controller exists, reloading now');
      reloadOnce();
      return;
    }

    const watch = (worker, label) => {
      if (!worker) return;
      log(label + ' state=' + worker.state);
      if (worker.state === 'activated') return reloadOnce();
      worker.addEventListener('statechange', () => {
        log(label + ' -> ' + worker.state);
        if (worker.state === 'activated') reloadOnce();
      });
    };
    watch(reg.installing, 'installing');
    watch(reg.waiting, 'waiting');
    reg.addEventListener('updatefound', () => watch(reg.installing, 'installing(updatefound)'));

    // Fallback: ready resolves when an active worker exists, regardless of
    // which lifecycle event we caught. Triggers a reload if nothing else has.
    navigator.serviceWorker.ready.then(() => {
      log('ready resolved, ctrl=' + !!navigator.serviceWorker.controller);
      setTimeout(() => {
        if (!window.crossOriginIsolated && !location.search.includes('coi=')) {
          reloadOnce();
        }
      }, 250);
    });
  }).catch((err) => {
    log('reg fail: ' + err.message);
  });
})();
