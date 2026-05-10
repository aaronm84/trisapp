#!/usr/bin/env bash
# Build the trisapp PWA from src/ into dist/.
#
# Steps:
#   1. Copy src/* -> dist/
#   2. Stamp the service worker with a fresh cache version
#   3. Generate the precache list from everything in dist/

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"

if [ ! -d "$SRC" ]; then
  echo "ERROR: $SRC does not exist." >&2
  exit 1
fi

echo "[1/3] Copying src -> dist"
rm -rf "$DIST"
mkdir -p "$DIST"
cp -R "$SRC"/. "$DIST"/

echo "[2/3] Stamping service worker with cache version"
STAMP="$(date +%Y%m%d%H%M%S)"
sed -i.bak "s/__CACHE_VERSION__/$STAMP/g" "$DIST/sw.js" && rm "$DIST/sw.js.bak"

echo "[3/3] Generating precache list"
node "$ROOT/scripts/precache.js" "$DIST"

echo
echo "Build complete. Serve $DIST over HTTPS to install on iOS."
echo "Local test: (cd $DIST && python3 -m http.server 8080)"
