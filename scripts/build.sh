#!/usr/bin/env bash
# Build the offline-installable PWA from ./mirror/ + ./src/ into ./dist/.
#
# Steps:
#   1. Copy mirror/ -> dist/
#   2. Copy src/* -> dist/ (manifest, service worker, controls, icons)
#   3. Inject PWA <link>/<meta> tags and the controls/SW bootstrap into dist/index.html
#   4. Stamp the service worker with a fresh cache version
#   5. Generate a precache list from everything in dist/

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIRROR="$ROOT/mirror"
SRC="$ROOT/src"
DIST="$ROOT/dist"

if [ ! -d "$MIRROR" ]; then
  echo "ERROR: $MIRROR does not exist. Run ./scripts/mirror.sh first." >&2
  exit 1
fi

echo "[1/5] Copying mirror -> dist"
rm -rf "$DIST"
mkdir -p "$DIST"
cp -R "$MIRROR"/. "$DIST"/

echo "[2/5] Copying PWA shell from src/"
cp -R "$SRC"/. "$DIST"/

# The entry HTML for the PWA is /play/index.html (the wasm build).
# We keep / available too (the marketing page) but inject PWA tags into
# both so either is install-ready. We also write a top-level index.html
# that redirects to play/, so adding the root URL to the home screen
# still launches the game.
ENTRIES=()
for candidate in play/index.html play/apotris.html index.html apotris.html; do
  if [ -f "$DIST/$candidate" ]; then
    ENTRIES+=("$DIST/$candidate")
  fi
done
if [ "${#ENTRIES[@]}" -eq 0 ]; then
  echo "ERROR: couldn't find any entry HTML under $DIST" >&2
  exit 1
fi

echo "[3/5] Injecting PWA tags into ${#ENTRIES[@]} entry file(s)"
for entry in "${ENTRIES[@]}"; do
  echo "  -> $entry"
  node "$ROOT/scripts/inject.js" "$entry"
done

# If the only real entry is play/index.html, make root index.html a redirect
# so the home-screen icon (which uses start_url=".") opens the game.
if [ -f "$DIST/play/index.html" ] && ! grep -q '<canvas' "$DIST/index.html" 2>/dev/null; then
  cat > "$DIST/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Apotris</title>
<meta http-equiv="refresh" content="0; url=play/">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Apotris">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<script>location.replace('play/');</script>
HTML
fi

echo "[4/5] Stamping service worker with cache version"
STAMP="$(date +%Y%m%d%H%M%S)"
# macOS sed and GNU sed differ on -i; use a portable form.
sed -i.bak "s/__CACHE_VERSION__/$STAMP/g" "$DIST/sw.js" && rm "$DIST/sw.js.bak"

echo "[5/5] Generating precache list"
node "$ROOT/scripts/precache.js" "$DIST"

echo
echo "Build complete. Serve $DIST over HTTPS to install on iOS."
echo "Quick local test: (cd $DIST && python3 -m http.server 8080)"
