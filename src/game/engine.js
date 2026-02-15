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
  slotH = 130,
  heightMultiplier = 1,
  elementScale = 1,
  corridorEnabled = true,
  layout = "classic" // classic | roulette
} = {}) {
  const baseH = worldH;
  const baseRows = rows;
  const mul = Math.max(1, Math.floor(heightMultiplier));
  const es = Math.max(0.5, Math.min(1.2, Number(elementScale) || 1));

  worldH = baseH * mul;
  rows = Math.max(6, baseRows * mul);
  pegR = pegR * es;
  ballR = ballR * es;

  const corridor = layout === "classic" && corridorEnabled ? makeCorridor({ worldW, worldH, ballR }) : null;

  const pegGapX = (worldW - sidePad * 2) / (cols - 1);
  const pegGapY = (worldH - topPad - slotH - 120) / (rows - 1);
  let pegs = [];
  let pegRows = [];

  // Roulette-style map: fixed polylines + boxes (no procedural pegs).
  const roulette = layout === "roulette" ? makeRouletteLayout({ worldW, worldH, slotH }) : null;
  const wallSegments = roulette ? buildWallSegments(roulette.entities) : [];
  const wallBins = wallSegments.length ? buildSegmentBins(wallSegments, 260) : null;

  if (layout === "classic") {
    pegs = [];
    pegRows = [];
    for (let r = 0; r < rows; r++) {
      const y = topPad + r * pegGapY;
      const offset = (r % 2) * (pegGapX / 2);
      const count = r % 2 ? cols - 1 : cols;
      const rowPegs = [];
      for (let c = 0; c < count; c++) {
        const x = sidePad + c * pegGapX + offset;
        if (corridor) {
          if (isClearZone(corridor, y)) continue;
          const { left, right } = corridorAt(corridor, y);
          if (x - pegR < left + 6 || x + pegR > right - 6) continue;
        }
        const peg = { x, y, r: pegR };
        pegs.push(peg);
        rowPegs.push(peg);
      }
      pegRows.push(rowPegs);
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
    layout,
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
    pegRows,
    pegGapX,
    pegGapY,
    corridor,
    roulette,
    wallSegments,
    wallBins,
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
    chaos: {
      enabled: board.layout !== "roulette",
      rng: makeRng((seed ^ 0xa8f1d2c3) >>> 0),
      bumpers: [],
      spinners: [],
      portals: [],
      windZones: []
    },
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
  if (state.board.layout === "roulette" && state.board.roulette?.spawnBoundsAtY) {
    const { left, right } = state.board.roulette.spawnBoundsAtY(80);
    state.dropX = clamp(x, left + pad, right - pad);
  } else if (state.board.corridor) {
    const { left, right } = corridorAt(state.board.corridor, 80);
    state.dropX = clamp(x, left + pad, right - pad);
  } else {
    state.dropX = clamp(x, pad, state.board.worldW - pad);
  }
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
  state.chaos.rng = makeRng((state.seed ^ 0xa8f1d2c3) >>> 0);
  if (state.chaos.enabled) generateChaosObjects(state);

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
  state.chaos.bumpers = [];
  state.chaos.spinners = [];
  state.chaos.portals = [];
  state.chaos.windZones = [];
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

  // Heavier feel: lower gravity, lower bounciness, and more damping.
  const g = 1050; // px/s^2 in world units
  const restitution = 0.38;
  const air = 0.988;
  const maxV = 1700;

  const { worldW, worldH, slotH, pegRows, slots, slotW, topPad, pegGapY, corridor, wallSegments, wallBins } = state.board;
  const finishY = worldH - slotH;

  for (const m of state.marbles) {
    if (m.done) continue;

    // Chaos: wind zones (adds horizontal acceleration).
    if (state.chaos.enabled && state.chaos.windZones.length) {
      for (const z of state.chaos.windZones) {
        if (m.x < z.x0 || m.x > z.x1 || m.y < z.y0 || m.y > z.y1) continue;
        const phase = z.phase + state.t * z.freq;
        m.vx += Math.sin(phase) * z.ax * dt;
      }
    }

    m.vy += g * dt;
    m.vx *= air;
    m.vy *= air;
    // Cap speed so chaos objects can't make marbles look weightless.
    const sp2 = m.vx * m.vx + m.vy * m.vy;
    if (sp2 > maxV * maxV) {
      const s = maxV / Math.sqrt(sp2);
      m.vx *= s;
      m.vy *= s;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    // Walls (roulette map segments OR variable-width corridor OR plain bounds).
    if (wallSegments && wallSegments.length) {
      resolveWallSegments(state.board, m, restitution, wallSegments, wallBins);
    } else if (corridor) {
      const { left, right } = corridorAt(corridor, m.y);
      if (m.x - m.r < left) {
        m.x = left + m.r;
        m.vx = Math.abs(m.vx) * restitution;
      } else if (m.x + m.r > right) {
        m.x = right - m.r;
        m.vx = -Math.abs(m.vx) * restitution;
      }
    } else {
      if (m.x - m.r < 0) {
        m.x = m.r;
        m.vx = Math.abs(m.vx) * restitution;
      } else if (m.x + m.r > worldW) {
        m.x = worldW - m.r;
        m.vx = -Math.abs(m.vx) * restitution;
      }
    }

    // Peg collisions (fixed pegs). Only check nearby rows for perf on tall boards.
    if (pegRows && pegRows.length) {
      const rCenter = clampInt(Math.round((m.y - topPad) / pegGapY), 0, pegRows.length - 1);
      for (let rr = Math.max(0, rCenter - 2); rr <= Math.min(pegRows.length - 1, rCenter + 2); rr++) {
        const row = pegRows[rr];
        for (const p of row) {
          const dx = m.x - p.x;
          const dy = m.y - p.y;
          const sumR = m.r + p.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= sumR * sumR) continue;
          const d = Math.max(0.0001, Math.sqrt(d2));
          const nx = dx / d;
          const ny = dy / d;

          // Push out.
          const push = sumR - d;
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
      }
    }

    // Chaos: bumpers/spinners/portals (check near Y only).
    if (state.chaos.enabled) {
      applyChaosCollisions(state, m, restitution);
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
    chaos: {
      enabled: state.chaos.enabled,
      bumpers: state.chaos.bumpers.length,
      spinners: state.chaos.spinners.length,
      portals: state.chaos.portals.length,
      windZones: state.chaos.windZones.length
    },
    board: {
      worldW: b.worldW,
      worldH: b.worldH,
      pegCount: b.pegs.length,
      slotCount: b.slotCount,
      hasCorridor: !!b.corridor
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
    state.pending[i].y = 70 - row * (ballR * 1.9);
    const desiredX = x0 + col * gap;
    if (state.board.layout === "roulette" && state.board.roulette?.spawnBoundsAtY) {
      const { left, right } = state.board.roulette.spawnBoundsAtY(state.pending[i].y);
      state.pending[i].x = clamp(desiredX, left + ballR + 2, right - ballR - 2);
    } else if (state.board.corridor) {
      const { left, right } = corridorAt(state.board.corridor, state.pending[i].y);
      state.pending[i].x = clamp(desiredX, left + ballR + 2, right - ballR - 2);
    } else {
      state.pending[i].x = clamp(desiredX, ballR + 2, worldW - ballR - 2);
    }
  }
}

function generateChaosObjects(state) {
  const rnd = state.chaos.rng;
  const b = state.board;
  const corridor = b.corridor;

  const bumpers = [];
  const spinners = [];
  const portals = [];
  const windZones = [];

  // Keep the spawn/top area cleaner.
  const yStart = b.topPad + b.pegGapY * 4;
  const yEnd = b.worldH - b.slotH - 220;

  const bumperCount = Math.max(8, Math.round((b.rows / 16) * 12));
  for (let i = 0; i < bumperCount; i++) {
    const y = lerp(yStart, yEnd, (i + 1) / (bumperCount + 1)) + (rnd() - 0.5) * b.pegGapY * 2.5;
    if (corridor && isClearZone(corridor, y)) continue;
    const { left, right } = corridor ? corridorAt(corridor, y) : { left: 0, right: b.worldW };
    const x = lerp(left + b.sidePad * 0.2, right - b.sidePad * 0.2, rnd());
    bumpers.push({
      kind: "bumper",
      x,
      y,
      r: b.ballR * 1.35,
      strength: 420 + rnd() * 520
    });
  }

  const spinnerCount = Math.max(6, Math.round((b.rows / 16) * 10));
  for (let i = 0; i < spinnerCount; i++) {
    const y = lerp(yStart, yEnd, (i + 0.5) / spinnerCount) + (rnd() - 0.5) * b.pegGapY * 2.0;
    if (corridor && isClearZone(corridor, y)) continue;
    const { left, right } = corridor ? corridorAt(corridor, y) : { left: 0, right: b.worldW };
    const x = lerp(left + b.sidePad * 0.2, right - b.sidePad * 0.2, rnd());
    spinners.push({
      kind: "spinner",
      x,
      y,
      r: b.ballR * 1.55,
      tangential: 320 + rnd() * 380,
      dir: rnd() < 0.5 ? -1 : 1
    });
  }

  // One portal pair, mid-ish and low-ish.
  const pyA = lerp(yStart, yEnd, 0.35);
  const pyB = lerp(yStart, yEnd, 0.72);
  const yA = corridor && isClearZone(corridor, pyA) ? pyA - b.pegGapY * 4 : pyA;
  const yB = corridor && isClearZone(corridor, pyB) ? pyB + b.pegGapY * 4 : pyB;
  const ca = corridor ? corridorAt(corridor, yA) : { left: 0, right: b.worldW };
  const cb = corridor ? corridorAt(corridor, yB) : { left: 0, right: b.worldW };
  const pxA = lerp(ca.left + b.sidePad * 0.2, ca.right - b.sidePad * 0.2, 0.22 + rnd() * 0.25);
  const pxB = lerp(cb.left + b.sidePad * 0.2, cb.right - b.sidePad * 0.2, 0.55 + rnd() * 0.25);
  portals.push({
    kind: "portal",
    a: { x: pxA, y: yA, r: b.ballR * 1.6 },
    b: { x: pxB, y: yB, r: b.ballR * 1.6 }
  });

  // Wind bands.
  const windCount = 4;
  for (let i = 0; i < windCount; i++) {
    const y0 = lerp(yStart, yEnd, (i + 0.2) / windCount);
    const y1 = y0 + b.pegGapY * (3.5 + rnd() * 3.5);
    // Avoid clear zones; user wants to add their own objects there.
    if (corridor && (isClearZone(corridor, y0) || isClearZone(corridor, y1))) continue;
    const c0 = corridor ? corridorAt(corridor, (y0 + y1) / 2) : { left: 0, right: b.worldW };
    windZones.push({
      kind: "wind",
      x0: c0.left,
      x1: c0.right,
      y0,
      y1,
      ax: 220 + rnd() * 420,
      freq: 0.8 + rnd() * 0.9,
      phase: rnd() * Math.PI * 2
    });
  }

  state.chaos.bumpers = bumpers;
  state.chaos.spinners = spinners;
  state.chaos.portals = portals;
  state.chaos.windZones = windZones;
}

function applyChaosCollisions(state, m, restitution) {
  const b = state.board;
  const rnd = state.chaos.rng;
  const yMin = m.y - m.r - 160;
  const yMax = m.y + m.r + 160;

  // Bumpers: radial boost.
  for (const o of state.chaos.bumpers) {
    if (o.y < yMin || o.y > yMax) continue;
    const dx = m.x - o.x;
    const dy = m.y - o.y;
    const sumR = m.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= sumR * sumR || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const push = sumR - d;
    m.x += nx * push;
    m.y += ny * push;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= (1 + restitution) * vn * nx;
      m.vy -= (1 + restitution) * vn * ny;
    }
    const jitter = 0.8 + rnd() * 0.6;
    m.vx += nx * o.strength * jitter;
    m.vy += ny * o.strength * jitter;
  }

  // Spinners: tangential impulse.
  for (const o of state.chaos.spinners) {
    if (o.y < yMin || o.y > yMax) continue;
    const dx = m.x - o.x;
    const dy = m.y - o.y;
    const sumR = m.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= sumR * sumR || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const push = sumR - d;
    m.x += nx * push;
    m.y += ny * push;
    // Tangential direction (-ny, nx)
    const tx = -ny * o.dir;
    const ty = nx * o.dir;
    const kick = o.tangential * (0.7 + rnd() * 0.6);
    m.vx += tx * kick;
    m.vy += ty * kick;
  }

  // Portals: teleport with cooldown.
  const cd = 0.45;
  if (typeof m._portalCdT !== "number") m._portalCdT = -999;
  if (state.t - m._portalCdT < cd) return;
  for (const p of state.chaos.portals) {
    const hitA = circleHit(m, p.a);
    const hitB = circleHit(m, p.b);
    if (!hitA && !hitB) continue;
    const to = hitA ? p.b : p.a;
    // Place at destination with small offset.
    const ang = rnd() * Math.PI * 2;
    const desiredX = to.x + Math.cos(ang) * (m.r + 4);
    m.y = clamp(to.y + Math.sin(ang) * (m.r + 4), m.r + 2, b.worldH - b.slotH - m.r - 2);
    if (b.corridor) {
      const { left, right } = corridorAt(b.corridor, m.y);
      m.x = clamp(desiredX, left + m.r + 2, right - m.r - 2);
    } else {
      m.x = clamp(desiredX, m.r + 2, b.worldW - m.r - 2);
    }
    // Add velocity jitter so it doesn't feel scripted.
    m.vx = (m.vx * 0.55) + (rnd() - 0.5) * 520;
    m.vy = Math.max(0, m.vy * 0.35) + rnd() * 160;
    m._portalCdT = state.t;
    break;
  }
}

function circleHit(m, c) {
  const dx = m.x - c.x;
  const dy = m.y - c.y;
  const sumR = m.r + c.r;
  return dx * dx + dy * dy < sumR * sumR;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeCorridor({ worldW, worldH, ballR }) {
  const wideHalf = worldW / 2;
  const narrowW = ballR * 7.2; // ~2-3 balls through, depending on scale.
  const narrowHalf = Math.min(wideHalf, Math.max(narrowW / 2, ballR * 2.8));

  // Funnel profile: monotonically narrows from top -> bottom.
  const startY = 120;
  const endY = worldH - 220;

  // Fixed "clear" bands where we remove objects for custom designs later.
  const bandH = Math.max(220, ballR * 18);
  const bands = [];
  for (const t of [0.28, 0.58, 0.86]) {
    const cy = lerp(startY, endY, t);
    bands.push({ y0: cy - bandH / 2, y1: cy + bandH / 2 });
  }

  return { worldW, startY, endY, wideHalf, narrowHalf, clearBands: bands };
}

function isClearZone(corridor, y) {
  for (const b of corridor.clearBands || []) {
    if (y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

function corridorAt(corridor, y) {
  const cx = corridor.worldW / 2;
  const t = clamp((y - corridor.startY) / (corridor.endY - corridor.startY), 0, 1);
  // Smooth but steady narrowing.
  const u = smoothstep(t);
  const hw = lerp(corridor.wideHalf, corridor.narrowHalf, u);
  const left = clamp(cx - hw, 0, corridor.worldW);
  const right = clamp(cx + hw, 0, corridor.worldW);
  return { left, right };
}

function smoothstep(x) {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function makeRouletteLayout({ worldW, worldH, slotH }) {
  // Adapted from lazygyu/roulette "Wheel of fortune" stage polylines.
  // Coordinate system there is ~x:[1..24], y:[-300..111]. We shift y by +300 and scale to our world.
  const stagePolylines = [
    {
      id: "outer-left",
      points: [
        [16.5, -300],
        [9.25, -300],
        [9.25, 8.5],
        [2, 19.25],
        [2, 26],
        [9.75, 30],
        [9.75, 33.5],
        [1.25, 41],
        [1.25, 53.75],
        [8.25, 58.75],
        [8.25, 63],
        [9.25, 64],
        [8.25, 65],
        [8.25, 99.25],
        [15.1, 106.75],
        [15.1, 111.75]
      ]
    },
    {
      id: "outer-right",
      points: [
        [16.5, -300],
        [16.5, 9.25],
        [9.5, 20],
        [9.5, 22.5],
        [17.5, 26],
        [17.5, 33.5],
        [24, 38.5],
        [19, 45.5],
        [19, 55.5],
        [24, 59.25],
        [24, 63],
        [23, 64],
        [24, 65],
        [24, 100.5],
        [16, 106.75],
        [16, 111.75]
      ]
    },
    {
      id: "inner-poly",
      points: [
        [12.75, 37.5],
        [7, 43.5],
        [7, 49.75],
        [12.75, 53.75],
        [12.75, 37.5]
      ]
    },
    {
      id: "inner-tri",
      points: [
        [14.75, 37.5],
        [14.75, 43],
        [17.5, 40.25],
        [14.75, 37.5]
      ]
    }
  ];

  // A subset of static boxes from the reference stage.
  const stageBoxes = [
    // Small rotated "pins" near the top.
    { x: 15.5, y: 30.0, w: 0.2, h: 0.2, rot: -45 },
    { x: 15.5, y: 32.0, w: 0.2, h: 0.2, rot: -45 },
    { x: 15.5, y: 28.0, w: 0.2, h: 0.2, rot: -45 },
    { x: 12.5, y: 30.0, w: 0.2, h: 0.2, rot: -45 },
    { x: 12.5, y: 32.0, w: 0.2, h: 0.2, rot: -45 },
    { x: 12.5, y: 28.0, w: 0.2, h: 0.2, rot: -45 },

    // Slash bands.
    { x: 9.4, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 11.3, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 13.2, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 15.1, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 17.0, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 18.9, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 20.7, y: 66.6, w: 0.6, h: 0.1, rot: 45 },
    { x: 22.7, y: 66.6, w: 0.6, h: 0.1, rot: 45 },

    { x: 9.4, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 11.3, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 13.2, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 15.1, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 17.0, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 18.9, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 20.7, y: 69.1, w: 0.6, h: 0.1, rot: -45 },
    { x: 22.7, y: 69.1, w: 0.6, h: 0.1, rot: -45 }
  ];

  const yOff = 300;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const pl of stagePolylines) {
    for (const [x, y] of pl.points) {
      xMin = Math.min(xMin, x);
      xMax = Math.max(xMax, x);
      const yy = y + yOff;
      yMin = Math.min(yMin, yy);
      yMax = Math.max(yMax, yy);
    }
  }

  const padX = 32;
  const padY = 18;
  const usableW = Math.max(200, worldW - padX * 2);
  const usableH = Math.max(400, worldH - slotH - padY * 2);
  const sx = usableW / Math.max(1e-6, xMax - xMin);
  const sy = usableH / Math.max(1e-6, yMax - yMin);
  const s = Math.min(sx, sy);

  const polylines = stagePolylines.map((pl) => ({
    id: pl.id,
    type: "polyline",
    points: pl.points.map(([x, y]) => [padX + (x - xMin) * sx, padY + (y + yOff - yMin) * sy])
  }));

  const outerLeft = polylines.find((p) => p.id === "outer-left")?.points || [];
  const outerRight = polylines.find((p) => p.id === "outer-right")?.points || [];

  const boxes = stageBoxes.map((b) => ({
    id: `box_${b.x}_${b.y}_${b.rot}`,
    type: "box",
    x: padX + (b.x - xMin) * sx,
    y: padY + (b.y + yOff - yMin) * sy,
    w: b.w * s,
    h: b.h * s,
    rot: normalizeRotation(b.rot)
  }));

  return {
    entities: [...polylines, ...boxes],
    spawnBoundsAtY: (y) => {
      // Clamp to the outer boundaries near the top. Both outer polylines are monotonic in y.
      const left = interpolateXAtY(outerLeft, y);
      const right = interpolateXAtY(outerRight, y);
      return { left: Math.min(left, right), right: Math.max(left, right) };
    }
  };
}

function normalizeRotation(rot) {
  const r = Number(rot) || 0;
  // Heuristic: values with magnitude > 2*pi are degrees.
  if (Math.abs(r) > Math.PI * 2) return (r * Math.PI) / 180;
  return r;
}

function interpolateXAtY(points, y) {
  if (!points.length) return 0;
  if (y <= points[0][1]) return points[0][0];
  if (y >= points[points.length - 1][1]) return points[points.length - 1][0];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if ((y >= y0 && y <= y1) || (y >= y1 && y <= y0)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return x0 + (x1 - x0) * t;
    }
  }
  return points[points.length - 1][0];
}

function buildWallSegments(entities) {
  const segs = [];
  for (const ent of entities || []) {
    if (!ent) continue;
    if (ent.type === "polyline" && Array.isArray(ent.points)) {
      const pts = ent.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        segs.push(makeSeg(x0, y0, x1, y1));
      }
    } else if (ent.type === "box") {
      const edges = boxToSegments(ent);
      for (const e of edges) segs.push(e);
    }
  }
  return segs;
}

function boxToSegments(b) {
  const cx = b.x;
  const cy = b.y;
  const hw = b.w / 2;
  const hh = b.h / 2;
  const c = Math.cos(b.rot || 0);
  const s = Math.sin(b.rot || 0);
  const pts = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh]
  ].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  const segs = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const d = pts[(i + 1) % 4];
    segs.push(makeSeg(a[0], a[1], d[0], d[1]));
  }
  return segs;
}

function makeSeg(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  return {
    x0,
    y0,
    x1,
    y1,
    dx,
    dy,
    len2: Math.max(1e-9, len2),
    yMin: Math.min(y0, y1),
    yMax: Math.max(y0, y1)
  };
}

function buildSegmentBins(segments, binH) {
  let yMax = 0;
  for (const s of segments) yMax = Math.max(yMax, s.yMax);
  const n = Math.max(1, Math.ceil(yMax / binH) + 1);
  const bins = Array.from({ length: n }, () => []);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const a = clampInt(Math.floor(s.yMin / binH), 0, n - 1);
    const b = clampInt(Math.floor(s.yMax / binH), 0, n - 1);
    for (let k = a; k <= b; k++) bins[k].push(i);
  }
  return { binH, bins };
}

function resolveWallSegments(board, m, restitution, segments, bins) {
  const candidates = [];
  if (bins && bins.bins?.length) {
    const h = bins.binH;
    const i0 = clampInt(Math.floor((m.y - m.r - 60) / h), 0, bins.bins.length - 1);
    const i1 = clampInt(Math.floor((m.y + m.r + 60) / h), 0, bins.bins.length - 1);
    for (let i = i0; i <= i1; i++) {
      for (const idx of bins.bins[i]) candidates.push(idx);
    }
  } else {
    for (let i = 0; i < segments.length; i++) candidates.push(i);
  }

  for (const idx of candidates) {
    const s = segments[idx];
    if (m.y + m.r < s.yMin - 2 || m.y - m.r > s.yMax + 2) continue;
    resolveCircleSegment(m, s, restitution);
  }

  // As a safety net, keep within world bounds.
  m.x = clamp(m.x, m.r, board.worldW - m.r);
}

function resolveCircleSegment(m, s, restitution) {
  const px = m.x;
  const py = m.y;
  const t = clamp(((px - s.x0) * s.dx + (py - s.y0) * s.dy) / s.len2, 0, 1);
  const cx = s.x0 + s.dx * t;
  const cy = s.y0 + s.dy * t;
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  const r2 = m.r * m.r;
  if (d2 >= r2 || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;

  const push = (m.r - d) + 0.02;
  m.x += nx * push;
  m.y += ny * push;

  const vn = m.vx * nx + m.vy * ny;
  if (vn < 0) {
    m.vx -= (1 + restitution) * vn * nx;
    m.vy -= (1 + restitution) * vn * ny;
    // Tangential damping for less "ice-skating" along walls.
    const tx = -ny;
    const ty = nx;
    const vt = m.vx * tx + m.vy * ty;
    m.vx -= vt * tx * 0.08;
    m.vy -= vt * ty * 0.08;
  }
}
