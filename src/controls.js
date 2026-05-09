// Touch overlay for the GBA emulator. Synthesizes keydown/keyup events on
// window so the underlying emulator (which listens for keyboard input) reacts.
// Auto-hides when a Bluetooth/USB gamepad is connected.
//
// Default key map matches mGBA-web defaults: arrows + Z/X + Enter/Backspace.
// If the embedded emulator uses a different map, edit KEYS below.

(() => {
  const KEYS = {
    up:     { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
    down:   { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
    left:   { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
    right:  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    a:      { key: 'x',          code: 'KeyX',       keyCode: 88 },
    b:      { key: 'z',          code: 'KeyZ',       keyCode: 90 },
    start:  { key: 'Enter',      code: 'Enter',      keyCode: 13 },
    select: { key: 'Backspace',  code: 'Backspace',  keyCode: 8  },
  };

  const root = document.getElementById('pwa-controls');
  if (!root) return;

  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;  // desktops: don't show, keep the keyboard

  root.hidden = false;
  root.innerHTML = `
    <div class="dpad">
      <div class="center"></div>
      <div class="pad up"    data-k="up">▲</div>
      <div class="pad down"  data-k="down">▼</div>
      <div class="pad left"  data-k="left">◀</div>
      <div class="pad right" data-k="right">▶</div>
    </div>
    <div class="ab">
      <div class="btn a" data-k="a">A</div>
      <div class="btn b" data-k="b">B</div>
    </div>
    <div class="sysrow">
      <div class="sys" data-k="select">Select</div>
      <div class="sys" data-k="start">Start</div>
    </div>
    <button class="toggle" type="button" aria-label="Hide controls">×</button>
  `;

  const fire = (type, name) => {
    const k = KEYS[name];
    if (!k) return;
    const target = document.activeElement && document.activeElement.tagName === 'CANVAS'
      ? document.activeElement
      : window;
    const ev = new KeyboardEvent(type, {
      key: k.key, code: k.code, keyCode: k.keyCode, which: k.keyCode,
      bubbles: true, cancelable: true,
    });
    target.dispatchEvent(ev);
  };

  const bind = (el) => {
    const name = el.dataset.k;
    if (!name) return;
    let down = false;
    const press = (e) => {
      if (down) return;
      down = true;
      el.classList.add('active');
      fire('keydown', name);
      if (navigator.vibrate) navigator.vibrate(8);
      e.preventDefault();
    };
    const release = (e) => {
      if (!down) return;
      down = false;
      el.classList.remove('active');
      fire('keyup', name);
      e.preventDefault();
    };
    el.addEventListener('touchstart', press,   { passive: false });
    el.addEventListener('touchend',   release, { passive: false });
    el.addEventListener('touchcancel',release, { passive: false });
    el.addEventListener('mousedown',  press);
    el.addEventListener('mouseup',    release);
    el.addEventListener('mouseleave', release);
  };

  root.querySelectorAll('[data-k]').forEach(bind);

  // Hide/show toggle (state survives reloads via localStorage)
  const toggle = root.querySelector('.toggle');
  const HIDDEN = 'apotris-controls-hidden';
  const apply = () => {
    const hidden = localStorage.getItem(HIDDEN) === '1';
    root.querySelectorAll('.dpad,.ab,.sysrow').forEach(n => n.style.display = hidden ? 'none' : '');
    toggle.textContent = hidden ? '⌘' : '×';
  };
  toggle.addEventListener('click', () => {
    localStorage.setItem(HIDDEN, localStorage.getItem(HIDDEN) === '1' ? '0' : '1');
    apply();
  });
  apply();

  // Gamepad: auto-hide overlay when one connects, restore when removed.
  const refreshGamepad = () => {
    const gps = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    const connected = Array.from(gps).some(Boolean);
    root.style.opacity = connected ? '0' : '';
    root.style.pointerEvents = connected ? 'none' : '';
  };
  window.addEventListener('gamepadconnected', refreshGamepad);
  window.addEventListener('gamepaddisconnected', refreshGamepad);
  refreshGamepad();

  // Forward gamepad input to keys. Polled at rAF; cheap.
  const GP_MAP = {
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
    0: 'a', 1: 'b',
    9: 'start', 8: 'select',
  };
  const lastDown = new Set();
  const poll = () => {
    const gps = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    const now = new Set();
    for (const gp of gps) {
      if (!gp) continue;
      gp.buttons.forEach((btn, i) => {
        const name = GP_MAP[i];
        if (!name) return;
        if (btn.pressed) now.add(name);
      });
      // Treat left stick as d-pad too
      const [ax, ay] = gp.axes;
      if (ax < -0.5) now.add('left');
      if (ax >  0.5) now.add('right');
      if (ay < -0.5) now.add('up');
      if (ay >  0.5) now.add('down');
    }
    for (const k of now) if (!lastDown.has(k)) fire('keydown', k);
    for (const k of lastDown) if (!now.has(k)) fire('keyup', k);
    lastDown.clear();
    now.forEach(k => lastDown.add(k));
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();
