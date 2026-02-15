// Lightweight, deterministic-ish pinball/ladder simulation (no external deps).

export function makeRng(seed) {
  let x = seed >>> 0;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

export function makeBoard({
  worldW = 900,
  worldH = 1350,
  pegR = 10,
  ballR = 18,
  rows = 16,
  cols = 10,
  topPad = 140,
  sidePad = 70,
  slotCount = 8,
  slotH = 130
} = {}) {
  const pegGapX = (worldW - sidePad * 2) / (cols - 1);
  const pegGapY = (worldH - topPad - slotH - 120) / (rows - 1);
  const pegs = [];
  for (let r = 0; r < rows; r++) {
    const y = topPad + r * pegGapY;
    const offset = (r % 2) * (pegGapX / 2);
    const count = r % 2 ? cols - 1 : cols;
    for (let c = 0; c < count; c++) {
      const x = sidePad + c * pegGapX + offset;
      pegs.push({ x, y, r: pegR });
    }
  }

  const slots = [];
  const slotW = worldW / slotCount;
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      idx: i,
      x0: i * slotW,
      x1: (i + 1) * slotW,
      label: `S${i + 1}`
    });
  }

  return {
    worldW,
    worldH,
    pegR,
    ballR,
    rows,
    cols,
    topPad,
    sidePad,
    slotCount,
    slotH,
    slotW,
    pegs,
    slots
  };
}

export function makeGameState({ seed = 1234, board = makeBoard(), ballsCatalog = [] } = {}) {
  const counts = {};
  for (const b of ballsCatalog) counts[b.id] = 1;
  return {
    mode: "menu", // menu | playing
    t: 0,
    seed,
    rng: makeRng(seed),
    board,
    ballsCatalog,
    counts,
    pending: [],
    released: false,
    totalToDrop: 0,
    finished: [],
    winner: null,
    dropX: board.worldW / 2,
    marbles: [],
    lastResult: null
  };
}

export function setBallCount(state, id, count) {
  if (!state.ballsCatalog.some((b) => b.id === id)) return;
  const safe = clampInt(Number(count) || 0, 0, 99);
  state.counts[id] = safe;
}

export function getBallCount(state, id) {
  return clampInt(state.counts?.[id] ?? 0, 0, 99);
}

export function getTotalSelectedCount(state) {
  let total = 0;
  for (const b of state.ballsCatalog) total += getBallCount(state, b.id);
  return total;
}

export function prepareDropQueue(state, { shuffle = true } = {}) {
  const queue = [];
  for (const b of state.ballsCatalog) {
    const n = getBallCount(state, b.id);
    for (let i = 0; i < n; i++) queue.push(b.id);
  }
  if (shuffle && queue.length > 1) {
    // Do not consume state.rng: keep simulation jitter stable across runs.
    const rnd = makeRng((state.seed ^ 0x9e3779b9) >>> 0);
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
  return queue;
}

export function setDropX(state, x) {
  const pad = state.board.ballR + 2;
  state.dropX = clamp(x, pad, state.board.worldW - pad);
  if (state.mode === "playing" && !state.released) layoutPending(state);
}

export function startGame(state) {
  state.mode = "playing";
  state.t = 0;
  state.marbles = [];
  state.lastResult = null;
  state.finished = [];
  state.winner = null;
  state.released = false;

  const queue = prepareDropQueue(state, { shuffle: true });
  state.totalToDrop = queue.length;
  state.pending = queue.map((ballId, i) => makePendingMarble(state, ballId, i));
  layoutPending(state);
}

export function resetGame(state) {
  state.mode = "menu";
  state.t = 0;
  state.marbles = [];
  state.lastResult = null;
  state.pending = [];
  state.released = false;
  state.totalToDrop = 0;
  state.finished = [];
  state.winner = null;
}

export function dropAll(state) {
  if (state.mode !== "playing") return null;
  if (state.released) return 0;
  if (!state.pending.length) return 0;
  state.released = true;
  state.marbles.push(...state.pending);
  const n = state.pending.length;
  state.pending = [];
  return n;
}

export function step(state, dt) {
  if (state.mode !== "playing") return;
  state.t += dt;

  const g = 1400; // px/s^2 in world units
  const restitution = 0.55;
  const air = 0.995;

  const { worldW, worldH, slotH, pegs, slots, slotW } = state.board;
  const finishY = worldH - slotH;

  for (const m of state.marbles) {
    if (m.done) continue;

    m.vy += g * dt;
    m.vx *= air;
    m.vy *= air;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    // Walls.
    if (m.x - m.r < 0) {
      m.x = m.r;
      m.vx = Math.abs(m.vx) * restitution;
    } else if (m.x + m.r > worldW) {
      m.x = worldW - m.r;
      m.vx = -Math.abs(m.vx) * restitution;
    }

    // Peg collisions (fixed pegs).
    for (const p of pegs) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const rr = m.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.max(0.0001, Math.sqrt(d2));
      const nx = dx / d;
      const ny = dy / d;

      // Push out.
      const push = rr - d;
      m.x += nx * push;
      m.y += ny * push;

      // Reflect along normal if moving into peg.
      const vn = m.vx * nx + m.vy * ny;
      if (vn < 0) {
        m.vx -= (1 + restitution) * vn * nx;
        m.vy -= (1 + restitution) * vn * ny;

        // Mild tangential damping to avoid endless jitter.
        const vtX = m.vx - (m.vx * nx + m.vy * ny) * nx;
        const vtY = m.vy - (m.vx * nx + m.vy * ny) * ny;
        m.vx -= vtX * 0.04;
        m.vy -= vtY * 0.04;
      }
    }

    // Marble-marble collisions (simple impulse).
    // This keeps the "all drop together" case from looking like ghosts.
    for (const o of state.marbles) {
      if (o === m || o.done) continue;
      const dx = m.x - o.x;
      const dy = m.y - o.y;
      const rr = m.r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const push = (rr - d) * 0.5;
      m.x += nx * push;
      m.y += ny * push;
      o.x -= nx * push;
      o.y -= ny * push;

      const rvx = m.vx - o.vx;
      const rvy = m.vy - o.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const j = -(1 + restitution) * vn * 0.5; // equal mass
        m.vx += j * nx;
        m.vy += j * ny;
        o.vx -= j * nx;
        o.vy -= j * ny;
      }
    }

    // Finish line -> slot result.
    if (m.y + m.r >= finishY) {
      const idx = clampInt(Math.floor(m.x / slotW), 0, slots.length - 1);
      m.done = true;
      m.result = { slot: idx, label: slots[idx].label };
      state.lastResult = { marbleId: m.id, ballId: m.ballId, ...m.result };
      state.finished.push({ marbleId: m.id, ballId: m.ballId, t: state.t, ...m.result });
      if (state.released && state.totalToDrop > 0 && state.finished.length === state.totalToDrop) {
        // Winner: the one who arrives last (max finish time). With simultaneous drop, this is also the last finish event.
        const last = state.finished.reduce((a, b) => (a.t >= b.t ? a : b));
        state.winner = last;
      }
      m.y = finishY - m.r;
      m.vx = 0;
      m.vy = 0;
    }
  }
}

export function snapshotForText(state) {
  const b = state.board;
  return {
    note: "coords: origin at top-left. x -> right, y -> down. units are canvas/world pixels.",
    mode: state.mode,
    t: Number(state.t.toFixed(3)),
    counts: state.counts,
    pendingCount: state.pending.length,
    released: state.released,
    totalToDrop: state.totalToDrop,
    finishedCount: state.finished.length,
    winner: state.winner,
    dropX: Number(state.dropX.toFixed(1)),
    board: {
      worldW: b.worldW,
      worldH: b.worldH,
      pegCount: b.pegs.length,
      slotCount: b.slotCount
    },
    marbles: state.marbles.map((m) => ({
      id: m.id,
      ballId: m.ballId,
      x: Number(m.x.toFixed(1)),
      y: Number(m.y.toFixed(1)),
      vx: Number(m.vx.toFixed(1)),
      vy: Number(m.vy.toFixed(1)),
      done: m.done,
      result: m.result
    })),
    lastResult: state.lastResult
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function clampInt(v, a, b) {
  return Math.max(a, Math.min(b, v | 0));
}

function makePendingMarble(state, ballId, idx) {
  const ball = state.ballsCatalog.find((b) => b.id === ballId);
  if (!ball) throw new Error(`unknown ballId: ${ballId}`);
  // Seeded jitter so marbles start slightly different even when dropped together.
  const jx = (state.rng() - 0.5) * 10;
  const id = `m_${idx}_${Math.floor(state.rng() * 1e9)}`;
  return {
    id,
    ballId: ball.id,
    name: ball.name,
    x: state.dropX + jx,
    y: 70,
    vx: (state.rng() - 0.5) * 10,
    vy: 0,
    r: state.board.ballR,
    done: false,
    result: null
  };
}

function layoutPending(state) {
  const { worldW, ballR } = state.board;
  const n = state.pending.length;
  if (!n) return;
  const gap = ballR * 2.2;
  const perRow = Math.max(1, Math.floor((worldW - ballR * 2) / gap));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const colsInThisRow = Math.min(perRow, n - row * perRow);
    const x0 = state.dropX - ((colsInThisRow - 1) * gap) / 2;
    state.pending[i].x = clamp(x0 + col * gap, ballR + 2, worldW - ballR - 2);
    state.pending[i].y = 70 - row * (ballR * 1.9);
  }
}
