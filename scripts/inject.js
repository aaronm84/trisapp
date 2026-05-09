#!/usr/bin/env node
// Inject PWA tags, iOS meta, the on-screen controls overlay, and the
// service-worker bootstrap into the mirrored index.html.
//
// Idempotent: re-running on an already-injected file is a no-op.

const fs = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('usage: inject.js <html-file>');
  process.exit(1);
}

let html = fs.readFileSync(file, 'utf8');

const HEAD_TAGS = `
    <!-- PWA -->
    <link rel="manifest" href="manifest.webmanifest">
    <meta name="theme-color" content="#101015">
    <meta name="color-scheme" content="dark light">

    <!-- iOS install -->
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Apotris">
    <link rel="apple-touch-icon" href="icons/icon-180.png">
    <link rel="apple-touch-icon" sizes="180x180" href="icons/icon-180.png">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="format-detection" content="telephone=no">

    <!-- Viewport: cover the notch, disable user zoom for game UX -->
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no,maximum-scale=1">

    <link rel="stylesheet" href="controls.css">
`;

const BODY_TAGS = `
    <div id="pwa-controls" hidden></div>
    <script src="controls.js" defer></script>
    <script src="register-sw.js" defer></script>
`;

if (!html.includes('manifest.webmanifest')) {
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, HEAD_TAGS + '\n  </head>');
  } else {
    html = HEAD_TAGS + html;
  }
} else {
  console.log('  head tags already present, skipping');
}

if (!html.includes('register-sw.js')) {
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, BODY_TAGS + '\n  </body>');
  } else {
    html = html + BODY_TAGS;
  }
} else {
  console.log('  body tags already present, skipping');
}

fs.writeFileSync(file, html);
console.log('  injected:', path.relative(process.cwd(), file));
