#!/usr/bin/env bash
# Mirror akouzoukos.com/apotris into ./mirror/ so we can wrap it as a PWA.
#
# Run this on a machine with internet access (the build sandbox blocks the host).
# Requires: wget. On macOS: `brew install wget`.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/mirror"
URL="https://akouzoukos.com/apotris/"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

echo "Mirroring $URL into $OUT ..."
rm -rf "$OUT"
mkdir -p "$OUT"

# --mirror               recursive, timestamping, infinite depth
# --no-parent            don't ascend above /apotris/
# --page-requisites      grab JS/CSS/images/fonts/wasm/etc.
# --convert-links        rewrite links so it works offline
# --adjust-extension     give .html to served-as-HTML pages
# --span-hosts -D ...    allow CDNs that the page references
# -e robots=off          ignore robots.txt
# -nH --cut-dirs=1       drop the leading "apotris/" directory
wget \
  --user-agent="$UA" \
  --mirror \
  --no-parent \
  --page-requisites \
  --convert-links \
  --adjust-extension \
  --span-hosts \
  --domains=akouzoukos.com \
  -e robots=off \
  -nH --cut-dirs=1 \
  -P "$OUT" \
  "$URL"

# Some GBA web ports load the ROM via fetch() at runtime. If wget missed it,
# try a few common locations explicitly.
for candidate in apotris.gba game.gba rom.gba apotris.zip; do
  if [ ! -f "$OUT/$candidate" ]; then
    echo "Probing for $candidate ..."
    curl -fsSL -A "$UA" -o "$OUT/$candidate" "https://akouzoukos.com/apotris/$candidate" || rm -f "$OUT/$candidate"
  fi
done

# If we still don't have a .gba ROM, try fetching the latest release from the
# official Gitea repo. The GitHub repo (akouzoukos/apotris) had its source
# removed via DMCA; gitea.com/akouzoukos/apotris is the upstream now.
if ! ls "$OUT"/*.gba >/dev/null 2>&1; then
  echo "No .gba in mirror. Trying gitea.com release feed ..."
  curl -fsSL -A "$UA" "https://gitea.com/api/v1/repos/akouzoukos/apotris/releases?limit=1" \
    -o /tmp/apotris-release.json || true
  if [ -s /tmp/apotris-release.json ]; then
    GBA_URL="$(python3 -c "
import json, sys
try:
    d = json.load(open('/tmp/apotris-release.json'))
    for r in d:
        for a in r.get('assets', []):
            if a.get('name','').endswith('.gba'):
                print(a['browser_download_url']); sys.exit()
except Exception:
    pass
")"
    if [ -n "${GBA_URL:-}" ]; then
      echo "  downloading $GBA_URL"
      curl -fsSL -A "$UA" -o "$OUT/apotris.gba" "$GBA_URL" || true
    fi
  fi
fi

if ! ls "$OUT"/*.gba >/dev/null 2>&1; then
  cat <<'WARN'

WARNING: no .gba ROM in mirror/. The browser build may stream it from
somewhere wget didn't follow. Options:

  1. Open https://akouzoukos.com/apotris/ in a browser, watch the Network
     tab for a .gba/.gbc/.zip download, save it manually into ./mirror/.
  2. Grab the latest release from https://gitea.com/akouzoukos/apotris/releases
     (or https://akouzoukos.itch.io/apotris) and drop the .gba into ./mirror/.
  3. Fall back to the source mirror: https://github.com/gb-archive/apotris

WARN
fi

echo "Done. Files in $OUT:"
ls -la "$OUT"
echo
echo "Next: run ./scripts/build.sh to fold the PWA shell on top and produce ./dist/"
