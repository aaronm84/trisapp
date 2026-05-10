# trisapp

Wraps the playable web build of [Apotris](https://akouzoukos.com/apotris) as an
**installable, offline-capable PWA** — so you can add it to your iPhone home
screen and play on the subway with no App Store involved.

## What this repo is (and isn't)

It does **not** contain the Apotris game. Apotris started as a GBA homebrew but
since v4.0 has native ports (Win/Mac/Linux/Switch/Web). The web build at
`akouzoukos.com/apotris/play/` is the **native port compiled to wasm via
Emscripten + SDL2** — not an emulator running a GBA ROM. The source lives at
[gitea.com/akouzoukos/apotris](https://gitea.com/akouzoukos/apotris) (the
GitHub copy was DMCA'd by Tetris Co., community mirror at
[github.com/gb-archive/apotris](https://github.com/gb-archive/apotris)).

This repo contains:

- `scripts/mirror.sh` — downloads the deployed site (HTML/JS/WASM/ROM) into `mirror/`
- `scripts/build.sh` — copies `mirror/` + the PWA shell in `src/` into `dist/`
- `src/` — `manifest.webmanifest`, `sw.js` (service worker), iOS meta tags,
  on-screen D-pad / A-B / Start-Select overlay, gamepad support, icons
- `.github/workflows/deploy.yml` — mirrors + builds + publishes to GitHub Pages

## Quick start

```bash
./scripts/mirror.sh        # needs internet, populates ./mirror/
./scripts/build.sh         # produces ./dist/
cd dist && python3 -m http.server 8080   # local sanity check
```

For real iOS install you need HTTPS — push to `main`, let GitHub Actions deploy
to Pages, then on your iPhone open the Pages URL in **Safari** (not Chrome) →
Share → **Add to Home Screen**.

After the first launch online, everything is cached and works offline.

## Customizing

- **Icon:** replace `src/icons/*.png` with your own (or rerun
  `python3 scripts/make-icons.py` to regenerate placeholders).
- **Key map:** the overlay synthesizes keyboard events. The native port reads
  these via SDL2; if a button feels wrong, edit `KEYS` in `src/controls.js`
  and/or remap inside the in-game controls menu (it's customizable).
- **Hide overlay:** tap the `×` in the top-right corner of the running app.
  State persists in localStorage.

## A note on touch input

Apotris's official FAQ says the web port "does not yet support mobile
platforms." The overlay in `src/controls.js` works around this by synthesizing
`KeyboardEvent`s on `document`, `window`, and the canvas — SDL2's emscripten
layer routes those into `SDL_KEYDOWN`/`SDL_KEYUP`, which the game does
process. If a future Apotris release adds real touch input, the overlay can
just be removed.

## Hosting note (DMCA)

Apotris was DMCA'd off GitHub by Tetris Co. Hosting a public PWA at a
discoverable URL may attract the same. For personal use, options:

1. Keep the source repo private; GitHub Pages still serves the built site.
2. Use Cloudflare Pages with an obscure subdomain.
3. Self-host on your own domain.

Any HTTPS origin works for iOS PWA install; once installed the home-screen
shortcut keeps working even if the original URL goes away.

## Offline guarantees

- First load needs internet (precache fills).
- Every asset in `dist/` ends up in the SW cache, including the wasm/data files.
- Saves go to IndexedDB / localStorage, which persist across launches.
- iOS can evict caches if storage is critically low and the app hasn't been
  opened in weeks. Rare in practice.
