import type { BallCatalogItem, Board, FixedEntity, GameState, SpawnBounds } from "./engine.ts";
import {
  classifyAvatarGlyph,
  getAvatarImageOffset,
  type AvatarGlyphKind,
} from "./avatar-glyph.ts";

export type RendererViewState = {
  scale: number;
  cameraY: number;
  viewHWorld: number;
  cameraOverrideY: number | null;
};

export type Renderer = {
  ctx: CanvasRenderingContext2D;
  resizeToFit: () => void;
  draw: (state: GameState, ballsCatalog: BallCatalogItem[], imagesById: Map<string, HTMLImageElement>) => void;
  screenToWorld: (x: number, y: number) => { x: number; y: number };
  worldToScreen: (x: number, y: number) => { x: number; y: number };
  getViewState: () => RendererViewState;
  setCameraOverrideY: (y: number | null | undefined) => void;
  clearCameraOverride: () => void;
};

type InternalViewState = RendererViewState & {
  ox: number;
  oy: number;
};

type BgCache = {
  base: HTMLCanvasElement | null;
  baseCtx: CanvasRenderingContext2D | null;
  w: number;
  h: number;
  stripePattern: CanvasPattern | null;
  gridPattern: CanvasPattern | null;
  patternSeed: number;
};

type TrailPoint = {
  x: number;
  y: number;
  atMs: number;
};

type MotionCache = {
  vx: number;
  vy: number;
  lastImpactMs: number;
};

type RingFx = {
  x: number;
  y: number;
  startMs: number;
  durationMs: number;
  radiusFrom: number;
  radiusTo: number;
  color: [number, number, number];
};

type ParticleFx = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  startMs: number;
  durationMs: number;
  color: [number, number, number];
};

export function makeRenderer(canvas: HTMLCanvasElement, { board }: { board: Board }): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!(context instanceof CanvasRenderingContext2D)) throw new Error("2D context not available");
  const ctx: CanvasRenderingContext2D = context;

  const dpr = (): number => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const bootMs = performance.now();
  const hashStr = (s: string): number => {
    // Small deterministic hash for stable per-entity color offsets.
    let h = 2166136261 >>> 0;
    const str = String(s || "");
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };
  const view: InternalViewState = {
    scale: 1,
    ox: 0,
    oy: 0,
    cameraY: 0,
    viewHWorld: board.worldH,
    cameraOverrideY: null
  };

  const bgCache: BgCache = {
    base: null,
    baseCtx: null,
    w: 0,
    h: 0,
    stripePattern: null,
    gridPattern: null,
    patternSeed: 0,
  };
  const trailsByMarble = new Map<string, TrailPoint[]>();
  const motionByMarble = new Map<string, MotionCache>();
  const catalogById = new Map<string, BallCatalogItem>();
  const avatarKindById = new Map<string, AvatarGlyphKind>();
  const labelWidthByKey = new Map<string, number>();
  const impactRings: RingFx[] = [];
  const impactParticles: ParticleFx[] = [];
  const slotRipples: RingFx[] = [];
  let seenFinishedCount = 0;
  let lastCatalogRef: BallCatalogItem[] | null = null;

  function clearRenderFxState() {
    trailsByMarble.clear();
    motionByMarble.clear();
    labelWidthByKey.clear();
    impactRings.length = 0;
    impactParticles.length = 0;
    slotRipples.length = 0;
    seenFinishedCount = 0;
  }

  function ensureCatalogLookup(ballsCatalog: BallCatalogItem[]): void {
    if (lastCatalogRef === ballsCatalog) return;
    lastCatalogRef = ballsCatalog;
    catalogById.clear();
    avatarKindById.clear();
    for (const entry of ballsCatalog) {
      catalogById.set(entry.id, entry);
      avatarKindById.set(entry.id, classifyAvatarGlyph(String(entry.name || "")).kind);
    }
  }

  function resizeToFit(): void {
    const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || board.worldW;
    const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || board.worldH;
    // For tall boards, fit width and use a scrolling camera for Y.
    const s = Math.min(cssW / board.worldW, 1.6);
    view.scale = s;
    view.ox = (cssW - board.worldW * s) / 2;
    view.oy = 0;
    view.viewHWorld = cssH / s;

    const r = dpr();
    canvas.width = Math.floor(cssW * r);
    canvas.height = Math.floor(cssH * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }

  function worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: view.ox + x * view.scale, y: view.oy + (y - view.cameraY) * view.scale };
  }
  function screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale + view.cameraY };
  }

  function makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    return c;
  }

  function ensureBgCache(cssW: number, cssH: number): void {
    if (!bgCache.base || bgCache.w !== cssW || bgCache.h !== cssH) {
      bgCache.w = cssW | 0;
      bgCache.h = cssH | 0;
      bgCache.base = makeCanvas(bgCache.w, bgCache.h);
      bgCache.baseCtx = bgCache.base.getContext("2d");
      bgCache.stripePattern = null;
      bgCache.gridPattern = null;
      bgCache.patternSeed = (bgCache.patternSeed + 1) | 0;
    }

    const bctx = bgCache.baseCtx;
    if (bctx && !bgCache.stripePattern) {
      // Diagonal stripe pattern (pre-rendered for performance).
      const p = makeCanvas(140, 140);
      const pctx = p.getContext("2d");
      if (pctx) {
        pctx.clearRect(0, 0, p.width, p.height);
        pctx.globalAlpha = 1;
        pctx.strokeStyle = "rgba(255,255,255,0.10)";
        pctx.lineWidth = 18;
        for (let i = -p.height; i < p.width + p.height; i += 70) {
          pctx.beginPath();
          pctx.moveTo(i, 0);
          pctx.lineTo(i + p.height, p.height);
          pctx.stroke();
        }
      }
      bgCache.stripePattern = bctx.createPattern(p, "repeat");
    }

    if (bctx && !bgCache.gridPattern) {
      // Neon grid pattern (pre-rendered).
      const p = makeCanvas(128, 128);
      const pctx = p.getContext("2d");
      if (pctx) {
        pctx.clearRect(0, 0, p.width, p.height);
        pctx.lineWidth = 1;

        // Fine grid.
        pctx.strokeStyle = "rgba(0,255,255,0.10)";
        for (let x = 0; x <= p.width; x += 16) {
          pctx.beginPath();
          pctx.moveTo(x + 0.5, 0);
          pctx.lineTo(x + 0.5, p.height);
          pctx.stroke();
        }
        for (let y = 0; y <= p.height; y += 16) {
          pctx.beginPath();
          pctx.moveTo(0, y + 0.5);
          pctx.lineTo(p.width, y + 0.5);
          pctx.stroke();
        }

        // Stronger major lines.
        pctx.strokeStyle = "rgba(255,0,170,0.14)";
        pctx.lineWidth = 2;
        for (let x = 0; x <= p.width; x += 64) {
          pctx.beginPath();
          pctx.moveTo(x + 1, 0);
          pctx.lineTo(x + 1, p.height);
          pctx.stroke();
        }
        for (let y = 0; y <= p.height; y += 64) {
          pctx.beginPath();
          pctx.moveTo(0, y + 1);
          pctx.lineTo(p.width, y + 1);
          pctx.stroke();
        }
      }
      bgCache.gridPattern = bctx.createPattern(p, "repeat");
    }

    // Render base layer once per size change.
    if (bctx && bgCache.base && bgCache.patternSeed) {
      // Use patternSeed to avoid redrawing every call; redraw only after cache reset.
      // Decrement to mark it "drawn".
      bgCache.patternSeed = 0;
      bctx.clearRect(0, 0, bgCache.w, bgCache.h);

      const g = bctx.createLinearGradient(0, 0, 0, bgCache.h);
      g.addColorStop(0, "#06102a");
      g.addColorStop(0.5, "#071a3c");
      g.addColorStop(1, "#040a18");
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, bgCache.w, bgCache.h);

      if (bgCache.stripePattern) {
        bctx.save();
        bctx.globalAlpha = 0.08;
        bctx.fillStyle = bgCache.stripePattern;
        bctx.fillRect(0, 0, bgCache.w, bgCache.h);
        bctx.restore();
      }

      // Gentle vignette.
      const v = bctx.createRadialGradient(bgCache.w * 0.5, bgCache.h * 0.35, 30, bgCache.w * 0.5, bgCache.h * 0.45, bgCache.h * 0.85);
      v.addColorStop(0, "rgba(255,255,255,0.05)");
      v.addColorStop(1, "rgba(0,0,0,0.55)");
      bctx.fillStyle = v;
      bctx.fillRect(0, 0, bgCache.w, bgCache.h);
    }
  }

  function drawBoardBase(tSec = 0): void {
    // Use real time so the background animates even when the simulation is paused (menu, dialogs, etc).
    const rt = (performance.now() - bootMs) / 1000;
    const tt = (Number.isFinite(tSec) ? tSec : 0) + rt * 0.85;

    // Background (optimized): cached base + a couple of animated haze layers + a scrolling neon grid pattern.
    const cssW = canvas.clientWidth || board.worldW;
    const cssH = canvas.clientHeight || board.worldH;
    ensureBgCache(cssW, cssH);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgCache.base) ctx.drawImage(bgCache.base, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Animated neon haze (2 gradients only).
    {
      const p0 = tt * 0.28;
      const p1 = tt * 0.22 + 1.7;
      const x0 = cssW * (0.30 + 0.08 * Math.sin(p0));
      const y0 = cssH * (0.22 + 0.06 * Math.cos(p0 * 1.2));
      const x1 = cssW * (0.72 + 0.08 * Math.cos(p1));
      const y1 = cssH * (0.62 + 0.06 * Math.sin(p1 * 1.1));

      const g0 = ctx.createRadialGradient(x0, y0, 18, x0, y0, Math.max(cssW, cssH) * 0.62);
      g0.addColorStop(0, "rgba(0,255,255,0.12)");
      g0.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g0;
      ctx.fillRect(0, 0, cssW, cssH);

      const g1 = ctx.createRadialGradient(x1, y1, 20, x1, y1, Math.max(cssW, cssH) * 0.72);
      g1.addColorStop(0, "rgba(255,0,170,0.10)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, cssW, cssH);
    }

    // Scrolling neon grid overlay (pattern fill).
    if (bgCache.gridPattern) {
      const dx = -(tt * 22) % 128;
      const dy = (tt * 34) % 128;
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.10 * Math.sin(tt * 0.6);
      ctx.translate(dx, dy);
      ctx.fillStyle = bgCache.gridPattern;
      ctx.fillRect(-128, -128, cssW + 256, cssH + 256);
      ctx.restore();
    }

    ctx.restore();
  }

  function trackMarbleTrailsAndImpacts(state: GameState, nowMs: number): void {
    const liveIds = new Set<string>();
    let activeCount = 0;
    for (const m of state.marbles) {
      if (!m.done) activeCount += 1;
    }
    const heavyLoad = activeCount > 56;
    const trailMaxPoints = activeCount > 60 ? 4 : 6;
    const impactCooldownMs = heavyLoad ? 140 : 95;
    const impactDotThreshold = heavyLoad ? 0.34 : 0.52;
    const impactDeltaVThreshold = heavyLoad ? 320 : 220;

    for (const m of state.marbles) {
      if (m.done) continue;
      liveIds.add(m.id);
      const prev = motionByMarble.get(m.id);
      if (prev) {
        const prevSpeed = Math.hypot(prev.vx, prev.vy);
        const speed = Math.hypot(m.vx, m.vy);
        if (prevSpeed > 95 && speed > 95) {
          const dotNorm = (prev.vx * m.vx + prev.vy * m.vy) / Math.max(1e-6, prevSpeed * speed);
          const deltaV = Math.hypot(m.vx - prev.vx, m.vy - prev.vy);
          if ((dotNorm < impactDotThreshold || deltaV > impactDeltaVThreshold) && nowMs - prev.lastImpactMs > impactCooldownMs) {
            spawnImpactFx(m.x, m.y, nowMs, heavyLoad ? 0.55 : 1);
            prev.lastImpactMs = nowMs;
          }
        }
      }
      motionByMarble.set(m.id, {
        vx: m.vx,
        vy: m.vy,
        lastImpactMs: prev?.lastImpactMs || 0,
      });

      let trail = trailsByMarble.get(m.id);
      if (!trail) {
        trail = [];
        trailsByMarble.set(m.id, trail);
      }
      const last = trail[trail.length - 1];
      const dx = last ? m.x - last.x : 999;
      const dy = last ? m.y - last.y : 999;
      if (!last || dx * dx + dy * dy >= 16 || nowMs - last.atMs > 110) {
        trail.push({ x: m.x, y: m.y, atMs: nowMs });
      }
      while (trail.length > trailMaxPoints) trail.shift();
    }

    for (const key of motionByMarble.keys()) {
      if (!liveIds.has(key)) motionByMarble.delete(key);
    }
    for (const key of trailsByMarble.keys()) {
      if (!liveIds.has(key)) trailsByMarble.delete(key);
    }
  }

  function trackSlotRipples(state: GameState, nowMs: number): void {
    if (state.finished.length < seenFinishedCount) seenFinishedCount = 0;
    if (!state.finished.length) return;
    if (state.finished.length <= seenFinishedCount) return;

    const marbleById = new Map<string, { x: number; y: number }>();
    for (const marble of state.marbles) {
      marbleById.set(marble.id, marble);
    }

    for (let i = seenFinishedCount; i < state.finished.length; i++) {
      const entry = state.finished[i];
      const marble = marbleById.get(entry.marbleId);
      const slot = state.board.slots[entry.slot];
      const x = marble?.x ?? (slot ? (slot.x0 + slot.x1) * 0.5 : state.board.worldW * 0.5);
      const y = marble?.y ?? state.board.worldH - state.board.slotH * 0.42;
      slotRipples.push({
        x,
        y,
        startMs: nowMs,
        durationMs: 280,
        radiusFrom: 10,
        radiusTo: 54,
        color: [69, 243, 195],
      });
      if (slotRipples.length > 48) slotRipples.splice(0, slotRipples.length - 48);
    }
    seenFinishedCount = state.finished.length;
  }

  function spawnImpactFx(x: number, y: number, nowMs: number, intensity = 1): void {
    const neonPalette: Array<[number, number, number]> = [
      [0, 255, 255],   // cyan
      [255, 0, 170],   // magenta
      [123, 255, 84],  // lime
    ];
    const baseIndex = Math.abs(Math.floor(x * 0.017 + y * 0.013 + nowMs * 0.0009)) % neonPalette.length;
    const ringColor = neonPalette[baseIndex];
    const particleColor = neonPalette[(baseIndex + 1) % neonPalette.length];

    impactRings.push({
      x,
      y,
      startMs: nowMs,
      durationMs: 190,
      radiusFrom: 8,
      radiusTo: 42,
      color: ringColor,
    });
    if (intensity >= 0.72) {
      impactRings.push({
        x,
        y,
        startMs: nowMs,
        durationMs: 160,
        radiusFrom: 3,
        radiusTo: 20,
        color: particleColor,
      });
    }
    if (impactRings.length > 90) impactRings.splice(0, impactRings.length - 90);

    const particleCount = intensity >= 0.72 ? 6 : 3;
    for (let i = 0; i < particleCount; i++) {
      const angle = ((i + 1) * Math.PI * 0.5) + ((x * 0.013 + y * 0.021 + nowMs * 0.0027) % (Math.PI * 2));
      const speed = 92 + i * 28;
      impactParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        startMs: nowMs,
        durationMs: 220,
        color: particleColor,
      });
    }
    const particleCap = intensity >= 0.72 ? 220 : 140;
    if (impactParticles.length > particleCap) impactParticles.splice(0, impactParticles.length - particleCap);
  }

  function drawTrailFx(nowMs: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const trail of trailsByMarble.values()) {
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const age = nowMs - p.atMs;
        const life = 1 - clamp(age / 420, 0, 1);
        if (life <= 0.02) continue;
        const t = (i + 1) / Math.max(1, trail.length);
        const alpha = (0.05 + 0.20 * t) * life;
        const radius = 2.8 + 2.8 * t;
        ctx.fillStyle = `rgba(196,245,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRingFx(list: RingFx[], nowMs: number, lineWidth = 2, baseAlpha = 0.36): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = list.length - 1; i >= 0; i--) {
      const fx = list[i];
      const progress = clamp((nowMs - fx.startMs) / fx.durationMs, 0, 1);
      if (progress >= 1) {
        list.splice(i, 1);
        continue;
      }
      const eased = 1 - (1 - progress) * (1 - progress);
      const radius = lerp(fx.radiusFrom, fx.radiusTo, eased);
      const alpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = `rgba(${fx.color[0]},${fx.color[1]},${fx.color[2]},${(baseAlpha * alpha).toFixed(3)})`;
      ctx.lineWidth = lineWidth * (1 + (1 - progress) * 0.25);
      ctx.shadowColor = `rgba(${fx.color[0]},${fx.color[1]},${fx.color[2]},${(0.55 * alpha).toFixed(3)})`;
      ctx.shadowBlur = 12 + (1 - progress) * 10;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticleFx(nowMs: number): void {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = impactParticles.length - 1; i >= 0; i--) {
      const fx = impactParticles[i];
      const progress = clamp((nowMs - fx.startMs) / fx.durationMs, 0, 1);
      if (progress >= 1) {
        impactParticles.splice(i, 1);
        continue;
      }
      const tSec = (nowMs - fx.startMs) / 1000;
      const x = fx.x + fx.vx * tSec;
      const y = fx.y + fx.vy * tSec + 34 * tSec * tSec;
      const alpha = Math.max(0, 1 - progress);
      const size = 1.7 + (1 - progress) * 2.8;
      ctx.shadowColor = `rgba(${fx.color[0]},${fx.color[1]},${fx.color[2]},${(0.72 * alpha).toFixed(3)})`;
      ctx.shadowBlur = 10 + (1 - progress) * 8;
      ctx.fillStyle = `rgba(${fx.color[0]},${fx.color[1]},${fx.color[2]},${(0.84 * alpha).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawLastFewHighlight(state: GameState, nowMs: number): void {
    if (state.mode !== "playing" || state.winner) return;
    const remaining = Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length);
    if (remaining <= 0 || remaining > 3) return;

    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 220);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const m of state.marbles) {
      if (m.done) continue;
      ctx.shadowColor = `rgba(255,176,0,${(0.35 + pulse * 0.22).toFixed(3)})`;
      ctx.shadowBlur = 16 + pulse * 8;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = `rgba(255,210,130,${(0.32 + pulse * 0.34).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r + 7 + pulse * 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(state: GameState, ballsCatalog: BallCatalogItem[], imagesById: Map<string, HTMLImageElement>): void {
    ensureCatalogLookup(ballsCatalog);
    drawBoardBase(state.t || 0);
    const nowMs = performance.now();
    if (state.mode !== "playing" && !state.marbles.length && !state.finished.length) {
      clearRenderFxState();
    }
    trackSlotRipples(state, nowMs);
    trackMarbleTrailsAndImpacts(state, nowMs);

    // Shared FX time for hue cycling (keeps animating even when game is paused).
    const fxT = ((nowMs - bootMs) / 1000) + (state.t || 0);

    // Camera:
    // - manual: minimap / view lock can set cameraOverrideY (works even before starting).
    // - auto: in-play, follow the "tail" (smallest y among not-finished marbles).
    if (typeof view.cameraOverrideY === "number") {
      view.cameraY = clamp(view.cameraOverrideY, 0, Math.max(0, board.worldH - view.viewHWorld));
    } else if (state.mode === "playing" && state.released) {
      let targetY = 0;
      let found = false;
      for (const m of state.marbles) {
        if (m.done) continue;
        if (!found || m.y < targetY) {
          targetY = m.y;
          found = true;
        }
      }
      if (!found) targetY = board.worldH;
      const desired = clamp(targetY - view.viewHWorld * 0.22, 0, Math.max(0, board.worldH - view.viewHWorld));
      // Smooth motion to reduce jitter when the tail bounces.
      view.cameraY = view.cameraY + (desired - view.cameraY) * 0.14;
    } else {
      view.cameraY = 0;
    }

    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(view.scale, view.scale);
    ctx.translate(0, -view.cameraY);

    // Board frame.
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(ctx, 8, 8, board.worldW - 16, board.worldH - 16, 26);
    ctx.fill();
    ctx.restore();

    // Chrome rim + inner glass.
    roundRect(ctx, 10, 10, board.worldW - 20, board.worldH - 20, 26);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(69,243,195,0.18)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fill();

    const fixedEntities: FixedEntity[] | null = board.roulette?.entities?.length
      ? board.roulette.entities
      : board.zigzag?.entities?.length
        ? board.zigzag.entities
        : null;

    // Fixed map polylines (walls / dividers).
    if (fixedEntities) {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const e of fixedEntities) {
        if (e.type === "polyline" && Array.isArray(e.points) && e.points.length >= 2) {
          const y0e = e.points[0][1];
          const y1e = e.points[e.points.length - 1][1];
          if (Math.max(y0e, y1e) < view.cameraY - 200 || Math.min(y0e, y1e) > view.cameraY + view.viewHWorld + 200) {
            continue;
          }
          // Outer rubber.
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = 10;
          ctx.lineWidth = 11;
          ctx.strokeStyle = "rgba(0,0,0,0.42)";
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();

          // Neon rail: animated RGB sign gradient.
          const x0 = e.points[0][0];
          const y0 = e.points[0][1];
          const x1 = e.points[e.points.length - 1][0];
          const y1 = e.points[e.points.length - 1][1];
          const hOff = (hashStr(e.id) % 360) | 0;
          const h0 = (fxT * 42 + hOff) % 360;
          const h1 = (h0 + 120) % 360;
          const h2 = (h0 + 240) % 360;
          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          grad.addColorStop(0, `hsla(${h0}, 100%, 64%, 0.70)`);
          grad.addColorStop(0.5, `hsla(${h1}, 100%, 64%, 0.70)`);
          grad.addColorStop(1, `hsla(${h2}, 100%, 64%, 0.70)`);

          ctx.shadowColor = `hsla(${h0}, 100%, 62%, 0.95)`;
          ctx.shadowBlur = 24;
          ctx.lineWidth = 7.5;
          ctx.strokeStyle = grad;
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();

          // Hot highlight for that "pinball rail" punch.
          ctx.shadowColor = `hsla(${h1}, 100%, 70%, 0.55)`;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 3.2;
          ctx.strokeStyle = "rgba(255,255,255,0.78)";
          ctx.beginPath();
          ctx.moveTo(e.points[0][0], e.points[0][1]);
          for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i][0], e.points[i][1]);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Static boxes (cyan obstacles) like the reference.
      ctx.save();
      ctx.strokeStyle = "rgba(0, 255, 255, 0.70)";
      ctx.lineWidth = 4;
      for (const e of fixedEntities) {
        if (e.type !== "box") continue;
        if (e.y < view.cameraY - 240 || e.y > view.cameraY + view.viewHWorld + 240) continue;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.rot || 0);
        ctx.strokeRect(-e.w / 2, -e.h / 2, e.w, e.h);
        ctx.restore();
      }
      ctx.restore();
    }

    // Zigzag propellers.
    if (board.zigzag?.propellers?.length) {
      ctx.save();
      ctx.lineCap = "round";
      for (const p of board.zigzag.propellers) {
        if (p.y < view.cameraY - 260 || p.y > view.cameraY + view.viewHWorld + 260) continue;
        const ang = (p.phase || 0) + (p.omega || 0) * state.t;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const hx = (p.len / 2) * c;
        const hy = (p.len / 2) * s;
        // Rubber + highlight.
        ctx.shadowColor = "rgba(255,176,0,0.45)";
        ctx.shadowBlur = 14;
        ctx.lineWidth = 14;
        ctx.strokeStyle = "rgba(0,0,0,0.42)";
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(255, 176, 0, 0.88)";
        ctx.beginPath();
        ctx.moveTo(p.x - hx, p.y - hy);
        ctx.lineTo(p.x + hx, p.y + hy);
        ctx.stroke();

        // Hub.
        ctx.shadowBlur = 0;
        const hg = ctx.createRadialGradient(p.x - 4, p.y - 6, 2, p.x, p.y, 18);
        hg.addColorStop(0, "rgba(255,255,255,0.35)");
        hg.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Zigzag circular rotors (early section).
    if (board.zigzag?.rotors?.length) {
      ctx.save();
      ctx.lineWidth = 4;
      for (const r of board.zigzag.rotors) {
        if (r.y < view.cameraY - 260 || r.y > view.cameraY + view.viewHWorld + 260) continue;
        ctx.strokeStyle = "rgba(255, 176, 0, 0.70)";
        ctx.fillStyle = "rgba(255, 176, 0, 0.08)";
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Variable-width corridor walls.
    if (board.corridor) {
      const y0v = clamp(view.cameraY - 60, 0, board.worldH);
      const y1v = clamp(view.cameraY + view.viewHWorld + 60, 0, board.worldH);
      const stepY = Math.max(30, board.pegGapY * 0.8);

      // Shade "outside" area to make the corridor obvious.
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      // left outside
      ctx.moveTo(0, y0v);
      for (let y = y0v; y <= y1v; y += stepY) {
        const { left } = corridorAt(board, y);
        ctx.lineTo(left, y);
      }
      ctx.lineTo(corridorAt(board, y1v).left, y1v);
      ctx.lineTo(0, y1v);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      // right outside
      ctx.moveTo(board.worldW, y0v);
      for (let y = y0v; y <= y1v; y += stepY) {
        const { right } = corridorAt(board, y);
        ctx.lineTo(right, y);
      }
      ctx.lineTo(corridorAt(board, y1v).right, y1v);
      ctx.lineTo(board.worldW, y1v);
      ctx.closePath();
      ctx.fill();

      // Wall strokes.
      ctx.strokeStyle = "rgba(255,255,255,0.26)";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let first = true;
      for (let y = y0v; y <= y1v; y += stepY) {
        const { left } = corridorAt(board, y);
        if (first) {
          ctx.moveTo(left, y);
          first = false;
        } else {
          ctx.lineTo(left, y);
        }
      }
      ctx.lineTo(corridorAt(board, y1v).left, y1v);
      ctx.stroke();

      ctx.beginPath();
      first = true;
      for (let y = y0v; y <= y1v; y += stepY) {
        const { right } = corridorAt(board, y);
        if (first) {
          ctx.moveTo(right, y);
          first = false;
        } else {
          ctx.lineTo(right, y);
        }
      }
      ctx.lineTo(corridorAt(board, y1v).right, y1v);
      ctx.stroke();
    }

    // Slot visuals removed: we only show the final (last) result via UI/modal.

    // Pegs.
    if (board.pegRows && board.pegRows.length) {
      const yMin = view.cameraY - 60;
      const yMax = view.cameraY + view.viewHWorld + 60;
      const r0 = clampInt(Math.floor((yMin - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
      const r1 = clampInt(Math.ceil((yMax - board.topPad) / board.pegGapY), 0, board.pegRows.length - 1);
      for (let rr = r0; rr <= r1; rr++) {
        const row = board.pegRows[rr];
        for (const p of row) {
          // Bumper: chrome rim + neon core.
          const r = p.r;
          ctx.shadowColor = "rgba(69,243,195,0.25)";
          ctx.shadowBlur = 10;
          const rim = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.35, 1, p.x, p.y, r * 1.4);
          rim.addColorStop(0, "rgba(255,255,255,0.80)");
          rim.addColorStop(1, "rgba(0,0,0,0.55)");
          ctx.fillStyle = rim;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2);
          ctx.fill();

          const core = ctx.createRadialGradient(p.x - r * 0.2, p.y - r * 0.2, 2, p.x, p.y, r);
          core.addColorStop(0, "rgba(255,255,255,0.20)");
          core.addColorStop(1, "rgba(69,243,195,0.18)");
          ctx.fillStyle = core;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Drop guide removed (no click-to-set drop position).

    // FX (behind marbles): trail + slot arrival ripple.
    drawTrailFx(nowMs);
    drawRingFx(slotRipples, nowMs, 2.2, 0.38);

    // Marbles (pending + active).
    let activeCount = 0;
    for (const marble of state.marbles) {
      if (!marble.done) activeCount += 1;
    }
    const drawNameLabels = activeCount <= 40;

    for (const m of [...state.pending, ...state.marbles]) {
      // Hide finished marbles to avoid clutter when 100+ arrive.
      if (m.done) continue;
      const meta = catalogById.get(m.ballId);
      const img = imagesById.get(m.ballId);
      const r = m.r;

      ctx.save();
      ctx.translate(m.x, m.y);

      // Outer rim.
      const rim = ctx.createRadialGradient(-r * 0.2, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
      rim.addColorStop(0, "rgba(255,255,255,0.90)");
      rim.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
      ctx.fill();

      // Face.
      ctx.fillStyle = meta?.tint || "rgba(255,255,255,0.10)";
      ctx.beginPath();
      ctx.arc(0, 0, r + 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      const avatarKind = avatarKindById.get(m.ballId) ?? "unknown";
      const avatarOffset = getAvatarImageOffset(avatarKind, r);
      if (img && img.complete) {
        ctx.drawImage(img, -r - avatarOffset.x, -r + avatarOffset.y, r * 2, r * 2);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(-r, -r, r * 2, r * 2);
      }
      ctx.restore();

      // Glint.
      const gl = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, -r * 0.35, -r * 0.35, r * 1.1);
      gl.addColorStop(0, "rgba(255,255,255,0.65)");
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
      ctx.fill();

      // Name label above the ball (during play).
      if (drawNameLabels && state.mode === "playing" && meta?.name) {
        const txt = String(meta.name);
        const fontSize = clamp(r * 0.72, 11, 16);
        ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const padX = 10;
        const padY = 6;
        const measureKey = `${fontSize}|${txt}`;
        let tw = labelWidthByKey.get(measureKey);
        if (typeof tw !== "number") {
          tw = ctx.measureText(txt).width;
          if (labelWidthByKey.size > 640) labelWidthByKey.clear();
          labelWidthByKey.set(measureKey, tw);
        }
        const w = Math.max(44, tw + padX * 2);
        const h = fontSize + padY * 2;
        const y = -r - h * 0.9;

        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "rgba(0,0,0,0.38)";
        roundRect(ctx, -w / 2, y - h / 2, w, h, Math.min(12, h / 2));
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(txt, 0, y + 0.5);
      }

      ctx.restore();
    }

    // FX (above marbles): impact pulses/particles + last few candidate highlight.
    drawRingFx(impactRings, nowMs, 2.9, 0.72);
    drawParticleFx(nowMs);
    drawLastFewHighlight(state, nowMs);

    ctx.restore();
  }

  return {
    ctx,
    resizeToFit,
    draw,
    screenToWorld,
    worldToScreen,
    getViewState: (): RendererViewState => ({
      scale: view.scale,
      cameraY: view.cameraY,
      viewHWorld: view.viewHWorld,
      cameraOverrideY: view.cameraOverrideY
    }),
    setCameraOverrideY: (y: number | null | undefined): void => {
      view.cameraOverrideY = typeof y === "number" && Number.isFinite(y) ? y : null;
    },
    clearCameraOverride: (): void => {
      view.cameraOverrideY = null;
    }
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}
function clampInt(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v | 0));
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number): void {
  const len = 20;
  const head = 6;
  ctx.beginPath();
  ctx.moveTo(x - (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir, y);
  ctx.moveTo(x + (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir - head * dir, y - head);
  ctx.moveTo(x + (len / 2) * dir, y);
  ctx.lineTo(x + (len / 2) * dir - head * dir, y + head);
  ctx.stroke();
}

function corridorAt(board: Board, y: number): SpawnBounds {
  const c = board.corridor;
  if (!c) return { left: 0, right: board.worldW };
  const cx = c.worldW / 2;
  const t = clamp((y - c.startY) / (c.endY - c.startY), 0, 1);
  const u = smoothstep(t);
  const hw = lerp(c.wideHalf, c.narrowHalf, u);
  return { left: clamp(cx - hw, 0, board.worldW), right: clamp(cx + hw, 0, board.worldW) };
}

function smoothstep(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
