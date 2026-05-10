// Register the service worker. The SW lives next to this script (at the
// dist root) — but this script may be loaded from a nested page like
// /play/index.html via "../register-sw.js". Compute the SW URL from
// our own document.currentScript src so it works at any depth.

(function () {
  if (!('serviceWorker' in navigator)) return;

  // Resolve sw.js relative to this script, not relative to the page.
  // document.currentScript is null inside a deferred handler, so capture it
  // synchronously while the script is still executing.
  const me = document.currentScript;
  const swUrl = me ? new URL('sw.js', me.src).href : 'sw.js';
  // Scope the SW to its own directory (the dist root), so it controls /play/
  // and any other nested pages.
  const scope = me ? new URL('./', me.src).href : './';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
})();
