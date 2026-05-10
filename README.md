# trisapp

A generic falling-block puzzle game built as an **installable, offline-capable
PWA** — add it to your iPhone home screen and play with no App Store involved.

Vanilla JavaScript + canvas. No framework, no wasm, no shared memory, no
cross-origin isolation gymnastics. Just a single page that loads, caches, and
runs anywhere a service worker does.

## What's here

- `src/index.html` — game shell with status bar, board, hold/next side panels,
  on-screen touch controls, and an overlay menu.
- `src/game.js` — game logic: 7-bag randomizer, wall kicks, DAS, lock delay
  with a move-count cap, hold piece, ghost piece, scoring, level progression
  with the standard gravity curve.
- `src/style.css` — dark, mobile-first layout. Responsive board sizing.
  Safe-area-aware for iPhone notches.
- `src/sw.js` — straightforward cache-first service worker.
- `src/register-sw.js` — minimal SW registration.
- `src/manifest.webmanifest` — PWA manifest with absolute scope.
- `src/404.html` — redirect-to-root safety net for any path drift.
- `scripts/build.sh` — copies `src/` → `dist/`, stamps the SW cache version,
  generates a precache list.
- `scripts/precache.js` — walks `dist/` and writes `precache.json`.
- `scripts/make-icons.py` — regenerates placeholder icons.
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages on push.

## Quick start

```bash
./scripts/build.sh                       # produces ./dist/
cd dist && python3 -m http.server 8080   # local sanity check
```

For iOS install you need HTTPS — push to `main`, let GitHub Actions deploy to
Pages, then on your iPhone open the Pages URL in **Safari** → Share → **Add
to Home Screen**. First load caches everything; subsequent launches work
offline.

## Controls

**Keyboard**

| Key | Action |
| --- | --- |
| ← → | Move |
| ↓ | Soft drop |
| Space | Hard drop |
| Z | Rotate left |
| X / ↑ | Rotate right |
| C / Shift | Hold |
| P / Esc | Pause |

**Touch**: D-pad on the bottom-left (left / soft drop / right). Action buttons
on the bottom-right (rotate left, rotate right, hold, hard drop).

## Customizing

- **Icons:** replace `src/icons/*.png` with your own (or rerun
  `python3 scripts/make-icons.py` to regenerate placeholders).
- **Piece colors / shapes:** edit the `PIECES` table at the top of `src/game.js`.
- **Difficulty curve:** tweak `BASE_GRAVITY_MS`, `LOCK_DELAY_MS`, and the
  level-up gravity formula in `clearLines()`.

## History

This repo previously wrapped a third-party WebAssembly game build as a PWA.
iOS standalone-PWA mode has long-standing quirks around pthread workers and
cross-origin isolation, and we couldn't reliably get that build loading
inside an installed iPhone PWA on top of GitHub Pages. The fix was to drop
the wasm wrapper entirely and write a from-scratch JavaScript implementation,
which sidesteps the entire COI/SAB/pthread story.
