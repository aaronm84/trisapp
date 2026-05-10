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

# Override the upstream manifest.json (mirrored from akouzoukos.com) with
# our PWA manifest content. The upstream HTML still contains
# <link rel=manifest href="../manifest.json"> as the first manifest link,
# and iOS reads the first one. The upstream manifest declares
# start_url=/apotris/play/ and scope=/apotris/ — both 404 on this deploy,
# and that's where the installed PWA was being launched. Pointing the
# .json copy at our manifest neutralizes the bad redirect target.
cp "$SRC/manifest.webmanifest" "$DIST/manifest.json"

# Put the game at the deployment root by overwriting dist/index.html
# (the upstream marketing page) with a copy of dist/play/index.html that
# references its assets via play/. iOS standalone PWAs handle redirect
# chains and relative start_url resolution inconsistently, so the safest
# launch URL is one that serves the game directly with no hops. With the
# game at root, /trisapp/ works as the launch URL; /trisapp/play/ keeps
# working too (same content, asset paths are relative to that location).
if [ -f "$DIST/play/index.html" ]; then
  sed -E \
    -e 's|src="Apotris\.js"|src="play/Apotris.js"|g' \
    -e 's|href="favicon\.ico"|href="play/favicon.ico"|g' \
    "$DIST/play/index.html" > "$DIST/index.html"
fi

ENTRIES=()
for candidate in index.html play/index.html; do
  [ -f "$DIST/$candidate" ] && ENTRIES+=("$DIST/$candidate")
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

echo "[4/5] Stamping service worker with cache version"
STAMP="$(date +%Y%m%d%H%M%S)"
# macOS sed and GNU sed differ on -i; use a portable form.
sed -i.bak "s/__CACHE_VERSION__/$STAMP/g" "$DIST/sw.js" && rm "$DIST/sw.js.bak"

echo "[5/5] Generating precache list"
node "$ROOT/scripts/precache.js" "$DIST"

echo
echo "Build complete. Serve $DIST over HTTPS to install on iOS."
echo "Quick local test: (cd $DIST && python3 -m http.server 8080)"
