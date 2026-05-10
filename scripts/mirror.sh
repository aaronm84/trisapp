#!/usr/bin/env bash
# Mirror akouzoukos.com/apotris into ./mirror/ so we can wrap it as a PWA.
#
# Run this on a machine with internet access (the build sandbox blocks the host).
# Requires: wget. On macOS: `brew install wget`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mirror"
# /apotris/play/ is the actual wasm build (native Emscripten port, not an
# emulator wrapping a ROM). /apotris/ is the marketing page that links to it.
# We mirror both so links between them keep working offline.
URL="https://akouzoukos.com/apotris/"
PLAY_URL="https://akouzoukos.com/apotris/play/"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

echo "Mirroring $URL and $PLAY_URL into $OUT ..."
rm -rf "$OUT"
mkdir -p "$OUT"

# --mirror               recursive, timestamping, infinite depth
# --no-parent            don't ascend above /apotris/
# --page-requisites      grab JS/CSS/images/fonts/wasm/etc.
# --convert-links        rewrite links so it works offline
# --adjust-extension     give .html to served-as-HTML pages
# -e robots=off          ignore robots.txt
# -nH --cut-dirs=1       drop the leading "apotris/" directory
#
# We pass both URLs explicitly. wget would normally follow links from / into
# /play/, but Emscripten's index.html often loads its .wasm/.data/.js via
# JavaScript runtime fetches that wget can't see — so we force-recurse into
# /play/ to make sure those static assets are picked up.
wget \
  --user-agent="$UA" \
  --mirror \
  --no-parent \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  -e robots=off \
  -nH --cut-dirs=1 \
  -P "$OUT" \
  "$URL" "$PLAY_URL"

# Emscripten typically emits these alongside the entry HTML. wget's
# --page-requisites picks up <script src> but sometimes misses fetched .data
# and .wasm files. Probe for them under /play/.
for candidate in \
    apotris.js apotris.wasm apotris.data \
    index.js index.wasm index.data \
    main.js main.wasm main.data \
    play.js play.wasm play.data
do
  if [ ! -f "$OUT/play/$candidate" ]; then
    echo "Probing for play/$candidate ..."
    mkdir -p "$OUT/play"
    curl -fsSL -A "$UA" -o "$OUT/play/$candidate" \
      "https://akouzoukos.com/apotris/play/$candidate" 2>/dev/null \
      || rm -f "$OUT/play/$candidate"
  fi
done

# Sanity check: there should be a .wasm somewhere under play/.
if ! find "$OUT/play" -name '*.wasm' 2>/dev/null | grep -q .; then
  cat <<'WARN'

WARNING: no .wasm under mirror/play/. The Emscripten build may load assets
from a path the script didn't predict. Open
https://akouzoukos.com/apotris/play/ in a browser with DevTools open, watch
the Network tab for .wasm / .data / .js downloads, and save them manually
into ./mirror/play/. Then re-run ./scripts/build.sh.

Source repos for reference (in case you want to build from source instead):
  - https://gitea.com/akouzoukos/apotris   (official, post-DMCA)
  - https://github.com/gb-archive/apotris  (community mirror)

WARN
fi

echo "Done. Files in $OUT:"
find "$OUT" -maxdepth 2 -printf '  %p\n'
echo
echo "Next: run ./scripts/build.sh to fold the PWA shell on top and produce ./dist/"
