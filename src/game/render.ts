import type { BallCatalogItem, Board, FixedEntity, GameState, SpawnBounds } from "./engine.ts";
import { resolveFinishTriggerRemaining } from "./finish-tension.ts";
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
  setStartCaption: (value: string) => void;
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

type CaptionLayout = {
  text: string;
  lines: string[];
  width: number;
  height: number;
  maxTextWidth: number;
};

type RenderQualityLevel = "high" | "medium" | "low";

type RenderQualityProfile = {
  level: RenderQualityLevel;
  pixelRatioFloor: number;
  pixelRatioCap: number;
  showAnimatedHaze: boolean;
  showGridOverlay: boolean;
  showTrail: boolean;
  showParticles: boolean;
  detailedPegs: boolean;
  detailedMarbleShell: boolean;
  nameLabelMaxActive: number;
  gridAlphaBase: number;
};

type FinishCinematicFrame = {
  active: boolean;
  leaderY: number;
  leaderProgress: number;
  remaining: number;
  zoom: number;
  pulse: number;
  shakeYOffset: number;
};

type FinishCinematicState = {
  active: boolean;
  enteredAtMs: number;
  impactAtMs: number;
  settleUntilMs: number;
  exitHoldUntilMs: number;
};

const RENDER_QUALITY_PROFILES: Record<RenderQualityLevel, RenderQualityProfile> = {
  high: {
    level: "high",
    pixelRatioFloor: 1,
    pixelRatioCap: 1.45,
    showAnimatedHaze: true,
    showGridOverlay: true,
    showTrail: false,
    showParticles: false,
    detailedPegs: true,
    detailedMarbleShell: true,
    nameLabelMaxActive: 40,
    gridAlphaBase: 0.45,
  },
  medium: {
    level: "medium",
    pixelRatioFloor: 0.85,
    pixelRatioCap: 1.08,
    showAnimatedHaze: true,
    showGridOverlay: true,
    showTrail: false,
    showParticles: false,
    detailedPegs: false,
    detailedMarbleShell: false,
    nameLabelMaxActive: 24,
    gridAlphaBase: 0.3,
  },
  low: {
    level: "low",
    pixelRatioFloor: 0.72,
    pixelRatioCap: 0.9,
    showAnimatedHaze: false,
    showGridOverlay: false,
    showTrail: false,
    showParticles: false,
    detailedPegs: false,
    detailedMarbleShell: false,
    nameLabelMaxActive: 0,
    gridAlphaBase: 0,
  },
};

const IMPACT_RING_CAP_BY_QUALITY: Record<RenderQualityLevel, number> = {
  high: 48,
  medium: 32,
  low: 20,
};

const FINISH_CINEMA_TRIGGER_Y_FRAC = 0.82;
const FINISH_CINEMA_ZOOM_IN_MS = 760;
const FINISH_CINEMA_ZOOM_MIN = 1.15;
const FINISH_CINEMA_ZOOM_MAX = 1.2;
const FINISH_CINEMA_SETTLE_MS = 130;
const FINISH_CINEMA_EXIT_HOLD_MS = 320;

function pickRenderQualityProfile(cssW: number, cssH: number): RenderQualityProfile {
  const area = Math.max(1, cssW * cssH);
  if (area >= 2_100_000) return RENDER_QUALITY_PROFILES.low;
  if (area >= 1_350_000) return RENDER_QUALITY_PROFILES.medium;
  return RENDER_QUALITY_PROFILES.high;
}

function isLowPowerViewport(): boolean {
  if (typeof window === "undefined") return false;
  const mediaQuery = window.matchMedia?.("(pointer: coarse)");
  if (mediaQuery?.matches) return true;
  return false;
}

function getFixedEntities(board: Board): FixedEntity[] | null {
  if (board.roulette?.entities?.length) return board.roulette.entities;
  if (board.zigzag?.entities?.length) return board.zigzag.entities;
  return null;
}

function sanitizeCaptionValue(value: string, maxLength = 28): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

export function makeRenderer(canvas: HTMLCanvasElement, { board }: { board: Board }): Renderer {
  const context = canvas.getContext("2d", { alpha: false });
  if (!(context instanceof CanvasRenderingContext2D)) throw new Error("2D context not available");
  const ctx: CanvasRenderingContext2D = context;

  const dpr = (): number => Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const bootMs = performance.now();
  let renderCssW = canvas.clientWidth || canvas.parentElement?.clientWidth || board.worldW;
  let renderCssH = canvas.clientHeight || canvas.parentElement?.clientHeight || board.worldH;
  let renderPixelRatio = 1;
  let baseScale = 1;
  let renderQuality = pickRenderQualityProfile(renderCssW, renderCssH);
  let lowPowerViewport = isLowPowerViewport();
  if (lowPowerViewport && renderQuality.level === "high") {
    renderQuality = RENDER_QUALITY_PROFILES.medium;
  }
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
  const finishCinematic: FinishCinematicState = {
    active: false,
    enteredAtMs: 0,
    impactAtMs: 0,
    settleUntilMs: 0,
    exitHoldUntilMs: 0,
  };
  let seenFinishedCount = 0;
  let lastCatalogRef: BallCatalogItem[] | null = null;
  let startCaption = "";
  let startCaptionLayout: CaptionLayout | null = null;

  function clearRenderFxState() {
    trailsByMarble.clear();
    motionByMarble.clear();
    labelWidthByKey.clear();
    impactRings.length = 0;
    impactParticles.length = 0;
    slotRipples.length = 0;
    finishCinematic.active = false;
    finishCinematic.enteredAtMs = 0;
    finishCinematic.impactAtMs = 0;
    finishCinematic.settleUntilMs = 0;
    finishCinematic.exitHoldUntilMs = 0;
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
    renderCssW = cssW;
    renderCssH = cssH;
    renderQuality = pickRenderQualityProfile(cssW, cssH);
    lowPowerViewport = isLowPowerViewport();
    if (lowPowerViewport && renderQuality.level === "high") {
      renderQuality = RENDER_QUALITY_PROFILES.medium;
    }
    // For tall boards, fit width and use a scrolling camera for Y.
    const s = Math.min(cssW / board.worldW, 1.6);
    baseScale = s;
    view.scale = s;
    view.ox = (cssW - board.worldW * s) / 2;
    view.oy = 0;
    view.viewHWorld = cssH / s;

    const nativeDpr = dpr();
    const capped = Math.min(nativeDpr, renderQuality.pixelRatioCap);
    const floored = Math.max(renderQuality.pixelRatioFloor, capped);
    renderPixelRatio = floored;
    const r = renderPixelRatio;
    canvas.width = Math.max(1, Math.floor(cssW * r));
    canvas.height = Math.max(1, Math.floor(cssH * r));
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
    const cssW = renderCssW || board.worldW;
    const cssH = renderCssH || board.worldH;
    ensureBgCache(cssW, cssH);

    ctx.clearRect(0, 0, cssW, cssH);
    if (bgCache.base) ctx.drawImage(bgCache.base, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";

    // Animated neon haze (2 gradients only).
    if (renderQuality.showAnimatedHaze) {
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
    if (renderQuality.showGridOverlay && bgCache.gridPattern) {
      const dx = -(tt * 22) % 128;
      const dy = (tt * 34) % 128;
      ctx.save();
      ctx.globalAlpha = renderQuality.gridAlphaBase + 0.1 * Math.sin(tt * 0.6);
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
    const enableTrail = renderQuality.showTrail;
    if (!enableTrail && trailsByMarble.size) trailsByMarble.clear();
    const heavyLoad = activeCount > 56 || renderQuality.level !== "high";
    let trailMaxPoints = 6;
    if (activeCount > 60) trailMaxPoints = 4;
    if (renderQuality.level === "medium") trailMaxPoints = Math.min(trailMaxPoints, 4);
    if (renderQuality.level === "low") trailMaxPoints = Math.min(trailMaxPoints, 3);
    const impactCooldownMs = heavyLoad ? 140 : 95;
    const impactDotThreshold = heavyLoad ? 0.34 : 0.52;
    const impactDeltaVThreshold = heavyLoad ? 320 : 220;
    let impactIntensityScale = 1;
    if (renderQuality.level === "medium") impactIntensityScale = 0.8;
    if (renderQuality.level === "low") impactIntensityScale = 0.62;

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
            spawnImpactFx(m.x, m.y, nowMs, (heavyLoad ? 0.55 : 1) * impactIntensityScale);
            prev.lastImpactMs = nowMs;
          }
        }
      }
      motionByMarble.set(m.id, {
        vx: m.vx,
        vy: m.vy,
        lastImpactMs: prev?.lastImpactMs || 0,
      });

      if (enableTrail) {
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
    }

    for (const key of motionByMarble.keys()) {
      if (!liveIds.has(key)) motionByMarble.delete(key);
    }
    if (enableTrail) {
      for (const key of trailsByMarble.keys()) {
        if (!liveIds.has(key)) trailsByMarble.delete(key);
      }
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
    const strength = clamp(intensity, 0.4, 1);

    impactRings.push({
      x,
      y,
      startMs: nowMs,
      durationMs: lerp(130, 170, strength),
      radiusFrom: lerp(6, 9, strength),
      radiusTo: lerp(24, 32, strength),
      color: ringColor,
    });
    const ringCap = IMPACT_RING_CAP_BY_QUALITY[renderQuality.level];
    if (impactRings.length > ringCap) impactRings.splice(0, impactRings.length - ringCap);
  }

  function drawTrailFx(nowMs: number): void {
    if (!renderQuality.showTrail) return;
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
      ctx.lineWidth = lineWidth * (1 + (1 - progress) * 0.18);
      ctx.shadowColor = `rgba(${fx.color[0]},${fx.color[1]},${fx.color[2]},${(0.55 * alpha).toFixed(3)})`;
      ctx.shadowBlur = 6 + (1 - progress) * 4;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticleFx(nowMs: number): void {
    if (!renderQuality.showParticles) {
      if (impactParticles.length) impactParticles.length = 0;
      return;
    }
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

  function trimLineToWidth(line: string, maxWidth: number): string {
    const glyphs = Array.from(line);
    let next = line;
    while (next.length && ctx.measureText(`${next}…`).width > maxWidth) {
      glyphs.pop();
      next = glyphs.join("");
    }
    return next ? `${next}…` : "…";
  }

  function getCaptionBoundsAtY(y: number): { left: number; right: number } {
    if (board.layout === "zigzag" && typeof board.zigzag?.spawnBoundsAtY === "function") {
      const bounds = board.zigzag.spawnBoundsAtY(y);
      return { left: bounds.left, right: bounds.right };
    }
    if (board.layout === "roulette" && typeof board.roulette?.spawnBoundsAtY === "function") {
      const bounds = board.roulette.spawnBoundsAtY(y);
      return { left: bounds.left, right: bounds.right };
    }
    if (board.corridor) {
      const bounds = corridorAt(board, y);
      return { left: bounds.left, right: bounds.right };
    }
    return { left: 16, right: board.worldW - 16 };
  }

  function buildStartCaptionLayout(text: string, maxTextWidth: number): CaptionLayout {
    const fontSize = 42;
    const lineHeight = 48;
    ctx.save();
    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

    const glyphs = Array.from(text);
    const lines: string[] = [];
    let current = "";
    let consumed = 0;
    for (const glyph of glyphs) {
      const candidate = `${current}${glyph}`;
      if (current && ctx.measureText(candidate).width > maxTextWidth) {
        lines.push(current);
        current = glyph;
        if (lines.length >= 2) break;
      } else {
        current = candidate;
      }
      consumed += 1;
    }
    if (lines.length < 2 && current) {
      lines.push(current);
    }
    while (lines.length < 1) lines.push("");

    if (consumed < glyphs.length) {
      const lastIndex = lines.length - 1;
      lines[lastIndex] = trimLineToWidth(lines[lastIndex], maxTextWidth);
    }

    let width = 0;
    for (const line of lines) {
      width = Math.max(width, ctx.measureText(line).width);
    }
    ctx.restore();

    return {
      text,
      lines,
      width: Math.ceil(Math.min(maxTextWidth, width)),
      height: lineHeight * lines.length,
      maxTextWidth,
    };
  }

  function getLayoutSpawnY(): number {
    if (board.layout === "zigzag" && typeof board.zigzag?.spawnY === "number") return board.zigzag.spawnY;
    if (board.layout === "roulette" && typeof board.roulette?.spawnY === "number") return board.roulette.spawnY;
    return 70;
  }

  function drawStartCaption(state: GameState): void {
    const text = startCaption;
    if (!text) return;

    const spawnY = getLayoutSpawnY();
    const anchorY = spawnY + 58;
    const bounds = getCaptionBoundsAtY(anchorY);
    const safeInset = 12;
    const safeLeft = bounds.left + safeInset;
    const safeRight = bounds.right - safeInset;
    const availableWidth = Math.max(140, safeRight - safeLeft);
    const maxTextWidth = Math.max(110, availableWidth - 34);

    if (
      !startCaptionLayout ||
      startCaptionLayout.text !== text ||
      Math.abs(startCaptionLayout.maxTextWidth - maxTextWidth) > 0.5
    ) {
      startCaptionLayout = buildStartCaptionLayout(text, maxTextWidth);
    }
    const layout = startCaptionLayout;
    if (!layout) return;

    const rawBubbleWidth = Math.max(180, layout.width + 34);
    const bubbleWidth = clamp(rawBubbleWidth, 120, availableWidth);
    const bubbleHeight = layout.height + 22;
    const anchorX = Number.isFinite(state.dropX) ? state.dropX : board.worldW * 0.5;
    const clampedAnchorX = clamp(anchorX, safeLeft + bubbleWidth / 2, safeRight - bubbleWidth / 2);
    const bubbleY = clamp(anchorY, 22 + bubbleHeight * 0.5, board.worldH - 22 - bubbleHeight * 0.5);
    const bubbleX = clampedAnchorX - bubbleWidth / 2;

    ctx.save();
    ctx.font = "900 42px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "rgba(4, 10, 22, 0.66)";
    ctx.strokeStyle = "rgba(68, 255, 233, 0.76)";
    ctx.shadowColor = "rgba(68,255,233,0.55)";
    ctx.shadowBlur = 24;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bubbleX, bubbleY - bubbleHeight / 2, bubbleWidth, bubbleHeight, 16);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(172,255,244,0.98)";
    ctx.shadowColor = "rgba(68,255,233,0.9)";
    ctx.shadowBlur = 18;
    const lineHeight = 48;
    const textStartY = bubbleY - ((layout.lines.length - 1) * lineHeight) / 2;
    for (let index = 0; index < layout.lines.length; index++) {
      ctx.fillText(layout.lines[index], bubbleX + bubbleWidth / 2, textStartY + index * lineHeight);
    }
    ctx.restore();
  }

  function resetFinishCinematicState(): void {
    finishCinematic.active = false;
    finishCinematic.enteredAtMs = 0;
    finishCinematic.impactAtMs = 0;
    finishCinematic.settleUntilMs = 0;
    finishCinematic.exitHoldUntilMs = 0;
  }

  function updateFinishCinematic(state: GameState, nowMs: number): FinishCinematicFrame {
    const inactiveFrame: FinishCinematicFrame = {
      active: false,
      leaderY: Number.NEGATIVE_INFINITY,
      leaderProgress: 0,
      remaining: 0,
      zoom: 1,
      pulse: 0,
      shakeYOffset: 0,
    };

    if (state.mode !== "playing" || !state.released) {
      resetFinishCinematicState();
      return inactiveFrame;
    }

    const remaining = Math.max(0, (Number(state.totalToDrop) || 0) - state.finished.length);
    let leaderY = Number.NEGATIVE_INFINITY;
    for (const marble of state.marbles) {
      if (marble.done) continue;
      if (marble.y > leaderY) leaderY = marble.y;
    }

    if (!Number.isFinite(leaderY)) {
      if (!state.winner) resetFinishCinematicState();
      return inactiveFrame;
    }

    const triggerY = board.worldH * FINISH_CINEMA_TRIGGER_Y_FRAC;
    const leaderProgress = clamp(
      (leaderY - triggerY) / Math.max(1, board.worldH - triggerY),
      0,
      1
    );
    const shouldActivate =
      !state.winner &&
      remaining > 0 &&
      remaining <= resolveFinishTriggerRemaining(state.finishTriggerRemaining, state.totalToDrop) &&
      leaderY > triggerY;

    if (shouldActivate && !finishCinematic.active) {
      finishCinematic.active = true;
      finishCinematic.enteredAtMs = nowMs;
      finishCinematic.impactAtMs = 0;
      finishCinematic.settleUntilMs = 0;
      finishCinematic.exitHoldUntilMs = 0;
    }

    if (!shouldActivate && !state.winner) {
      resetFinishCinematicState();
      return inactiveFrame;
    }

    if (state.winner && finishCinematic.active && finishCinematic.impactAtMs <= 0) {
      finishCinematic.impactAtMs = nowMs;
      finishCinematic.settleUntilMs = nowMs + FINISH_CINEMA_SETTLE_MS;
      finishCinematic.exitHoldUntilMs = nowMs + FINISH_CINEMA_EXIT_HOLD_MS;
    }

    if (state.winner && finishCinematic.active && nowMs > finishCinematic.exitHoldUntilMs) {
      resetFinishCinematicState();
      return inactiveFrame;
    }

    if (!finishCinematic.active) return inactiveFrame;

    const elapsed = Math.max(0, nowMs - finishCinematic.enteredAtMs);
    const introT = clamp(elapsed / FINISH_CINEMA_ZOOM_IN_MS, 0, 1);
    const zoomTarget = lerp(FINISH_CINEMA_ZOOM_MIN, FINISH_CINEMA_ZOOM_MAX, leaderProgress);
    let zoom = lerp(1, zoomTarget, easeOutCubic(introT));
    const pulse = 0.5 + 0.5 * Math.sin(nowMs / 240);

    let shakeYOffset = 0;
    if (finishCinematic.impactAtMs > 0 && nowMs < finishCinematic.settleUntilMs) {
      const settleProgress = clamp(
        (nowMs - finishCinematic.impactAtMs) / Math.max(1, FINISH_CINEMA_SETTLE_MS),
        0,
        1
      );
      const shake = Math.sin(settleProgress * Math.PI * 4) * (1 - settleProgress);
      shakeYOffset = shake * 9;
      zoom += (1 - settleProgress) * 0.015;
    }

    return {
      active: true,
      leaderY,
      leaderProgress,
      remaining,
      zoom,
      pulse,
      shakeYOffset,
    };
  }

  function drawFinishCinematicOverlay(fx: FinishCinematicFrame): void {
    if (!fx.active) return;

    const cssW = renderCssW || board.worldW;
    const cssH = renderCssH || board.worldH;
    const centerX = cssW * 0.5;
    const centerY = cssH * 0.58;
    const vignetteAlpha = 0.22 + fx.leaderProgress * 0.18;
    const pulseBoost = 0.08 + fx.pulse * 0.12;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(0, 0, cssW, cssH);

    const vignette = ctx.createRadialGradient(
      centerX,
      centerY,
      Math.min(cssW, cssH) * 0.16,
      centerX,
      centerY,
      Math.max(cssW, cssH) * 0.78
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${vignetteAlpha.toFixed(3)})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.globalCompositeOperation = "screen";
    const ringAlpha = 0.11 + pulseBoost;
    const ringRadius = Math.min(cssW, cssH) * (0.19 + fx.pulse * 0.04);
    ctx.strokeStyle = `rgba(255,120,120,${ringAlpha.toFixed(3)})`;
    ctx.shadowColor = `rgba(255,140,140,${(ringAlpha * 0.8).toFixed(3)})`;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(centerX, cssH * 0.82, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    const hudLineAlpha = 0.16 + fx.leaderProgress * 0.2;
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${(0.04 + hudLineAlpha * 0.18).toFixed(3)})`;
    ctx.fillRect(0, 0, cssW, 18);
    ctx.fillRect(0, cssH - 18, cssW, 18);
    ctx.strokeStyle = `rgba(255,188,148,${hudLineAlpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 18.5);
    ctx.lineTo(cssW, 18.5);
    ctx.moveTo(0, cssH - 18.5);
    ctx.lineTo(cssW, cssH - 18.5);
    ctx.stroke();

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
    const finishFx = updateFinishCinematic(state, nowMs);

    // Shared FX time for hue cycling (keeps animating even when game is paused).
    const fxT = ((nowMs - bootMs) / 1000) + (state.t || 0);
    const zoomFactor = finishFx.active ? finishFx.zoom : 1;
    view.scale = baseScale * zoomFactor;
    view.viewHWorld = renderCssH / Math.max(0.0001, view.scale);

    // Camera:
    // - manual: minimap / view lock can set cameraOverrideY (works even before starting).
    // - auto: in-play, follow the "tail" (smallest y among not-finished marbles).
    if (typeof view.cameraOverrideY === "number") {
      view.cameraY = clamp(view.cameraOverrideY, 0, Math.max(0, board.worldH - view.viewHWorld));
    } else if (finishFx.active) {
      const cameraBias = lerp(0.46, 0.4, finishFx.leaderProgress);
      const desired = clamp(
        finishFx.leaderY - view.viewHWorld * cameraBias + finishFx.shakeYOffset,
        0,
        Math.max(0, board.worldH - view.viewHWorld)
      );
      view.cameraY = view.cameraY + (desired - view.cameraY) * 0.18;
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
    if (renderQuality.level !== "low") {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(ctx, 8, 8, board.worldW - 16, board.worldH - 16, 26);
      ctx.fill();
      ctx.restore();
    }

    // Chrome rim + inner glass.
    roundRect(ctx, 10, 10, board.worldW - 20, board.worldH - 20, 26);
    ctx.lineWidth = renderQuality.level === "low" ? 7 : 10;
    ctx.strokeStyle = "rgba(255,255,255,0.11)";
    ctx.stroke();
    ctx.lineWidth = renderQuality.level === "low" ? 3 : 5;
    ctx.strokeStyle = "rgba(69,243,195,0.16)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.018)";
    ctx.fill();

    const fixedEntities = getFixedEntities(board);

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
          const r = p.r;
          if (renderQuality.detailedPegs) {
            // Bumper: chrome rim + neon core.
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
            continue;
          }

          // Lightweight peg style for wide screens / large render areas.
          ctx.shadowBlur = 0;
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "rgba(170, 240, 255, 0.28)";
          ctx.fillStyle = "rgba(92, 210, 238, 0.16)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Drop guide removed (no click-to-set drop position).
    drawStartCaption(state);

    // FX (behind marbles): trail + slot arrival ripple.
    drawTrailFx(nowMs);
    const slotRippleLineWidth = renderQuality.level === "low" ? 1.5 : 2.2;
    const slotRippleAlpha = renderQuality.level === "low" ? 0.24 : 0.38;
    drawRingFx(slotRipples, nowMs, slotRippleLineWidth, slotRippleAlpha);

    // Marbles (pending + active).
    let activeCount = 0;
    for (const marble of state.marbles) {
      if (!marble.done) activeCount += 1;
    }
    const drawNameLabels =
      renderQuality.nameLabelMaxActive > 0 && activeCount <= renderQuality.nameLabelMaxActive;

    for (const m of [...state.pending, ...state.marbles]) {
      // Hide finished marbles to avoid clutter when 100+ arrive.
      if (m.done) continue;
      const meta = catalogById.get(m.ballId);
      const img = imagesById.get(m.ballId);
      const r = m.r;

      ctx.save();
      ctx.translate(m.x, m.y);

      if (renderQuality.detailedMarbleShell) {
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
      } else {
        // Lightweight shell for performance-sensitive sizes.
        ctx.fillStyle = meta?.tint || "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.arc(0, 0, r + 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.36)";
        ctx.stroke();
      }

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

      if (renderQuality.detailedMarbleShell) {
        // Glint.
        const gl = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 1, -r * 0.35, -r * 0.35, r * 1.1);
        gl.addColorStop(0, "rgba(255,255,255,0.65)");
        gl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
        ctx.fill();
      }

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
    const impactLineWidth = renderQuality.level === "low" ? 1.4 : 1.8;
    const impactAlpha = renderQuality.level === "low" ? 0.34 : 0.42;
    drawRingFx(impactRings, nowMs, impactLineWidth, impactAlpha);
    drawParticleFx(nowMs);
    drawLastFewHighlight(state, nowMs);

    ctx.restore();
    drawFinishCinematicOverlay(finishFx);
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
    },
    setStartCaption: (value: string): void => {
      const next = sanitizeCaptionValue(value, 28);
      startCaption = next;
      startCaptionLayout = null;
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

function easeOutCubic(x: number): number {
  const t = clamp(x, 0, 1);
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
