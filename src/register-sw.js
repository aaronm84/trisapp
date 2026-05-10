// Service worker registration for trisapp.
// No COI/SAB gymnastics needed — the game is plain JS, not a wasm pthread
// build — so this is just a standard offline-cache registration.

(function () {
  if (!('serviceWorker' in navigator)) return;

  const me = document.currentScript;
  const swUrl = me ? new URL('sw.js', me.src).href : 'sw.js';
  const scope = me ? new URL('./', me.src).href : './';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(swUrl, { scope }).catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
})();
