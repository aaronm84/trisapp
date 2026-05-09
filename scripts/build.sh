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

# Locate the entry HTML. wget usually saves it as index.html, but some sites
# end up with apotris.html or similar.
INDEX=""
for candidate in index.html apotris.html index.htm; do
  if [ -f "$DIST/$candidate" ]; then
    INDEX="$DIST/$candidate"
    break
  fi
done
if [ -z "$INDEX" ]; then
  echo "ERROR: couldn't find an index HTML in $DIST" >&2
  exit 1
fi
echo "    entry = $INDEX"

echo "[3/5] Injecting PWA tags into $INDEX"
node "$ROOT/scripts/inject.js" "$INDEX"

echo "[4/5] Stamping service worker with cache version"
STAMP="$(date +%Y%m%d%H%M%S)"
# macOS sed and GNU sed differ on -i; use a portable form.
sed -i.bak "s/__CACHE_VERSION__/$STAMP/g" "$DIST/sw.js" && rm "$DIST/sw.js.bak"

echo "[5/5] Generating precache list"
node "$ROOT/scripts/precache.js" "$DIST"

echo
echo "Build complete. Serve $DIST over HTTPS to install on iOS."
echo "Quick local test: (cd $DIST && python3 -m http.server 8080)"
