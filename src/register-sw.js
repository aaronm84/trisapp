// Register the service worker. Scoped to the current directory so it works
// under e.g. https://user.github.io/apotris/.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
