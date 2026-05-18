// trisapp — generic falling-block puzzle game.
// Vanilla JS + canvas, no framework, no wasm, no shared memory.

(function () {
  'use strict';

  // -------- constants --------
  const COLS = 10;
  const ROWS = 20;
  const SPAWN_ROWS = 2; // hidden rows above the board where pieces spawn

  // Standard 7 free tetrominoes, defined in their smallest bounding matrix.
  // Rotations are computed at runtime by rotating these matrices.
  const PIECES = {
    I: { color: '#22d3ee', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { color: '#facc15', shape: [[1,1],[1,1]] },
    T: { color: '#c084fc', shape: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { color: '#34d399', shape: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { color: '#f87171', shape: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { color: '#60a5fa', shape: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { color: '#fb923c', shape: [[0,0,1],[1,1,1],[0,0,0]] },
  };
  const PIECE_TYPES = Object.keys(PIECES);

  // Wall-kick offsets to try when a rotation collides. Simplified SRS:
  // try the rotation in place, then small horizontal nudges, then a 1-up
  // bump (helps T-spin-style entries near the floor).
  const KICKS = [
    [0, 0],
    [-1, 0], [1, 0],
    [0, -1],
    [-2, 0], [2, 0],
  ];

  const SCORE_TABLE = { 1: 100, 2: 300, 3: 500, 4: 800 };
  const SOFT_DROP_MS = 50;
  const LOCK_DELAY_MS = 500;
  const DAS_INITIAL_MS = 170; // delayed auto-shift: hold before repeat begins
  const DAS_REPEAT_MS = 45;
  const MAX_START_LEVEL = 10;
  // Goal lines needed to advance a level. Scales with the level so later
  // stages take longer despite the faster gravity. Level 1 = 20, +5 per level.
  function linesPerLevel(level) {
    return 20 + (level - 1) * 5;
  }

  // Per-difficulty gravity curve. base = ms/drop at level 1, factor = exponential
  // decay base. Computed as max(50, pow(factor - (lvl-1)*0.007, lvl-1) * base).
  const DIFFICULTIES = {
    easy:   { base: 1400, factor: 0.85, scoreMul: 0.8 },
    normal: { base: 1000, factor: 0.80, scoreMul: 1.0 },
    hard:   { base: 700,  factor: 0.75, scoreMul: 1.3 },
  };

  // Accent palette cycled by level. Each level picks the next color, wrapping.
  const LEVEL_COLORS = [
    '#4a90e2', '#22d3ee', '#34d399', '#facc15',
    '#fb923c', '#f87171', '#c084fc', '#e879f9',
  ];

  // localStorage keys
  const LS = {
    sound: 'trisapp-sound',
    vibrate: 'trisapp-vibrate',
    difficulty: 'trisapp-difficulty',
    startLevel: 'trisapp-start-level',
    bestScore: 'trisapp-best-score',
    bestLevel: 'trisapp-best-level',
    bestLines: 'trisapp-best-lines',
    totalLines: 'trisapp-total-lines',
    gamesPlayed: 'trisapp-games-played',
  };

  // -------- state --------
  const state = {
    board: makeBoard(),
    pieceType: null,
    pieceX: 0,
    pieceY: 0,
    pieceRotation: 0,
    queue: [],
    hold: null,
    canHold: true,
    score: 0,
    level: 1,
    lines: 0,
    linesInLevel: 0,
    scoreAtLevelStart: 0,
    status: 'menu', // 'menu' | 'playing' | 'paused' | 'levelup' | 'gameover'
    gravity: DIFFICULTIES.normal.base,
    gravityTimer: 0,
    lockTimer: 0,
    lockMoves: 0, // how many times the player has reset the lock delay
    softDrop: false,
    soundEnabled: true,
    vibrateEnabled: true,
    difficulty: 'normal',
    startLevel: 1,
    best: { score: 0, level: 1, lines: 0, totalLines: 0, gamesPlayed: 0 },
    isNewBest: false,
    lastFrame: 0,
    flashRows: null, // rows currently flashing during a line clear
    flashUntil: 0,
  };

  function gravityFor(level, difficulty) {
    const cfg = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
    return Math.max(50, Math.pow(cfg.factor - (level - 1) * 0.007, level - 1) * cfg.base);
  }

  function levelColor(level) {
    return LEVEL_COLORS[(level - 1) % LEVEL_COLORS.length];
  }

  function applyLevelColor() {
    document.documentElement.style.setProperty('--level-color', levelColor(state.level));
  }

  function makeBoard() {
    return Array.from({ length: ROWS + SPAWN_ROWS }, () => Array(COLS).fill(null));
  }

  // -------- piece helpers --------
  function rotateCW(m) {
    const n = m.length;
    const r = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        r[x][n - 1 - y] = m[y][x];
    return r;
  }

  function shapeFor(type, rotation) {
    let s = PIECES[type].shape;
    const r = ((rotation % 4) + 4) % 4;
    for (let i = 0; i < r; i++) s = rotateCW(s);
    return s;
  }

  function currentShape() {
    return shapeFor(state.pieceType, state.pieceRotation);
  }

  function collides(shape, x, y) {
    for (let py = 0; py < shape.length; py++) {
      for (let px = 0; px < shape[py].length; px++) {
        if (!shape[py][px]) continue;
        const bx = x + px;
        const by = y + py;
        if (bx < 0 || bx >= COLS) return true;
        if (by >= ROWS + SPAWN_ROWS) return true;
        if (by >= 0 && state.board[by][bx]) return true;
      }
    }
    return false;
  }

  function touchingGround() {
    return collides(currentShape(), state.pieceX, state.pieceY + 1);
  }

  // 7-bag randomizer. Each "bag" is a shuffled copy of all 7 piece types.
  function refillQueue() {
    while (state.queue.length < 7) {
      const bag = PIECE_TYPES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      state.queue.push(...bag);
    }
  }

  function spawn(type) {
    state.pieceType = type;
    state.pieceRotation = 0;
    const s = shapeFor(type, 0);
    state.pieceX = Math.floor((COLS - s[0].length) / 2);
    state.pieceY = type === 'I' ? 0 : 1; // spawn in hidden rows
    state.lockTimer = 0;
    state.lockMoves = 0;
    if (collides(s, state.pieceX, state.pieceY)) {
      gameOver();
    }
  }

  function nextPiece() {
    refillQueue();
    spawn(state.queue.shift());
    state.canHold = true;
  }

  // -------- movement --------
  function move(dx, dy) {
    if (!collides(currentShape(), state.pieceX + dx, state.pieceY + dy)) {
      state.pieceX += dx;
      state.pieceY += dy;
      if (touchingGround() && state.lockMoves < 15) {
        state.lockTimer = 0;
        state.lockMoves++;
      }
      return true;
    }
    return false;
  }

  function rotate(dir) {
    const newRot = state.pieceRotation + dir;
    const s = shapeFor(state.pieceType, newRot);
    for (const [dx, dy] of KICKS) {
      if (!collides(s, state.pieceX + dx, state.pieceY + dy)) {
        state.pieceX += dx;
        state.pieceY += dy;
        state.pieceRotation = newRot;
        if (touchingGround() && state.lockMoves < 15) {
          state.lockTimer = 0;
          state.lockMoves++;
        }
        playSound('rotate');
        return true;
      }
    }
    return false;
  }

  function ghostY() {
    let y = state.pieceY;
    const s = currentShape();
    while (!collides(s, state.pieceX, y + 1)) y++;
    return y;
  }

  function hardDrop() {
    const target = ghostY();
    const cells = target - state.pieceY;
    state.score += cells * 2;
    state.pieceY = target;
    playSound('drop');
    vibrate(15);
    lock();
  }

  function softDrop() {
    if (move(0, 1)) state.score += 1;
  }

  // -------- locking + line clears --------
  function lock() {
    const s = currentShape();
    let touchedTop = false;
    for (let py = 0; py < s.length; py++) {
      for (let px = 0; px < s[py].length; px++) {
        if (!s[py][px]) continue;
        const bx = state.pieceX + px;
        const by = state.pieceY + py;
        if (by < SPAWN_ROWS) touchedTop = true;
        if (by >= 0) state.board[by][bx] = state.pieceType;
      }
    }
    clearLines();
    if (touchedTop && everyLockedBlockAboveBoard()) {
      // Locked entirely in hidden rows = top-out
      gameOver();
      return;
    }
    nextPiece();
  }

  function everyLockedBlockAboveBoard() {
    for (let y = SPAWN_ROWS; y < state.board.length; y++)
      for (let x = 0; x < COLS; x++)
        if (state.board[y][x]) return false;
    return true;
  }

  function clearLines() {
    const fullRows = [];
    for (let y = 0; y < state.board.length; y++) {
      if (state.board[y].every((c) => c)) fullRows.push(y);
    }
    if (fullRows.length === 0) {
      playSound('lock');
      return;
    }
    // Brief flash before removing — purely cosmetic
    state.flashRows = fullRows;
    state.flashUntil = performance.now() + 110;

    for (const y of fullRows) {
      state.board.splice(y, 1);
      state.board.unshift(Array(COLS).fill(null));
    }
    state.lines += fullRows.length;
    state.linesInLevel += fullRows.length;
    const mul = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal).scoreMul;
    state.score += Math.round((SCORE_TABLE[fullRows.length] || 1200) * state.level * mul);
    playSound('lineclear', fullRows.length);
    vibrate(fullRows.length === 4 ? 30 : 12);
    const goal = linesPerLevel(state.level);
    if (state.linesInLevel >= goal) {
      state.linesInLevel -= goal;
      state.level += 1;
      state.gravity = gravityFor(state.level, state.difficulty);
      applyLevelColor();
      levelUp();
    }
  }

  function holdPiece() {
    if (!state.canHold) return;
    state.canHold = false;
    const prev = state.hold;
    state.hold = state.pieceType;
    if (prev) spawn(prev);
    else nextPiece();
    playSound('hold');
  }

  // -------- audio --------
  let audioCtx = null;
  function getAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) { return null; }
    return audioCtx;
  }

  function tone(freq, dur, type = 'square', gainPeak = 0.08) {
    if (!state.soundEnabled) return;
    const ctx = getAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gainPeak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function playSound(kind, n) {
    if (!state.soundEnabled) return;
    switch (kind) {
      case 'rotate':    tone(520, 0.04); break;
      case 'lock':      tone(220, 0.06, 'triangle'); break;
      case 'drop':      tone(140, 0.10, 'square', 0.10); break;
      case 'hold':      tone(660, 0.05, 'triangle'); break;
      case 'lineclear': {
        const base = 440 + (n - 1) * 120;
        tone(base, 0.10, 'triangle');
        setTimeout(() => tone(base * 1.5, 0.12, 'triangle'), 80);
        if (n >= 4) setTimeout(() => tone(base * 2, 0.16, 'triangle'), 180);
        break;
      }
      case 'levelup': {
        // Ascending major-ish arpeggio.
        tone(523, 0.08, 'triangle', 0.10);
        setTimeout(() => tone(659, 0.08, 'triangle', 0.10), 90);
        setTimeout(() => tone(784, 0.10, 'triangle', 0.10), 180);
        setTimeout(() => tone(1046, 0.14, 'triangle', 0.10), 280);
        break;
      }
      case 'gameover': {
        const ctx = getAudio();
        if (!ctx) return;
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.6);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.65);
        break;
      }
    }
  }

  function vibrate(ms) {
    if (state.vibrateEnabled && navigator.vibrate) navigator.vibrate(ms);
  }

  // -------- rendering --------
  const boardCanvas = document.getElementById('board');
  const boardCtx = boardCanvas.getContext('2d');
  const holdCanvas = document.getElementById('hold');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nextCtx = nextCanvas.getContext('2d');
  let cellSize = 30;

  function resizeBoard() {
    const wrap = document.getElementById('play');
    const r = wrap.getBoundingClientRect();
    // 1:2 aspect (COLS:ROWS). Fit whichever dimension is the constraint,
    // accounting for the wrap's padding.
    const styles = getComputedStyle(wrap);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const cellByH = Math.floor((r.height - padY) / ROWS);
    const cellByW = Math.floor((r.width - padX) / COLS);
    cellSize = Math.max(6, Math.min(cellByH, cellByW));
    boardCanvas.width = cellSize * COLS;
    boardCanvas.height = cellSize * ROWS;
    boardCanvas.style.width = (cellSize * COLS) + 'px';
    boardCanvas.style.height = (cellSize * ROWS) + 'px';
  }

  function drawCell(ctx, x, y, color, size, alpha) {
    const a = alpha == null ? 1 : alpha;
    ctx.globalAlpha = a;
    ctx.fillStyle = color;
    ctx.fillRect(x * size, y * size, size, size);
    // top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x * size, y * size, size, Math.max(2, size * 0.12));
    ctx.fillRect(x * size, y * size, Math.max(2, size * 0.12), size);
    // bottom-right shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x * size, (y + 1) * size - Math.max(2, size * 0.12), size, Math.max(2, size * 0.12));
    ctx.fillRect((x + 1) * size - Math.max(2, size * 0.12), y * size, Math.max(2, size * 0.12), size);
    ctx.globalAlpha = 1;
  }

  function renderBoard() {
    const w = boardCanvas.width, h = boardCanvas.height;
    boardCtx.fillStyle = '#1a1a22';
    boardCtx.fillRect(0, 0, w, h);

    // subtle grid
    boardCtx.strokeStyle = 'rgba(255,255,255,0.04)';
    boardCtx.lineWidth = 1;
    for (let x = 1; x < COLS; x++) {
      boardCtx.beginPath();
      boardCtx.moveTo(x * cellSize + 0.5, 0);
      boardCtx.lineTo(x * cellSize + 0.5, h);
      boardCtx.stroke();
    }
    for (let y = 1; y < ROWS; y++) {
      boardCtx.beginPath();
      boardCtx.moveTo(0, y * cellSize + 0.5);
      boardCtx.lineTo(w, y * cellSize + 0.5);
      boardCtx.stroke();
    }

    // locked cells
    const flashing = state.flashRows && performance.now() < state.flashUntil;
    for (let y = SPAWN_ROWS; y < state.board.length; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = state.board[y][x];
        if (!t) continue;
        if (flashing && state.flashRows.includes(y)) {
          drawCell(boardCtx, x, y - SPAWN_ROWS, '#ffffff', cellSize);
        } else {
          drawCell(boardCtx, x, y - SPAWN_ROWS, PIECES[t].color, cellSize);
        }
      }
    }

    if (state.pieceType && (state.status === 'playing' || state.status === 'paused')) {
      const s = currentShape();
      const gy = ghostY();
      // ghost
      for (let py = 0; py < s.length; py++) {
        for (let px = 0; px < s[py].length; px++) {
          if (!s[py][px]) continue;
          const ry = gy + py - SPAWN_ROWS;
          if (ry >= 0) drawCell(boardCtx, state.pieceX + px, ry, PIECES[state.pieceType].color, cellSize, 0.22);
        }
      }
      // live piece
      for (let py = 0; py < s.length; py++) {
        for (let px = 0; px < s[py].length; px++) {
          if (!s[py][px]) continue;
          const ry = state.pieceY + py - SPAWN_ROWS;
          if (ry >= 0) drawCell(boardCtx, state.pieceX + px, ry, PIECES[state.pieceType].color, cellSize);
        }
      }
    }
  }

  function drawPieceInRect(ctx, type, rx, ry, rw, rh) {
    if (!type) return;
    const piece = PIECES[type];
    const shape = piece.shape;
    const pad = 4;
    const cell = Math.floor(Math.min((rw - pad) / shape[0].length, (rh - pad) / shape.length));
    if (cell < 2) return;
    const w = shape[0].length * cell;
    const h = shape.length * cell;
    const ox = rx + (rw - w) / 2;
    const oy = ry + (rh - h) / 2;
    const edge = Math.max(1, Math.floor(cell * 0.14));
    for (let py = 0; py < shape.length; py++) {
      for (let px = 0; px < shape[py].length; px++) {
        if (!shape[py][px]) continue;
        const cx = ox + px * cell;
        const cy = oy + py * cell;
        ctx.fillStyle = piece.color;
        ctx.fillRect(cx, cy, cell, cell);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(cx, cy, cell, edge);
        ctx.fillRect(cx, cy, edge, cell);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(cx, cy + cell - edge, cell, edge);
        ctx.fillRect(cx + cell - edge, cy, edge, cell);
      }
    }
  }

  function renderSidePanels() {
    holdCtx.fillStyle = '#0a0a0e';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (state.hold) drawPieceInRect(holdCtx, state.hold, 0, 0, holdCanvas.width, holdCanvas.height);

    nextCtx.fillStyle = '#0a0a0e';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    refillQueue();
    const slotW = nextCanvas.width / 3;
    for (let i = 0; i < 3; i++) {
      drawPieceInRect(nextCtx, state.queue[i], i * slotW, 0, slotW, nextCanvas.height);
    }
  }

  function updateStats() {
    document.getElementById('score').textContent = state.score;
    document.getElementById('level').textContent = state.level;
    const goal = linesPerLevel(state.level);
    document.getElementById('goal').textContent = state.linesInLevel + '/' + goal;
    const pct = Math.min(100, (state.linesInLevel / goal) * 100);
    document.getElementById('level-progress-fill').style.width = pct + '%';
  }

  // -------- main loop --------
  let dasDir = 0;       // -1, 0, +1
  let dasTimer = 0;
  let dasRepeating = false;

  function frame(now) {
    const dt = state.lastFrame ? now - state.lastFrame : 0;
    state.lastFrame = now;

    if (state.status === 'playing') {
      // DAS (delayed auto-shift) for held left/right
      if (dasDir !== 0) {
        dasTimer += dt;
        const threshold = dasRepeating ? DAS_REPEAT_MS : DAS_INITIAL_MS;
        while (dasTimer >= threshold) {
          dasTimer -= threshold;
          dasRepeating = true;
          move(dasDir, 0);
        }
      } else {
        dasTimer = 0;
        dasRepeating = false;
      }

      // gravity
      state.gravityTimer += dt;
      const tickMs = state.softDrop ? Math.min(SOFT_DROP_MS, state.gravity) : state.gravity;
      while (state.gravityTimer >= tickMs) {
        state.gravityTimer -= tickMs;
        if (!touchingGround()) {
          move(0, 1);
          if (state.softDrop) state.score += 1;
        }
      }

      // lock delay
      if (touchingGround()) {
        state.lockTimer += dt;
        if (state.lockTimer >= LOCK_DELAY_MS) lock();
      } else {
        state.lockTimer = 0;
      }
    }

    renderBoard();
    renderSidePanels();
    updateStats();
    requestAnimationFrame(frame);
  }

  // -------- input --------
  const heldKeys = new Set();
  const KEY_MAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowUp: 'rotate-cw', x: 'rotate-cw', X: 'rotate-cw',
    z: 'rotate-ccw', Z: 'rotate-ccw',
    ' ': 'hard-drop', Space: 'hard-drop',
    c: 'hold', C: 'hold', Shift: 'hold',
    p: 'pause', P: 'pause', Escape: 'pause',
  };

  function press(action) {
    if (state.status === 'menu' || state.status === 'gameover') {
      // any action button starts the game
      if (action === 'hard-drop' || action === 'rotate-cw' || action === 'rotate-ccw') start();
      return;
    }
    if (state.status === 'paused') {
      if (action === 'pause') resume();
      return;
    }
    if (state.status === 'levelup') {
      // Any action button (or pause) dismisses the transition.
      if (action === 'hard-drop' || action === 'rotate-cw' || action === 'rotate-ccw' || action === 'pause') continueLevel();
      return;
    }
    switch (action) {
      case 'left':       dasDir = -1; dasTimer = 0; dasRepeating = false; move(-1, 0); break;
      case 'right':      dasDir = 1;  dasTimer = 0; dasRepeating = false; move(1, 0); break;
      case 'down':       state.softDrop = true; break;
      case 'rotate-cw':  rotate(1); break;
      case 'rotate-ccw': rotate(-1); break;
      case 'hard-drop':  hardDrop(); break;
      case 'hold':       holdPiece(); break;
      case 'pause':      pause(); break;
    }
  }

  function release(action) {
    switch (action) {
      case 'left':  if (dasDir === -1) dasDir = heldKeys.has('right') ? 1 : 0; break;
      case 'right': if (dasDir === 1)  dasDir = heldKeys.has('left') ? -1 : 0; break;
      case 'down':  state.softDrop = false; break;
    }
  }

  // keyboard
  document.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    if (heldKeys.has(action)) return;
    heldKeys.add(action);
    press(action);
  });
  document.addEventListener('keyup', (e) => {
    const action = KEY_MAP[e.key];
    if (!action) return;
    e.preventDefault();
    heldKeys.delete(action);
    release(action);
  });

  // touch / mouse buttons
  document.querySelectorAll('[data-key]').forEach((el) => {
    const action = el.dataset.k || el.dataset.key;
    const onDown = (e) => {
      e.preventDefault();
      if (heldKeys.has(action)) return;
      heldKeys.add(action);
      el.classList.add('active');
      press(action);
    };
    const onUp = (e) => {
      if (e) e.preventDefault();
      heldKeys.delete(action);
      el.classList.remove('active');
      release(action);
    };
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchend', onUp, { passive: false });
    el.addEventListener('touchcancel', onUp, { passive: false });
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
  });

  // -------- menu / lifecycle --------
  const overlayEl = document.getElementById('overlay');
  const titleEl = document.getElementById('overlay-title');
  const messageEl = document.getElementById('overlay-message');
  const actionEl = document.getElementById('overlay-action');
  const statsEl = document.getElementById('overlay-stats');

  function showOverlay(opts) {
    titleEl.textContent = opts.title;
    messageEl.textContent = opts.message;
    actionEl.textContent = opts.action;
    if (opts.showStats) {
      document.getElementById('final-score').textContent = state.score;
      document.getElementById('final-lines').textContent = state.lines;
      document.getElementById('final-level').textContent = state.level;
      statsEl.classList.remove('hidden');
    } else {
      statsEl.classList.add('hidden');
    }
    const showPickers = opts.showPickers !== false;
    const bestEl = document.getElementById('best-stats');
    const diffEl = document.getElementById('difficulty-picker');
    const stepEl = document.getElementById('start-level').parentElement.parentElement;
    bestEl.style.display = showPickers ? '' : 'none';
    diffEl.style.display = showPickers ? '' : 'none';
    stepEl.style.display = showPickers ? '' : 'none';
    const newBestEl = document.getElementById('new-best');
    if (state.isNewBest && opts.showStats) newBestEl.classList.remove('hidden');
    else newBestEl.classList.add('hidden');
    overlayEl.classList.remove('hidden');
    overlayEl.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    overlayEl.classList.add('hidden');
    overlayEl.setAttribute('aria-hidden', 'true');
  }

  function start() {
    state.board = makeBoard();
    state.score = 0;
    state.level = state.startLevel;
    state.lines = 0;
    state.linesInLevel = 0;
    state.scoreAtLevelStart = 0;
    state.gravity = gravityFor(state.level, state.difficulty);
    state.gravityTimer = 0;
    state.lockTimer = 0;
    state.lockMoves = 0;
    state.hold = null;
    state.canHold = true;
    state.queue = [];
    state.softDrop = false;
    state.status = 'playing';
    state.isNewBest = false;
    dasDir = 0;
    dasTimer = 0;
    dasRepeating = false;
    applyLevelColor();
    hideOverlay();
    nextPiece();
    // Unlock audio context (Safari requires a user gesture)
    const ctx = getAudio();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function pause() {
    if (state.status !== 'playing') return;
    state.status = 'paused';
    showOverlay({ title: 'PAUSED', message: 'Take a breath.', action: 'RESUME', showPickers: false });
  }

  function resume() {
    if (state.status !== 'paused') return;
    state.status = 'playing';
    state.lastFrame = 0;
    hideOverlay();
  }

  function gameOver() {
    state.status = 'gameover';
    playSound('gameover');
    vibrate(50);
    saveProgress();
    renderBestStats();
    showOverlay({
      title: 'GAME OVER',
      message: state.lines >= 40 ? 'Nice run.' : 'Try again.',
      action: 'PLAY AGAIN',
      showStats: true,
    });
  }

  function levelUp() {
    state.status = 'levelup';
    const scoreGain = state.score - state.scoreAtLevelStart;
    state.scoreAtLevelStart = state.score;
    playSound('levelup');
    vibrate(20);
    showOverlay({
      title: 'LEVEL ' + state.level,
      message: '+' + scoreGain + ' · Next ' + linesPerLevel(state.level) + ' lines',
      action: 'CONTINUE',
      showPickers: false,
    });
  }

  function continueLevel() {
    if (state.status !== 'levelup') return;
    state.status = 'playing';
    state.lastFrame = 0;
    hideOverlay();
  }

  function saveProgress() {
    state.isNewBest = state.score > state.best.score;
    if (state.score > state.best.score) {
      state.best.score = state.score;
      localStorage.setItem(LS.bestScore, String(state.best.score));
    }
    if (state.level > state.best.level) {
      state.best.level = state.level;
      localStorage.setItem(LS.bestLevel, String(state.best.level));
    }
    if (state.lines > state.best.lines) {
      state.best.lines = state.lines;
      localStorage.setItem(LS.bestLines, String(state.best.lines));
    }
    state.best.totalLines += state.lines;
    localStorage.setItem(LS.totalLines, String(state.best.totalLines));
    state.best.gamesPlayed += 1;
    localStorage.setItem(LS.gamesPlayed, String(state.best.gamesPlayed));
  }

  function renderBestStats() {
    document.getElementById('best-score').textContent = state.best.score;
    document.getElementById('best-level').textContent = state.best.level;
    document.getElementById('total-lines').textContent = state.best.totalLines;
  }

  function setDifficulty(d) {
    if (!DIFFICULTIES[d]) return;
    state.difficulty = d;
    localStorage.setItem(LS.difficulty, d);
    document.querySelectorAll('#difficulty-picker .seg button').forEach((btn) => {
      const on = btn.dataset.difficulty === d;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function setStartLevel(n) {
    state.startLevel = Math.max(1, Math.min(MAX_START_LEVEL, n));
    localStorage.setItem(LS.startLevel, String(state.startLevel));
    document.getElementById('start-level').textContent = state.startLevel;
    // Preview the level color on the menu so the picker feels alive.
    if (state.status !== 'playing' && state.status !== 'paused') {
      document.documentElement.style.setProperty('--level-color', levelColor(state.startLevel));
    }
  }

  // -------- init --------
  function init() {
    // Restore preferences
    const sound = localStorage.getItem(LS.sound);
    if (sound !== null) state.soundEnabled = sound === '1';
    const vibe = localStorage.getItem(LS.vibrate);
    if (vibe !== null) state.vibrateEnabled = vibe === '1';
    const diff = localStorage.getItem(LS.difficulty);
    if (diff && DIFFICULTIES[diff]) state.difficulty = diff;
    const sLvl = parseInt(localStorage.getItem(LS.startLevel) || '1', 10);
    state.startLevel = Math.max(1, Math.min(MAX_START_LEVEL, isFinite(sLvl) ? sLvl : 1));
    state.level = state.startLevel;
    state.best.score = parseInt(localStorage.getItem(LS.bestScore) || '0', 10) || 0;
    state.best.level = parseInt(localStorage.getItem(LS.bestLevel) || '1', 10) || 1;
    state.best.lines = parseInt(localStorage.getItem(LS.bestLines) || '0', 10) || 0;
    state.best.totalLines = parseInt(localStorage.getItem(LS.totalLines) || '0', 10) || 0;
    state.best.gamesPlayed = parseInt(localStorage.getItem(LS.gamesPlayed) || '0', 10) || 0;

    document.getElementById('sound-toggle').checked = state.soundEnabled;
    document.getElementById('vibrate-toggle').checked = state.vibrateEnabled;
    setDifficulty(state.difficulty);
    setStartLevel(state.startLevel);
    renderBestStats();
    applyLevelColor();

    document.getElementById('sound-toggle').addEventListener('change', (e) => {
      state.soundEnabled = e.target.checked;
      localStorage.setItem(LS.sound, e.target.checked ? '1' : '0');
    });
    document.getElementById('vibrate-toggle').addEventListener('change', (e) => {
      state.vibrateEnabled = e.target.checked;
      localStorage.setItem(LS.vibrate, e.target.checked ? '1' : '0');
    });
    document.querySelectorAll('#difficulty-picker .seg button').forEach((btn) => {
      btn.addEventListener('click', () => setDifficulty(btn.dataset.difficulty));
    });
    document.getElementById('start-level-down').addEventListener('click', () => setStartLevel(state.startLevel - 1));
    document.getElementById('start-level-up').addEventListener('click', () => setStartLevel(state.startLevel + 1));
    actionEl.addEventListener('click', () => {
      if (state.status === 'paused') resume();
      else if (state.status === 'levelup') continueLevel();
      else start();
    });
    document.getElementById('menu-btn').addEventListener('click', () => {
      if (state.status === 'playing') pause();
      else if (state.status === 'paused') resume();
    });

    // page visibility -> auto-pause
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.status === 'playing') pause();
    });

    resizeBoard();
    window.addEventListener('resize', resizeBoard);
    window.addEventListener('orientationchange', () => setTimeout(resizeBoard, 100));

    showOverlay({
      title: 'trisapp',
      message: 'Stack the falling blocks. Clear lines. Survive.',
      action: 'START',
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
