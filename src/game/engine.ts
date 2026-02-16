// Lightweight, deterministic-ish pinball/ladder simulation (no external deps).
import type {
  BallCatalogEntry,
  Board,
  Corridor,
  FinishRecord,
  FixedEntity,
  GameState,
  MakeBoardOptions,
  Marble,
  MarbleResult,
  Peg,
  Slot,
  SegmentBins,
  WallSegment,
  ZigzagLayout,
  RouletteLayout,
  Rng,
  Propeller,
  Rotor,
} from "./types";

/**
 * Create a deterministic RNG from a numeric seed.
 *
 * Note: this is not cryptographically secure; it is meant for gameplay and tests.
 */
/** makeRng helper. */
export function makeRng(seed: number): Rng {
  let x = seed >>> 0;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * Build a board (layout + entities) based on options.
 * Pure construction: does not mutate or depend on existing game state.
 */
/** makeBoard helper. */
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
  customRotors = null, // zigzag: user-provided extra circular rotors
  layout = "classic" // classic | roulette | zigzag
}: MakeBoardOptions = {}): Board {
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
  let pegs: Peg[] = [];
  let pegRows: Peg[][] = [];

  // Fixed map layouts: polylines + boxes + optional propellers (no procedural pegs).
  const roulette: RouletteLayout | null = layout === "roulette" ? makeRouletteLayout({ worldW, worldH, slotH }) : null;
  const zigzag: ZigzagLayout | null =
    layout === "zigzag" ? makeZigzagLayout({ worldW, worldH, slotH, ballR, customRotors }) : null;
  const fixed = roulette || zigzag;
  const wallSegments: WallSegment[] = fixed ? buildWallSegments(fixed.entities) : [];
  const wallBins = wallSegments.length ? buildSegmentBins(wallSegments, 260) : null;

  if (layout === "classic") {
    pegs = [];
    pegRows = [];
    for (let r = 0; r < rows; r++) {
      const y = topPad + r * pegGapY;
      const offset = (r % 2) * (pegGapX / 2);
      const count = r % 2 ? cols - 1 : cols;
      const rowPegs: Peg[] = [];
      for (let c = 0; c < count; c++) {
        const x = sidePad + c * pegGapX + offset;
        if (corridor) {
          if (isClearZone(corridor, y)) continue;
          const { left, right } = corridorAt(corridor, y);
          if (x - pegR < left + 6 || x + pegR > right - 6) continue;
        }
        const peg: Peg = { x, y, r: pegR };
        pegs.push(peg);
        rowPegs.push(peg);
      }
      pegRows.push(rowPegs);
    }
  }

  const slots: Slot[] = [];
  const slotW = worldW / slotCount;
  for (let i = 0; i < slotCount; i++) {
    slots.push({
      idx: i,
      x0: i * slotW,
      x1: (i + 1) * slotW,
      label: slotCount === 1 ? "" : `S${i + 1}`
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
    zigzag,
    wallSegments,
    wallBins,
    slots
  };
}

/**
 * Create a new game state for a given board + ball catalog.
 *
 * The returned object is mutated in-place by the engine functions.
 */
/** makeGameState helper. */
export function makeGameState({
  seed = 1234,
  board = makeBoard(),
  ballsCatalog = []
}: {
  seed?: number;
  board?: Board;
  ballsCatalog?: BallCatalogEntry[];
} = {}): GameState {
  const counts: Record<string, number> = {};
  for (const b of ballsCatalog) counts[b.id] = 1;
  return {
    mode: "menu", // menu | playing
    t: 0,
    seed,
    rng: makeRng(seed),
    board,
    ballsCatalog,
    counts,
    stats: {
      propellerContacts: 0
    },
    pending: [],
    released: false,
    totalToDrop: 0,
    finished: [],
    winner: null,
    _binCounts: Array.from({ length: board.slotCount }, () => 0),
    dropX: board.worldW / 2,
    marbles: [],
    lastResult: null
  };
}

/** Set the selected count for a ball ID (clamped to [0..99]). */
export function setBallCount(state: GameState, id: string, count: number): void {
  if (!state.ballsCatalog.some((b) => b.id === id)) return;
  const safe = clampInt(Number(count) || 0, 0, 99);
  state.counts[id] = safe;
}

/** Get the selected count for a ball ID (defaults to 0). */
export function getBallCount(state: GameState, id: string): number {
  return clampInt(state.counts?.[id] ?? 0, 0, 99);
}

/** Sum of all selected ball counts. */
export function getTotalSelectedCount(state: GameState): number {
  let total = 0;
  for (const b of state.ballsCatalog) total += getBallCount(state, b.id);
  return total;
}

/**
 * Expand `state.counts` into a drop queue of ball IDs.
 * If `shuffle` is enabled, the queue is shuffled deterministically from the seed.
 */
/** prepareDropQueue helper. */
export function prepareDropQueue(state: GameState, { shuffle = true }: { shuffle?: boolean } = {}): string[] {
  const queue: string[] = [];
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

/**
 * Set the desired drop X coordinate (world units).
 * Clamped to valid spawn bounds for the current layout.
 */
/** setDropX helper. */
export function setDropX(state: GameState, x: number): void {
  const pad = state.board.ballR + 2;
  const spawnBoundsAtY =
    state.board.layout === "roulette"
      ? state.board.roulette?.spawnBoundsAtY
      : state.board.layout === "zigzag"
        ? state.board.zigzag?.spawnBoundsAtY
        : null;
  if (spawnBoundsAtY) {
    const { left, right } = spawnBoundsAtY(80);
    state.dropX = clamp(x, left + pad, right - pad);
  } else if (state.board.corridor) {
    const { left, right } = corridorAt(state.board.corridor, 80);
    state.dropX = clamp(x, left + pad, right - pad);
  } else {
    state.dropX = clamp(x, pad, state.board.worldW - pad);
  }
  if (state.mode === "playing" && !state.released) layoutPending(state);
}

/**
 * Start a run: initialize runtime arrays and pre-build the pending marbles queue.
 * Does not release marbles; call `dropAll` to release.
 */
/** startGame helper. */
export function startGame(state: GameState): void {
  state.mode = "playing";
  state.t = 0;
  state.marbles = [];
  state.lastResult = null;
  state.finished = [];
  state.winner = null;
  state.released = false;
  state.stats.propellerContacts = 0;
  state._binCounts = Array.from({ length: state.board.slotCount }, () => 0);

  const queue = prepareDropQueue(state, { shuffle: true });
  state.totalToDrop = queue.length;
  state.pending = queue.map((ballId, i) => makePendingMarble(state, ballId, i));
  layoutPending(state);
}

/** Reset to menu state without rebuilding the board or changing selected counts. */
export function resetGame(state: GameState): void {
  state.mode = "menu";
  state.t = 0;
  state.marbles = [];
  state.lastResult = null;
  state.pending = [];
  state.released = false;
  state.totalToDrop = 0;
  state.finished = [];
  state.winner = null;
  state.stats.propellerContacts = 0;
  state._binCounts = Array.from({ length: state.board.slotCount }, () => 0);
}

/**
 * Release all pending marbles immediately.
 * Returns the number released (or null if not currently playing).
 */
/** dropAll helper. */
export function dropAll(state: GameState): number | null {
  if (state.mode !== "playing") return null;
  if (state.released) return 0;
  if (!state.pending.length) return 0;
  state.released = true;
  state.marbles.push(...state.pending);
  const n = state.pending.length;
  state.pending = [];
  // When many marbles spawn overlapping, they can get violently separated on the first frame.
  // Pre-settle a bit against walls to keep them inside the playfield.
  settleMarbles(state, 3);
  return n;
}

/**
 * Advance the simulation by `dt` seconds.
 *
 * For deterministic playback/tests, call this with a fixed timestep
 * (see `window.advanceTime` in main.ts).
 */
/** step helper. */
export function step(state: GameState, dt: number): void {
  if (state.mode !== "playing") return;

  // Heavier feel: lower gravity, lower bounciness, and more damping.
  // Tuning goal: slower, heavier motion. We trade a bit of "pinball pop" for more weight.
  // Slightly slower feel: lower gravity + a bit more damping + lower max speed.
  const g = 720; // px/s^2 in world units
  const restitution = 0.26;
  const air = 0.976;
  const maxV = 1120;

  const { worldW, worldH, slotH, pegRows, slots, slotW, topPad, pegGapY, corridor, wallSegments, wallBins, zigzag } =
    state.board;
  const finishY = worldH - slotH;
  const propellers = zigzag?.propellers || null;
  const rotors = zigzag?.rotors || null;

  // Prevent tunneling through thin walls when many marbles pile up by sub-stepping.
  // Keep this capped to avoid exploding CPU cost for large counts.
  let maxSpeed = 0;
  let minR = Infinity;
  for (const m of state.marbles) {
    if (m.done) continue;
    const sp = Math.hypot(m.vx, m.vy);
    if (sp > maxSpeed) maxSpeed = sp;
    if (m.r < minR) minR = m.r;
  }
  const maxDisp = maxSpeed * dt + 0.5 * g * dt * dt;
  const targetDisp = Math.max(4, (Number.isFinite(minR) ? minR : 18) * 0.45);
  const subSteps = clampInt(Math.ceil(maxDisp / targetDisp), 1, 6);
  const dtSub = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    state.t += dtSub;

    // Integrate.
    for (const m of state.marbles) {
      if (m.done) continue;

      m.vy += g * dtSub;
      m.vx *= air;
      m.vy *= air;

      // Cap speed so chaos objects can't make marbles look weightless.
      const sp2 = m.vx * m.vx + m.vy * m.vy;
      if (sp2 > maxV * maxV) {
        const k = maxV / Math.sqrt(sp2);
        m.vx *= k;
        m.vy *= k;
      }

      m.x += m.vx * dtSub;
      m.y += m.vy * dtSub;

      // Finish line -> slot result.
      if (m.y + m.r >= finishY) {
        const idx = clampInt(Math.floor(m.x / slotW), 0, slots.length - 1);
        const n = (state._binCounts?.[idx] ?? 0) | 0;
        if (!m.result) {
          // If there is only one finish slot, treat "label" as arrival order.
          const order = n + 1;
          const label = slots.length === 1 ? String(order) : slots[idx]!.label;
          m.result = { slot: idx, label } satisfies MarbleResult;
          state.lastResult = { marbleId: m.id, ballId: m.ballId, ...m.result };
          state.finished.push({ marbleId: m.id, ballId: m.ballId, t: state.t, ...m.result } satisfies FinishRecord);
        }

        // Immediately place into a deterministic pile inside the slot, so the bottom is visibly "filled".
        const slot = slots[idx]!;
        const zonePadBase = 22; // aligns with render.js slot zone inset
        const zonePad = Math.max(zonePadBase, m.r * 0.75);
        const zoneX0 = slot.x0 + zonePad;
        const zoneX1 = slot.x1 - zonePad;
        const slotTopY = worldH - slotH;
        const zoneY0 = slotTopY + zonePadBase; // top inset
        const zoneY1 = worldH - zonePadBase; // bottom inset

        const dx = Math.max(1, m.r * 2.18);
        const dy = Math.max(1, m.r * 2.08);
        const usableW = Math.max(1, zoneX1 - zoneX0);
        const cols = clampInt(Math.floor(usableW / dx), 1, 24);
        const row = Math.floor(n / cols);
        const col = n % cols;

        // Fill left->right, then next row (top->down). If we exceed slot height, overflow stacks upward above the slot.
        const maxRowsInSlot = Math.max(1, Math.floor(Math.max(1, (zoneY1 - zoneY0)) / dy));
        let y = zoneY0 + m.r + row * dy;
        if (row >= maxRowsInSlot) {
          const overflow = row - (maxRowsInSlot - 1);
          y = zoneY0 + m.r - overflow * dy;
        }
        const x = zoneX0 + m.r + col * dx;
        m.x = clamp(x, zoneX0 + m.r, zoneX1 - m.r);
        m.y = y;

        if (state._binCounts && idx >= 0 && idx < state._binCounts.length) state._binCounts[idx] = n + 1;
        m.vx = 0;
        m.vy = 0;
        m.done = true;
      }
    }

    // Resolve collisions. Iterate a couple times to handle dense stacks.
    for (let iter = 0; iter < 2; iter++) {
      for (const m of state.marbles) {
        if (m.done) continue;

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

        // Zigzag layout: rotating propellers in mixing chamber.
        if (propellers && propellers.length) {
          for (const p of propellers) {
            resolvePropeller(state, m, p);
          }
        }

        // Zigzag layout: early circular rotors near the start.
        if (rotors && rotors.length) {
          for (const r of rotors) resolveRotor(state, m, r, restitution);
        }
      }

      // Marble-marble collisions (simple impulse).
      // This keeps the "all drop together" case from looking like ghosts.
      for (let i = 0; i < state.marbles.length; i++) {
        const a = state.marbles[i];
        if (a.done) continue;
        for (let j = i + 1; j < state.marbles.length; j++) {
          const b = state.marbles[j];
          if (b.done) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const push = (rr - d) * 0.5;
          a.x += nx * push;
          a.y += ny * push;
          b.x -= nx * push;
          b.y -= ny * push;

          const rvx = a.vx - b.vx;
          const rvy = a.vy - b.vy;
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const imp = -(1 + restitution) * vn * 0.5; // equal mass
            a.vx += imp * nx;
            a.vy += imp * ny;
            b.vx -= imp * nx;
            b.vy -= imp * ny;
          }
        }
      }
    }

    // Unstuck: if a marble makes almost no downward progress over a time window (even if it's "moving" by jittering),
    // give it a deterministic nudge. This prevents permanent jams on fixed layouts with large counts.
    for (const m of state.marbles) {
      if (m.done) continue;
      if (m._unstuckCdMs == null) m._unstuckCdMs = 0;
      m._unstuckCdMs = Math.max(0, m._unstuckCdMs - dtSub * 1000);
      if (m._winMs == null) {
        m._winMs = 0;
        m._winY0 = m.y;
        m._winYMin = m.y;
        m._winYMax = m.y;
      }
      m._winMs += dtSub * 1000;
      const winYMin = m._winYMin ?? m.y;
      const winYMax = m._winYMax ?? m.y;
      m._winYMin = Math.min(winYMin, m.y);
      m._winYMax = Math.max(winYMax, m.y);
      if (m._winMs < 900) continue;

      const winY0 = m._winY0 ?? m.y;
      const dyNet = m.y - winY0;
      const yRange = (m._winYMax ?? m.y) - (m._winYMin ?? m.y);
      m._winMs = 0;
      m._winY0 = m.y;
      m._winYMin = m.y;
      m._winYMax = m.y;

      const sp = Math.hypot(m.vx, m.vy);
      if (dyNet > 35) m._unstuckHits = 0;

      // If we barely progressed and we're oscillating inside a small pocket, kick it out.
      // Guard with cooldown to avoid speeding up the whole simulation.
      if (m._unstuckCdMs <= 0 && state.t > 2 && m.y > 180 && dyNet < 8 && yRange < 140 && sp < 240) {
        const dir = hash01(m.id) < 0.5 ? -1 : 1;
        const hits = (m._unstuckHits || 0) + 1;
        m._unstuckHits = hits;
        const k = Math.min(4, hits);
        // Prefer a downward kick with only a small lateral separation.
        m.vx = m.vx * 0.35 + dir * 40;
        m.vy = Math.max(m.vy, 0) + 380 + 140 * (k - 1);
        // Also move the marble slightly downward to break geometric "corner locks".
        // (Velocity-only nudges can be canceled out by immediate wall pushes.)
        m.y += Math.max(2, m.r * (0.7 + 0.5 * (k - 1)));
        m._unstuckCdMs = 2500;
      }
    }

    if (state.released && state.totalToDrop > 0 && state.finished.length === state.totalToDrop) {
      // Winner: the one who arrives last (max finish time). With simultaneous drop, this is also the last finish event.
      const last = state.finished.reduce((a, b) => (a.t >= b.t ? a : b));
      state.winner = last;
      break;
    }
  }
}

export interface TextSnapshot {
  note: string;
  mode: GameState["mode"];
  t: number;
  counts: Record<string, number>;
  pendingCount: number;
  released: boolean;
  totalToDrop: number;
  finishedCount: number;
  winner: FinishRecord | null;
  dropX: number;
  board: {
    worldW: number;
    worldH: number;
    pegCount: number;
    slotCount: number;
    hasCorridor: boolean;
  };
  marbles: Array<{
    id: string;
    ballId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    done: boolean;
    result: MarbleResult | null;
  }>;
  lastResult: GameState["lastResult"];
}

/** Return a stable, JSON-serializable snapshot for automation/debug UI. */
export function snapshotForText(state: GameState): TextSnapshot {
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

/** clamp helper. */
function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
/** clampInt helper. */
function clampInt(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v | 0));
}

/** makePendingMarble helper. */
function makePendingMarble(state: GameState, ballId: string, idx: number): Marble {
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

/** layoutPending helper. */
function layoutPending(state: GameState): void {
  const { worldW, ballR } = state.board;
  const n = state.pending.length;
  if (!n) return;
  const gap = ballR * 2.2;
  const spawnY =
    state.board.layout === "roulette"
      ? state.board.roulette?.spawnY
      : state.board.layout === "zigzag"
        ? state.board.zigzag?.spawnY
        : null;
  const baseY = typeof spawnY === "number" ? spawnY : 70;
  const spawnBounds = (y: number): { left: number; right: number } => {
    const spawnBoundsAtY =
      state.board.layout === "roulette"
        ? state.board.roulette?.spawnBoundsAtY
        : state.board.layout === "zigzag"
          ? state.board.zigzag?.spawnBoundsAtY
          : null;
    if (spawnBoundsAtY) {
      const b = spawnBoundsAtY(y);
      const left = Number(b?.left);
      const right = Number(b?.right);
      if (Number.isFinite(left) && Number.isFinite(right) && right - left > ballR * 4) return { left, right };
    }
    return { left: ballR + 2, right: worldW - ballR - 2 };
  };
  const b0 = spawnBounds(baseY);
  const usableW = Math.max(ballR * 4, (b0.right - b0.left) - ballR * 2);
  const perRow = Math.max(1, Math.floor(usableW / gap));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const colsInThisRow = Math.min(perRow, n - row * perRow);
    // Stack downward to avoid escaping above the top cap.
    state.pending[i].y = baseY + row * (ballR * 1.9);
    const b = spawnBounds(state.pending[i].y);
    const center = clamp(state.dropX, b.left + ballR + 2, b.right - ballR - 2);
    const x0 = center - ((colsInThisRow - 1) * gap) / 2;
    const desiredX = x0 + col * gap;
    if (
      (state.board.layout === "roulette" && state.board.roulette?.spawnBoundsAtY) ||
      (state.board.layout === "zigzag" && state.board.zigzag?.spawnBoundsAtY)
    ) {
      state.pending[i].x = clamp(desiredX, b.left + ballR + 2, b.right - ballR - 2);
    } else if (state.board.corridor) {
      const { left, right } = corridorAt(state.board.corridor, state.pending[i].y);
      state.pending[i].x = clamp(desiredX, left + ballR + 2, right - ballR - 2);
    } else {
      state.pending[i].x = clamp(desiredX, ballR + 2, worldW - ballR - 2);
    }
  }
}

/** settleMarbles helper. */
function settleMarbles(state: GameState, iterations: number): void {
  const { worldW, wallSegments, wallBins, corridor } = state.board;
  const restitution = 0.25;
  const topY =
    state.board.layout === "roulette"
      ? state.board.roulette?.topY
      : state.board.layout === "zigzag"
        ? state.board.zigzag?.topY
        : null;
  for (let it = 0; it < iterations; it++) {
    // Walls first.
    for (const m of state.marbles) {
      if (m.done) continue;
      if (wallSegments && wallSegments.length) {
        resolveWallSegments(state.board, m, restitution, wallSegments, wallBins);
        // Also clamp against top cap line even if segments miss due to numerical issues.
        if (topY != null) {
          const top = topY + m.r + 2;
          if (m.y < top) m.y = top;
        }
      } else if (corridor) {
        const { left, right } = corridorAt(corridor, m.y);
        m.x = clamp(m.x, left + m.r, right - m.r);
      } else {
        m.x = clamp(m.x, m.r, worldW - m.r);
      }
    }
    // Marble-marble separation.
    for (let i = 0; i < state.marbles.length; i++) {
      const a = state.marbles[i];
      if (a.done) continue;
      for (let j = i + 1; j < state.marbles.length; j++) {
        const b = state.marbles[j];
        if (b.done) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const push = (rr - d) * 0.5;
        a.x += nx * push;
        a.y += ny * push;
        b.x -= nx * push;
        b.y -= ny * push;
      }
    }
  }
}

/** lerp helper. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** makeCorridor helper. */
function makeCorridor({ worldW, worldH, ballR }: { worldW: number; worldH: number; ballR: number }): Corridor {
  const wideHalf = worldW / 2;
  const narrowW = ballR * 7.2; // ~2-3 balls through, depending on scale.
  const narrowHalf = Math.min(wideHalf, Math.max(narrowW / 2, ballR * 2.8));

  // Funnel profile: monotonically narrows from top -> bottom.
  const startY = 120;
  const endY = worldH - 220;

  // Fixed "clear" bands where we remove objects for custom designs later.
  const bandH = Math.max(220, ballR * 18);
  const bands: Array<{ y0: number; y1: number }> = [];
  for (const t of [0.28, 0.58, 0.86]) {
    const cy = lerp(startY, endY, t);
    bands.push({ y0: cy - bandH / 2, y1: cy + bandH / 2 });
  }

  return { worldW, startY, endY, wideHalf, narrowHalf, clearBands: bands };
}

/** isClearZone helper. */
function isClearZone(corridor: Corridor, y: number): boolean {
  for (const b of corridor.clearBands || []) {
    if (y >= b.y0 && y <= b.y1) return true;
  }
  return false;
}

/** corridorAt helper. */
function corridorAt(corridor: Corridor, y: number): { left: number; right: number } {
  const cx = corridor.worldW / 2;
  const t = clamp((y - corridor.startY) / (corridor.endY - corridor.startY), 0, 1);
  // Smooth but steady narrowing.
  const u = smoothstep(t);
  const hw = lerp(corridor.wideHalf, corridor.narrowHalf, u);
  const left = clamp(cx - hw, 0, corridor.worldW);
  const right = clamp(cx + hw, 0, corridor.worldW);
  return { left, right };
}

/** smoothstep helper. */
function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/** makeZigzagLayout helper. */
function makeZigzagLayout({
  worldW,
  worldH,
  slotH,
  ballR = 18,
  customRotors = null
}: {
  worldW: number;
  worldH: number;
  slotH: number;
  ballR?: number;
  customRotors?: MakeBoardOptions["customRotors"];
}): ZigzagLayout {
  const padX = 32;
  const topY = 40;
  const spawnY = topY + 70;

  const yEnd = worldH - slotH - 40;

  // Keep the corridor narrow enough to induce wall interaction (avoid long straight falls),
  // but wide enough to let several marbles pass without constant deadlocks.
  const maxHalf = Math.max(80, worldW / 2 - padX - 6);
  // Slightly wider than the absolute minimum: reduces multi-marble deadlocks while keeping wall interactions frequent.
  const narrowHalfA = clamp(Math.max(ballR * 6.8, 132), 96, Math.min(maxHalf, worldW * 0.24));
  // Slightly widen the post-mix corridor to reduce pile-up deadlocks.
  const narrowHalfB = clamp(narrowHalfA * 1.18, narrowHalfA, Math.min(maxHalf, worldW * 0.28));
  const wideHalf = clamp(Math.max(320, narrowHalfA * 2.9), narrowHalfA * 2.2, Math.min(maxHalf, worldW * 0.46));

  const travelH = yEnd - topY;
  const ky = (t: number): number => topY + travelH * t;
  const k = (t: number, cxFrac: number, hw: number): { y: number; cx: number; hw: number } => ({
    y: ky(t),
    cx: worldW * cxFrac,
    hw
  });

  // Zigzag keys: frequent, fixed left-right alternation to avoid long straight drops.
  // Then a wide mixing chamber with a rotating propeller, then more zigzag to the bottom.
  const keys = [
    // Wide, fair start corridor (no forced left/right bias at spawn).
    k(0.00, 0.50, wideHalf),
    k(0.08, 0.50, wideHalf),
    // Stay wide a bit longer so dense drops can spread before the first pinch/zigzag.
    k(0.16, 0.50, wideHalf),
    k(0.22, 0.50, narrowHalfA),

    // Start zigzag after the initial straight.
    k(0.28, 0.30, narrowHalfA),
    k(0.34, 0.70, narrowHalfA),
    k(0.40, 0.28, narrowHalfA),
    k(0.46, 0.72, narrowHalfA),
    k(0.52, 0.32, narrowHalfA),
    k(0.58, 0.68, narrowHalfA),

    // Mixing chamber (wide).
    k(0.60, 0.52, wideHalf),
    k(0.68, 0.48, wideHalf),
    k(0.76, 0.52, wideHalf),

    // Back to narrow zigzag.
    k(0.80, 0.60, narrowHalfB),
    k(0.86, 0.40, narrowHalfB),
    k(0.92, 0.62, narrowHalfB),
    // Funnel toward the exits near the bottom.
    k(0.96, 0.50, clamp(Math.max(ballR * 4.2, 92), 72, narrowHalfB * 0.92)),
    k(1.00, 0.50, clamp(Math.max(ballR * 3.6, 78), 60, narrowHalfB * 0.82))
  ];

  /** profileAt helper. */
  function profileAt(y: number): { y: number; cx: number; hw: number } {
    if (y <= keys[0].y) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i];
      const b = keys[i + 1];
      if (y >= a.y && y <= b.y) {
        const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return { y, cx: lerp(a.cx, b.cx, t), hw: lerp(a.hw, b.hw, t) };
      }
    }
    return keys[keys.length - 1];
  }

  const sampleN = 200;
  const left: Array<readonly [number, number]> = [];
  const right: Array<readonly [number, number]> = [];
  for (let i = 0; i < sampleN; i++) {
    const y = topY + (i / (sampleN - 1)) * (yEnd - topY);
    const { cx, hw } = profileAt(y);
    left.push([clamp(cx - hw, padX, worldW - padX), y] as const);
    right.push([clamp(cx + hw, padX, worldW - padX), y] as const);
  }

  const entities: FixedEntity[] = [
    { id: "outer-left", type: "polyline", points: left },
    { id: "outer-right", type: "polyline", points: right },
    { id: "top-cap", type: "polyline", points: [[left[0]![0], topY] as const, [right[0]![0], topY] as const] }
  ];

  // Early circular rotors at the start (kept for early interaction).
  const rotors: Rotor[] = [];
  {
    const yA = ky(0.095);
    const yB = ky(0.112);
    const pA = profileAt(yA);
    const leftA = clamp(pA.cx - pA.hw, padX, worldW - padX);
    const rightA = clamp(pA.cx + pA.hw, padX, worldW - padX);
    const margin = Math.max(ballR * 1.8, 44);
    const x0 = leftA + margin;
    const x1 = rightA - margin;
    const availW = Math.max(0, x1 - x0);

    const nA = 7;
    const nB = 6;
    const gap = Math.max(ballR * 4.0, 56); // ~2 balls can pass
    const dy = Math.abs(yB - yA);
    const vGap = Math.max(2, ballR * 0.28);
    const maxR_V = (dy - vGap) / 2;
    const maxR_A = (availW - gap * (nA - 1)) / (2 * nA);
    const maxR_B = (availW - gap * (nB - 1)) / (2 * nB);
    const r = clamp(Math.min(maxR_V, maxR_A, maxR_B) * 0.98, ballR * 0.45, ballR * 0.90);
    if (r > ballR * 0.40) {
      const stepA = (availW - 2 * r) / (nA - 1);
      const stepB = (availW - 2 * r) / (nB - 1);
      for (let i = 0; i < nA; i++) {
        const x = x0 + r + i * stepA;
        rotors.push({
          x,
          y: yA,
          r,
          omega: (i % 2 ? -1 : 1) * 12.5,
          maxSurf: 560,
          bounce: 0.28,
          kick: 190,
          dampT: 0.02,
          down: 18,
          maxUp: 0
        });
      }
      for (let i = 0; i < nB; i++) {
        const x = x0 + r + i * stepB;
        rotors.push({
          x,
          y: yB,
          r,
          omega: ((i + 1) % 2 ? -1 : 1) * 12.5,
          maxSurf: 560,
          bounce: 0.28,
          kick: 190,
          dampT: 0.02,
          down: 18,
          maxUp: 0
        });
      }
    }
  }

  // Zigzag: add straight propellers right after each bend to create interaction
  // without extra object systems.
  const propellers: Propeller[] = [];
  let turnIdx = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (Math.abs(a.cx - b.cx) < 1e-3) continue;
    const y = lerp(a.y, b.y, 0.45);
    const prof = profileAt(y);
    // Make bars longer for more interaction, but never long enough to touch the walls.
    // Since the bar rotates, use a conservative max length based on corridor half-width.
    const clearance = Math.max(ballR * 2.6, 54);
    const maxLen = Math.max(80, (prof.hw - clearance) * 2);
    const wantLen = clamp(prof.hw * 1.95, 180, 640);
    const len = Math.max(80, Math.min(wantLen, maxLen));
    const dir = turnIdx % 2 ? -1 : 1;
    propellers.push({
      id: `zigzag-bar-${turnIdx}`,
      x: prof.cx,
      y,
      len,
      omega: dir * 1.05,
      phase: (Math.PI / 10) * turnIdx,
      mix: 7,
      down: 26,
      maxUp: 120,
      maxSurf: 520,
      bounce: 0.06
    });
    turnIdx++;
  }

  // Exit propellers (hand-tuned): spaced so they don't visually overlap while rotating.
  // Fractions are of worldH/worldW (matches the user's coordinate pick tool).
  {
    const xFrac = 0.497;
    const yFracs = [0.966, 0.976, 0.985]; // upper -> lower
    for (let i = 0; i < yFracs.length; i++) {
      const y = worldH * yFracs[i];
      const prof = profileAt(y);
      const clearance = Math.max(ballR * 2.9, 62);
      const maxLen = Math.max(120, (prof.hw - clearance) * 2);
      const left = clamp(prof.cx - prof.hw, padX, worldW - padX);
      const right = clamp(prof.cx + prof.hw, padX, worldW - padX);
      const xWant = worldW * xFrac;
      const x = clamp(xWant, left + clearance, right - clearance);

      // Keep them a bit shorter near the exit so three bars can coexist.
      const wantLen = clamp(prof.hw * 1.72, 220, 620);
      const len = Math.max(120, Math.min(wantLen, maxLen * 0.92));
      const dir = i % 2 ? -1 : 1;
      propellers.push({
        id: `exit-bar-${i}`,
        x,
        y,
        len,
        omega: dir * (1.35 + i * 0.22),
        phase: (Math.PI * 2 * i) / 3,
        mix: 12,
        down: 10,
        maxUp: 180,
        maxSurf: 740,
        bounce: 0.10
      });
    }
  }

  // Mid-section rotors (auto): sprinkle a few circular rotors between bar propellers.
  // If the user provides `customRotors`, skip auto-rotors so placements are deterministic.
  if (!Array.isArray(customRotors) || customRotors.length === 0) {
    const rBase = clamp(ballR * 0.78, ballR * 0.55, ballR * 0.95);
    const maxAdd = Math.max(16, Math.min(24, Math.round(worldH / 900) * 8));
    let added = 0;
    let lastY = -Infinity;
    const minDY = Math.max(ballR * 7.2, 120);
    for (let i = 0; i < propellers.length && added < maxAdd; i++) {
      // Skip the last two (exit flippers) to keep the bottom readable.
      if (i >= Math.max(0, propellers.length - 2)) break;
      const y = propellers[i].y + (i % 2 ? 56 : 86);
      if (y < spawnY + 140 || y > worldH - slotH - 260) continue;
      if (y - lastY < minDY) continue;
      const prof = profileAt(y);
      const margin = Math.max(ballR * 4.2, 120);
      const left = clamp(prof.cx - prof.hw, padX, worldW - padX);
      const right = clamp(prof.cx + prof.hw, padX, worldW - padX);
      const avail = Math.max(0, (right - left) - margin * 2);
      if (avail < rBase * 2.6) continue;
      const dir = added % 2 ? -1 : 1;
      const x = clamp(
        prof.cx + dir * Math.min(prof.hw * (0.30 + 0.06 * ((added % 3) - 1)), avail * 0.40),
        left + margin,
        right - margin
      );
      rotors.push({
        x,
        y,
        r: rBase,
        omega: (added % 2 ? -1 : 1) * (10.5 + (added % 4) * 0.6),
        maxSurf: 620,
        bounce: 0.07,
        dampT: 0.02,
        down: 16,
        maxUp: 20
      });
      added++;
      lastY = y;
    }
  }

  // User-provided rotors (hand-tuned placements).
  if (Array.isArray(customRotors) && customRotors.length) {
    for (const cr of customRotors) {
      if (!cr) continue;
      const x =
        typeof cr.x === "number"
          ? cr.x
          : typeof cr.xFrac === "number"
            ? cr.xFrac * worldW
            : null;
      const y =
        typeof cr.y === "number"
          ? cr.y
          : typeof cr.yFrac === "number"
            ? cr.yFrac * worldH
            : null;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const xN = x as number;
      const yN = y as number;
      const r =
        typeof cr.r === "number" && Number.isFinite(cr.r) ? cr.r : clamp(ballR * 0.78, ballR * 0.55, ballR * 0.95);
      const omega = typeof cr.omega === "number" && Number.isFinite(cr.omega) ? cr.omega : 11.0;
      const maxSurf = typeof cr.maxSurf === "number" && Number.isFinite(cr.maxSurf) ? cr.maxSurf : 620;
      const bounce = typeof cr.bounce === "number" && Number.isFinite(cr.bounce) ? cr.bounce : 0.28;
      const kick = typeof cr.kick === "number" && Number.isFinite(cr.kick) ? cr.kick : 190;
      const dampT = typeof cr.dampT === "number" && Number.isFinite(cr.dampT) ? cr.dampT : 0.02;
      const down = typeof cr.down === "number" && Number.isFinite(cr.down) ? cr.down : 16;
      const maxUp = typeof cr.maxUp === "number" && Number.isFinite(cr.maxUp) ? cr.maxUp : 20;
      rotors.push({
        x: clamp(xN, padX + r + 2, worldW - padX - r - 2),
        y: clamp(yN, 30 + r, worldH - slotH - 30 - r),
        r,
        omega,
        maxSurf,
        bounce,
        kick,
        dampT,
        down,
        maxUp
      });
    }
  }

  return {
    entities,
    propellers,
    rotors,
    topY,
    spawnY,
    spawnBoundsAtY: (y: number) => {
      const { cx, hw } = profileAt(y);
      return { left: clamp(cx - hw, padX, worldW - padX), right: clamp(cx + hw, padX, worldW - padX) };
    }
  };
}

/** makeRouletteLayout helper. */
function makeRouletteLayout({ worldW, worldH, slotH }: { worldW: number; worldH: number; slotH: number }): RouletteLayout {
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

  type PolylineEntity = Extract<FixedEntity, { type: "polyline" }>;
  const polylines: PolylineEntity[] = stagePolylines.map((pl) => ({
    id: pl.id,
    type: "polyline",
    points: pl.points.map(([x, y]) => [padX + (x - xMin) * sx, padY + (y + yOff - yMin) * sy] as const)
  }));

  const outerLeft = polylines.find((p) => p.id === "outer-left")?.points || [];
  const outerRight = polylines.find((p) => p.id === "outer-right")?.points || [];
  const topY = Math.min(...outerLeft.map((p) => p[1]).concat(outerRight.map((p) => p[1])));
  const spawnY = topY + 48;

  // Close the top so marbles can't escape upward when crowded.
  const capLeft = interpolateXAtY(outerLeft, topY);
  const capRight = interpolateXAtY(outerRight, topY);
  polylines.push({
    id: "top-cap",
    type: "polyline",
    points: [
      [capLeft, topY] as const,
      [capRight, topY] as const
    ]
  });

  const boxes: FixedEntity[] = stageBoxes.map((b) => ({
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
    },
    spawnY,
    topY
  };
}

/** normalizeRotation helper. */
function normalizeRotation(rot: number): number {
  const r = Number(rot) || 0;
  // Heuristic: values with magnitude > 2*pi are degrees.
  if (Math.abs(r) > Math.PI * 2) return (r * Math.PI) / 180;
  return r;
}

/** interpolateXAtY helper. */
function interpolateXAtY(points: Array<readonly [number, number]>, y: number): number {
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

/** buildWallSegments helper. */
function buildWallSegments(entities: FixedEntity[]): WallSegment[] {
  const segs: WallSegment[] = [];
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

/** boxToSegments helper. */
function boxToSegments(b: Extract<FixedEntity, { type: "box" }>): WallSegment[] {
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
  const segs: WallSegment[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const d = pts[(i + 1) % 4];
    segs.push(makeSeg(a[0], a[1], d[0], d[1]));
  }
  return segs;
}

/** makeSeg helper. */
function makeSeg(x0: number, y0: number, x1: number, y1: number): WallSegment {
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

/** buildSegmentBins helper. */
function buildSegmentBins(segments: WallSegment[], binH: number): SegmentBins {
  let yMax = 0;
  for (const s of segments) yMax = Math.max(yMax, s.yMax);
  const n = Math.max(1, Math.ceil(yMax / binH) + 1);
  const bins: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const a = clampInt(Math.floor(s.yMin / binH), 0, n - 1);
    const b = clampInt(Math.floor(s.yMax / binH), 0, n - 1);
    for (let k = a; k <= b; k++) bins[k].push(i);
  }
  return { binH, bins };
}

/** resolveWallSegments helper. */
function resolveWallSegments(
  board: Board,
  m: Marble,
  restitution: number,
  segments: WallSegment[],
  bins: SegmentBins | null
): void {
  const candidates: number[] = [];
  if (bins && bins.bins.length) {
    const h = Number(bins.binH) || 260;
    const i0 = clampInt(Math.floor((m.y - m.r - 60) / h), 0, bins.bins.length - 1);
    const i1 = clampInt(Math.floor((m.y + m.r + 60) / h), 0, bins.bins.length - 1);
    for (let i = i0; i <= i1; i++) {
      for (const idx of bins.bins[i] || []) candidates.push(idx);
    }
  } else {
    for (let i = 0; i < segments.length; i++) candidates.push(i);
  }

  // Always dedupe to avoid resolving the same segment multiple times when bins overlap.
  const uniq = new Set(candidates);
  for (const idx of uniq.values()) {
    const s = segments[idx];
    if (m.y + m.r < s.yMin - 2 || m.y - m.r > s.yMax + 2) continue;
    resolveCircleSegment(m, s, restitution);
  }

  // As a safety net, keep within world bounds.
  m.x = clamp(m.x, m.r, board.worldW - m.r);
}

/** resolveCircleSegment helper. */
function resolveCircleSegment(m: Marble, s: WallSegment, restitution: number): void {
  const px = m.x;
  const py = m.y;
  const dx0 = s.dx || (s.x1 - s.x0);
  const dy0 = s.dy || (s.y1 - s.y0);
  const len2 = s.len2 || Math.max(1e-9, dx0 * dx0 + dy0 * dy0);
  const t = clamp(((px - s.x0) * dx0 + (py - s.y0) * dy0) / len2, 0, 1);
  const cx = s.x0 + dx0 * t;
  const cy = s.y0 + dy0 * t;
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
    // Important: don't overdamp *downward* wall-sliding (especially in zigzag corridors),
    // otherwise marbles feel like they "stick" to the wall and drain painfully slowly.
    const tx = -ny;
    const ty = nx;
    const vt = m.vx * tx + m.vy * ty;
    const downAlongWall = vt * ty > 0; // +y is down in our coords
    const k = downAlongWall ? 0.012 : 0.055;
    m.vx -= vt * tx * k;
    m.vy -= vt * ty * k;
  }
}

/** resolvePropeller helper. */
function resolvePropeller(state: GameState, m: Marble, p: Propeller): void {
  const t = state.t;
  const ang = (p.phase ?? 0) + (p.omega ?? 0) * t;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = (p.len / 2) * c;
  const hy = (p.len / 2) * s;
  const seg = makeSeg(p.x - hx, p.y - hy, p.x + hx, p.y + hy);

  // Find closest point on segment.
  const tt = clamp(((m.x - seg.x0) * seg.dx + (m.y - seg.y0) * seg.dy) / seg.len2, 0, 1);
  const cx = seg.x0 + seg.dx * tt;
  const cy = seg.y0 + seg.dy * tt;
  const dx = m.x - cx;
  const dy = m.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= m.r * m.r || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;

  // Push out.
  const push = (m.r - d) + 0.02;
  m.x += nx * push;
  m.y += ny * push;

  // Kinematic surface velocity at contact point (omega cross r).
  const rx = cx - p.x;
  const ry = cy - p.y;
  const omega = p.omega ?? 0;
  let vSurfX = -omega * ry;
  let vSurfY = omega * rx;
  const maxSurf = typeof p.maxSurf === "number" && Number.isFinite(p.maxSurf) ? p.maxSurf : Infinity;
  if (Number.isFinite(maxSurf) && maxSurf > 0) {
    const vmag = Math.hypot(vSurfX, vSurfY);
    if (vmag > maxSurf) {
      const k = maxSurf / vmag;
      vSurfX *= k;
      vSurfY *= k;
    }
  }

  // Reflect relative velocity against the propeller surface.
  const rvx = m.vx - vSurfX;
  const rvy = m.vy - vSurfY;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const bounce = typeof p.bounce === "number" && Number.isFinite(p.bounce) ? p.bounce : 0.10; // propeller is more "paddly" than bouncy
    m.vx = rvx - (1 + bounce) * vn * nx + vSurfX;
    m.vy = rvy - (1 + bounce) * vn * ny + vSurfY;
  }

  // Add a small tangential shove to "mix" marbles.
  const tx = -ny;
  const ty = nx;
  const vt = (m.vx - vSurfX) * tx + (m.vy - vSurfY) * ty;
  const mix = typeof p.mix === "number" && Number.isFinite(p.mix) ? p.mix : 8;
  const down = typeof p.down === "number" && Number.isFinite(p.down) ? p.down : 18;
  m.vx += tx * (mix * Math.sign(vt || 1));
  m.vy += ty * (mix * Math.sign(vt || 1));
  // Downward bias helps keep the simulation draining even with many marbles.
  m.vy += down;
  // Prevent propellers from launching marbles far upward (can cause top-side pileups).
  const maxUp = typeof p.maxUp === "number" && Number.isFinite(p.maxUp) ? p.maxUp : 120; // px/s
  m.vy = Math.max(m.vy, -maxUp);

  state.stats.propellerContacts++;
}

/** resolveRotor helper. */
function resolveRotor(state: GameState, m: Marble, r: Rotor, restitution: number): void {
  const dx = m.x - r.x;
  const dy = m.y - r.y;
  const sumR = m.r + r.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= sumR * sumR || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;

  // Push out.
  const push = (sumR - d) + 0.02;
  m.x += nx * push;
  m.y += ny * push;

  // Rotor surface velocity at contact point (omega cross rVec).
  const omega = r.omega ?? 0;
  const rx = (r.r + 0.5) * nx;
  const ry = (r.r + 0.5) * ny;
  let vSurfX = -omega * ry;
  let vSurfY = omega * rx;
  const maxSurf = typeof r.maxSurf === "number" && Number.isFinite(r.maxSurf) ? r.maxSurf : Infinity;
  if (Number.isFinite(maxSurf) && maxSurf > 0) {
    const vmag = Math.hypot(vSurfX, vSurfY);
    if (vmag > maxSurf) {
      const k = maxSurf / vmag;
      vSurfX *= k;
      vSurfY *= k;
    }
  }

  // Reflect relative velocity against rotor surface.
  const rvx = m.vx - vSurfX;
  const rvy = m.vy - vSurfY;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const bounce = typeof r.bounce === "number" && Number.isFinite(r.bounce) ? r.bounce : restitution;
    m.vx = rvx - (1 + bounce) * vn * nx + vSurfX;
    m.vy = rvy - (1 + bounce) * vn * ny + vSurfY;
  }

  // Extra "bumper" kick so rotors feel like pinball bumpers (stronger separation, more drama).
  // Applied along the collision normal after reflection.
  const kick = typeof r.kick === "number" && Number.isFinite(r.kick) ? r.kick : 0;
  if (kick) {
    m.vx += nx * kick;
    m.vy += ny * kick;
  }

  // Mild tangential damping to avoid endless orbiting.
  const tx = -ny;
  const ty = nx;
  const vt = (m.vx - vSurfX) * tx + (m.vy - vSurfY) * ty;
  const dampT = typeof r.dampT === "number" && Number.isFinite(r.dampT) ? r.dampT : 0.02;
  m.vx -= vt * tx * dampT;
  m.vy -= vt * ty * dampT;

  // Help the board keep draining.
  const down = typeof r.down === "number" && Number.isFinite(r.down) ? r.down : 0;
  if (down) m.vy += down;
  const maxUp = typeof r.maxUp === "number" && Number.isFinite(r.maxUp) ? r.maxUp : Infinity;
  if (Number.isFinite(maxUp) && maxUp >= 0) m.vy = Math.max(m.vy, -maxUp);
}

/** hash01 helper. */
function hash01(str: string): number {
  // FNV-1a 32-bit -> [0,1)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
