import {
  makeBoard,
  makeGameState,
  makeRng,
  resetGame,
  snapshotForText,
  startGame,
  step,
  dropAll,
  getBallCount,
  getTotalSelectedCount,
  setBallCount
} from "./game/engine";
import { makeRenderer } from "./game/render";
import { loadBallsCatalog, loadBallCounts, saveBallsCatalog, saveBallCounts } from "./ui/storage.js";
import { mountSettingsDialog } from "./ui/settings.js";
import type { BallCatalogEntry, GameState } from "./game/types";
import type { TextSnapshot } from "./game/engine";

type FracCoord = { xFrac: number; yFrac: number };

type UiRuntimeState = {
  _shownResultId: string | null;
  _shownWinnerT: number | null;
};

type UiGameState = GameState & UiRuntimeState;

type WinnerPayload = {
  name: string;
  img: string;
  order: number;
  total: number;
};

function mustGetEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: #${id}`);
  return el as T;
}

const canvas = mustGetEl<HTMLCanvasElement>("game");
const startBtn = mustGetEl<HTMLButtonElement>("start-btn");
const resetBtn = mustGetEl<HTMLButtonElement>("reset-btn");
const settingsBtn = mustGetEl<HTMLButtonElement>("settings-btn");
const bgmBtn = mustGetEl<HTMLButtonElement>("bgm-btn");
const winnerBtn = mustGetEl<HTMLButtonElement>("winner-btn");
const ballsEl = mustGetEl<HTMLDivElement>("balls");
const resultEl = mustGetEl<HTMLDivElement>("result");
const hintEl = mustGetEl<HTMLDivElement>("hint");
const minimap = mustGetEl<HTMLCanvasElement>("minimap");
const viewLockEl = mustGetEl<HTMLInputElement>("view-lock");
const minimapHintEl = mustGetEl<HTMLDivElement>("minimap-hint");
const canvasCoordReadoutEl = mustGetEl<HTMLDivElement>("canvas-coord-readout");
const canvasCoordCopyBtn = mustGetEl<HTMLButtonElement>("canvas-coord-copy");
const minimapTitleEl = mustGetEl<HTMLDivElement>("minimap-title");

function syncVisualViewportHeight() {
  // Mobile browsers: 100vh often includes dynamic browser chrome; use the visual viewport height instead.
  const vv = window.visualViewport;
  const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--appH", `${Math.round(h)}px`);
}

const settingsDialog = mustGetEl<HTMLDialogElement>("settings-dialog");
const settingsList = mustGetEl<HTMLDivElement>("settings-list");
const restoreDefaultsBtn = mustGetEl<HTMLButtonElement>("restore-defaults");
const addBallBtn = mustGetEl<HTMLButtonElement>("add-ball");

const winnerDialog = mustGetEl<HTMLDialogElement>("winner-dialog");
const winnerImgEl = mustGetEl<HTMLImageElement>("winner-img");
const winnerTitleEl = mustGetEl<HTMLDivElement>("winner-title");
const winnerSubEl = mustGetEl<HTMLDivElement>("winner-sub");
const winnerNameEl = mustGetEl<HTMLDivElement>("winner-name");
const winnerOrderEl = mustGetEl<HTMLDivElement>("winner-order");

// Hand-tuned extra rotors can be added here (world coords or xFrac/yFrac in [0..1]).
// These override the auto-added mid-section rotors (the early rotor ring stays).
const customRotors: Array<{ xFrac: number; yFrac: number; omega: number }> = [
  { xFrac: 0.220, yFrac: 0.629, omega: 11.2 },
  { xFrac: 0.342, yFrac: 0.629, omega: -11.2 },
  { xFrac: 0.140, yFrac: 0.722, omega: 11.8 },
  { xFrac: 0.136, yFrac: 0.713, omega: -11.8 },
  { xFrac: 0.869, yFrac: 0.713, omega: 12.4 },
  { xFrac: 0.447, yFrac: 0.227, omega: 12.4 },
  { xFrac: 0.431, yFrac: 0.221, omega: -12.0 },
  { xFrac: 0.580, yFrac: 0.221, omega: 12.0 },
  { xFrac: 0.318, yFrac: 0.280, omega: -11.6 },
  { xFrac: 0.229, yFrac: 0.277, omega: 11.6 },
  { xFrac: 0.389, yFrac: 0.277, omega: -11.2 },
  { xFrac: 0.315, yFrac: 0.161, omega: 12.6 },
  { xFrac: 0.693, yFrac: 0.161, omega: -12.6 },
  { xFrac: 0.395, yFrac: 0.177, omega: 11.8 },
  { xFrac: 0.594, yFrac: 0.177, omega: -11.8 },
  { xFrac: 0.455, yFrac: 0.523, omega: 11.6 },
  { xFrac: 0.375, yFrac: 0.233, omega: -12.2 },
  { xFrac: 0.518, yFrac: 0.233, omega: 12.2 },
  { xFrac: 0.536, yFrac: 0.352, omega: -11.4 },
  { xFrac: 0.354, yFrac: 0.413, omega: 11.4 },
  { xFrac: 0.670, yFrac: 0.629, omega: -12.0 },
  { xFrac: 0.791, yFrac: 0.629, omega: 12.0 },
  { xFrac: 0.865, yFrac: 0.722, omega: -12.6 },
  { xFrac: 0.419, yFrac: 0.529, omega: 11.6 },
  { xFrac: 0.548, yFrac: 0.471, omega: -11.6 },
  { xFrac: 0.641, yFrac: 0.474, omega: 11.8 },
  { xFrac: 0.286, yFrac: 0.259, omega: 12.0 },
  { xFrac: 0.443, yFrac: 0.262, omega: -12.0 },
];

// Single finish slot: marbles pile in arrival order. (No per-slot outcomes.)
const board = makeBoard({ layout: "zigzag", slotCount: 1, heightMultiplier: 10, elementScale: 0.85, customRotors });
let ballsCatalog = loadBallsCatalog() as BallCatalogEntry[];
saveBallsCatalog(ballsCatalog);

const state = makeGameState({ seed: 1337, board, ballsCatalog }) as UiGameState;
state._shownResultId = null;
state._shownWinnerT = null;
state.counts = (loadBallCounts(ballsCatalog) as Record<string, number>) ?? {};
const renderer = makeRenderer(canvas, { board });
const minimapCtx: CanvasRenderingContext2D | null = minimap.getContext("2d");

let lastMinimapFrac: FracCoord | null = null;
let lastCanvasFrac: FracCoord | null = null;
let pinnedCanvasFrac: FracCoord | null = null;
let coordMode = false;

// View mode:
// - OFF (unchecked): free view (minimap sets a manual camera override)
// - ON  (checked): tail focus (auto-follow the straggler)
let tailFocusOn = false;

let lastWinner: WinnerPayload | null = null;
function setWinnerCache(payload: WinnerPayload | null): void {
  lastWinner = payload || null;
  winnerBtn.disabled = !lastWinner;
}

const imagesById = new Map<string, HTMLImageElement>();
function refreshImages(): void {
  imagesById.clear();
  for (const b of ballsCatalog) {
    const img = new Image();
    img.src = b.imageDataUrl;
    imagesById.set(b.id, img);
  }
}
refreshImages();

function setBalls(next: BallCatalogEntry[]): void {
  ballsCatalog = next;
  state.ballsCatalog = next;
  // Keep counts aligned with catalog.
  const nextCounts: Record<string, number> = {};
  for (const b of next) nextCounts[b.id] = state.counts?.[b.id] ?? 1;
  state.counts = nextCounts;
  saveBallCounts(state.counts);
  refreshImages();
  renderBallCards();
}

const settings = mountSettingsDialog(
  settingsDialog,
  settingsList,
  restoreDefaultsBtn,
  () => ballsCatalog,
  setBalls
) as { open: () => void; render: () => void };

function makeNewBall(): BallCatalogEntry {
  const h = Math.floor(Math.random() * 360);
  const bg0 = `hsl(${h}, 95%, 58%)`;
  const bg1 = `hsl(${(h + 60) % 360}, 95%, 52%)`;
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${bg0}"/>
          <stop offset="1" stop-color="${bg1}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#g)"/>
      <circle cx="64" cy="74" r="38" fill="rgba(255,255,255,0.88)"/>
      <circle cx="52" cy="72" r="4" fill="#111"/>
      <circle cx="76" cy="72" r="4" fill="#111"/>
      <path d="M56 90c7 7 15 7 22 0" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="6" stroke-linecap="round"/>
    </svg>`
  );
  const idBase = `ball-${Date.now().toString(36)}`;
  let id = idBase;
  let n = 1;
  while (ballsCatalog.some((b) => b.id === id)) {
    id = `${idBase}-${n++}`;
  }
  return {
    id,
    name: "새 공",
    imageDataUrl: `data:image/svg+xml;utf8,${svg}`,
    tint: "#ffffff"
  };
}

addBallBtn.addEventListener("click", () => {
  if (state.mode === "playing") return;
  const next = [...ballsCatalog, makeNewBall()];
  saveBallsCatalog(next);
  setBalls(next);
  settings.render();
});

function renderBallCards() {
  // Avoid innerHTML to reduce the chance of accidental XSS patterns.
  ballsEl.replaceChildren();
  for (const b of ballsCatalog) {
    const card = document.createElement("div");
    card.className = "ball-card";
    card.role = "group";

    const thumb = document.createElement("div");
    thumb.className = "ball-thumb";
    const img = document.createElement("img");
    img.alt = b.name;
    img.src = b.imageDataUrl;
    thumb.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "ball-meta";
    const name = document.createElement("div");
    name.className = "ball-name";
    name.textContent = b.name;
    const id = document.createElement("div");
    id.className = "ball-id";
    id.textContent = b.id;
    meta.appendChild(name);
    meta.appendChild(id);

    const qty = document.createElement("div");
    qty.className = "ball-qty";

    const minus = document.createElement("button");
    minus.className = "btn btn--ghost ball-qty__btn";
    minus.type = "button";
    minus.textContent = "-";

    const count = document.createElement("input");
    count.className = "ball-qty__count";
    count.type = "number";
    count.inputMode = "numeric";
    count.min = "0";
    count.max = "99";
    count.step = "1";
    count.value = String(getBallCount(state, b.id));
    count.setAttribute("aria-label", `${b.name} 개수`);

    const plus = document.createElement("button");
    plus.className = "btn btn--ghost ball-qty__btn";
    plus.type = "button";
    plus.textContent = "+";

    const applyDelta = (d: number): void => {
      if (state.mode === "playing") return;
      const next = getBallCount(state, b.id) + d;
      setBallCount(state, b.id, next);
      saveBallCounts(state.counts);
      count.value = String(getBallCount(state, b.id));
      updateControls();
    };
    minus.addEventListener("click", () => applyDelta(-1));
    plus.addEventListener("click", () => applyDelta(+1));

    count.addEventListener("input", () => {
      if (state.mode === "playing") return;
      const next = Number(count.value);
      setBallCount(state, b.id, next);
      saveBallCounts(state.counts);
      count.value = String(getBallCount(state, b.id));
      updateControls();
    });

    const disabled = state.mode === "playing";
    minus.disabled = disabled;
    plus.disabled = disabled;
    count.disabled = disabled;

    qty.appendChild(minus);
    qty.appendChild(count);
    qty.appendChild(plus);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(qty);
    ballsEl.appendChild(card);
  }
}
renderBallCards();

function updateControls() {
  const total = getTotalSelectedCount(state);
  startBtn.disabled = state.mode === "playing";
  viewLockEl.disabled = !(state.mode === "playing" && state.released);
  viewLockEl.checked = !!tailFocusOn;
  hintEl.textContent =
    state.mode === "playing"
      ? state.released
        ? `진행 중... 완료: ${state.finished.length}/${state.totalToDrop}`
        : `준비 중... (시작을 누르면 바로 떨어집니다)`
      : `수량을 고른 뒤 시작하세요. 총 ${total}개`;
}

function setResultText(msg: string): void {
  resultEl.textContent = msg || "";
}

function updateCanvasCoordReadout(xFrac: number, yFrac: number): void {
  if (!coordMode) return;
  lastCanvasFrac =
    Number.isFinite(xFrac) && Number.isFinite(yFrac) ? { xFrac: clamp01(xFrac), yFrac: clamp01(yFrac) } : null;
  const show = pinnedCanvasFrac || lastCanvasFrac;
  if (canvasCoordReadoutEl) {
    if (!show) canvasCoordReadoutEl.textContent = "xFrac: -, yFrac: -";
    else
      canvasCoordReadoutEl.textContent = `xFrac: ${show.xFrac.toFixed(3)}, yFrac: ${show.yFrac.toFixed(3)}${pinnedCanvasFrac ? " (고정)" : ""}`;
  }
  if (canvasCoordCopyBtn) canvasCoordCopyBtn.disabled = !show;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

async function copyText(s: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.setAttribute("readonly", "true");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function playFanfare() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 0.055;
    gain.connect(ctx.destination);

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    const t0 = ctx.currentTime + 0.02;
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = notes[i];
      osc.connect(gain);
      const t = t0 + i * 0.12;
      osc.start(t);
      osc.stop(t + 0.16);
    }
    setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    // ignore
  }
}

// Simple chiptune-ish BGM (original pattern; "8-bit vibe" without copying any specific tune).
const bgm = {
  on: false,
  ctx: null as AudioContext | null,
  gain: null as GainNode | null,
  timer: null as number | null,
  loopSec: 0,
  nextT: 0,
};

function midiToHz(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function bgmStop(): void {
  if (bgm.timer) {
    clearInterval(bgm.timer);
    bgm.timer = null;
  }
  bgm.nextT = 0;
  if (bgm.gain) {
    try {
      if (bgm.ctx) bgm.gain.gain.setValueAtTime(0.0, bgm.ctx.currentTime);
    } catch {}
  }
  if (bgm.ctx) {
    bgm.ctx.close().catch(() => {});
  }
  bgm.ctx = null;
  bgm.gain = null;
  bgm.loopSec = 0;
}

function bgmStart(): void {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  bgmStop();
  const ctx = new AC() as AudioContext;
  const gain = ctx.createGain();
  gain.gain.value = 0.0;
  gain.connect(ctx.destination);
  bgm.ctx = ctx;
  bgm.gain = gain;

  // Fade in.
  const t0 = ctx.currentTime + 0.02;
  gain.gain.setValueAtTime(0.0, t0);
  // 2x louder than before.
  gain.gain.linearRampToValueAtTime(0.12, t0 + 0.25);

  const bpm = 152;
  const step = 60 / bpm / 2; // 8th note
  const bars = 4;
  const stepsPerBar = 8; // 8th notes
  const totalSteps = bars * stepsPerBar;
  bgm.loopSec = totalSteps * step;
  bgm.nextT = t0;

  const melody = [
    76, 79, 83, 79, 76, 74, 71, 74,
    76, 79, 83, 86, 83, 79, 76, 74,
    71, 74, 76, 79, 83, 79, 76, 74,
    71, 69, 71, 74, 76, 74, 71, 69,
  ]; // E5.. (original-ish arpeggio line)
  const bass = [
    52, 52, 52, 52, 50, 50, 50, 50,
    48, 48, 48, 48, 50, 50, 50, 50,
    52, 52, 52, 52, 55, 55, 55, 55,
    50, 50, 50, 50, 48, 48, 48, 48,
  ];

  function playTone(type: OscillatorType, hz: number, start: number, dur: number, vol: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(hz, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(gain);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  function schedule(fromT: number, horizonSec: number): void {
    const endT = fromT + horizonSec;
    let t = bgm.nextT;
    while (t < endT) {
      const k = Math.floor((t - t0) / step);
      const i = ((k % totalSteps) + totalSteps) % totalSteps;
      const m = melody[i];
      const b = bass[i];
      playTone("square", midiToHz(m), t, step * 0.92, 0.080);
      // Bass: triangle + a tiny sub pulse for punch.
      playTone("triangle", midiToHz(b), t, step * 0.98, 0.068);
      if (i % 2 === 0) playTone("square", midiToHz(b - 12), t, step * 0.30, 0.024);
      t += step;
    }
    bgm.nextT = t;
  }

  // Schedule ahead in small chunks.
  schedule(ctx.currentTime, 0.8);
  bgm.timer = window.setInterval(() => {
    if (!bgm.ctx) return;
    const now = bgm.ctx.currentTime;
    schedule(now, 0.9);
  }, 320);
}

function setBgmOn(on: boolean): void {
  bgm.on = !!on;
  try { localStorage.setItem("bgmOn", bgm.on ? "1" : "0"); } catch {}
  if (bgmBtn) {
    bgmBtn.setAttribute("aria-pressed", bgm.on ? "true" : "false");
    bgmBtn.textContent = bgm.on ? "BGM 켬" : "BGM 끔";
  }
  if (bgm.on) bgmStart();
  else bgmStop();
}

function getWinnerPayloadFromState(): WinnerPayload | null {
  if (!state.winner) return null;
  const w = state.winner;
  const b = ballsCatalog.find((x) => x.id === w.ballId);
  const name = b?.name ?? w.ballId ?? "알 수 없는 공";
  const img = b?.imageDataUrl ?? "";
  let orderIdx = state.finished.findIndex((x) => x.marbleId === w.marbleId && x.ballId === w.ballId && x.t === w.t);
  if (orderIdx < 0) orderIdx = Math.max(0, state.finished.length - 1);
  return { name, img, order: orderIdx + 1, total: state.totalToDrop };
}

function showWinnerModal() {
  if (!winnerDialog) return;
  const payload = lastWinner || getWinnerPayloadFromState();
  if (!payload) return;

  if (winnerImgEl) {
    winnerImgEl.src = payload.img || "";
    winnerImgEl.alt = payload.name;
  }
  if (winnerTitleEl) winnerTitleEl.textContent = "마지막 공이 도착했습니다";
  if (winnerSubEl) winnerSubEl.textContent = "";
  if (winnerNameEl) winnerNameEl.textContent = payload.name;
  if (winnerOrderEl) winnerOrderEl.textContent = payload.total ? `${payload.order} / ${payload.total}` : String(payload.order);

  playFanfare();
  try {
    winnerDialog.showModal();
  } catch {
    // ignore
  }
}

function tryStart() {
  if (getTotalSelectedCount(state) <= 0) {
    setResultText("최소 1개 이상 선택하세요.");
    return false;
  }
  // Make each run unpredictable to the user, but still deterministic within the run.
  // (The seed is exposed via render_game_to_text for debugging/fairness.)
  state.seed = ((Date.now() & 0xffffffff) ^ (Math.random() * 0xffffffff)) >>> 0;
  state.rng = makeRng(state.seed);
  startGame(state);
  state._shownResultId = null;
  state._shownWinnerT = null;
  setResultText("");
  renderBallCards(); // disable +/- while playing
  updateControls();
  fixedAccumulatorSec = 0;
  // Default to tail focus when a run starts.
  tailFocusOn = true;
  renderer.clearCameraOverride();
  viewLockEl.checked = true;
  setWinnerCache(null);
  // Start implies drop: release all marbles immediately.
  const n = dropAll(state);
  if (n) setResultText(`시작! ${n}개 투하`);
  return true;
}

startBtn.addEventListener("click", () => {
  tryStart();
});

resetBtn.addEventListener("click", () => {
  resetGame(state);
  state._shownResultId = null;
  state._shownWinnerT = null;
  fixedAccumulatorSec = 0;
  setResultText("");
  renderBallCards();
  renderer.clearCameraOverride();
  tailFocusOn = true;
  viewLockEl.checked = true;
  setWinnerCache(null);
  updateControls();
});

settingsBtn.addEventListener("click", () => {
  settings.open();
});

bgmBtn.addEventListener("click", async () => {
  // Ensure this runs under a user gesture so AudioContext can start.
  setBgmOn(!bgm.on);
});

winnerBtn.addEventListener("click", () => {
  showWinnerModal();
});

// Drop position selection via clicking the board was removed (always uses the default spawn x).

// Fullscreen toggle per skill guidance.
document.addEventListener("keydown", async (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  const k = (e.key || "").toLowerCase();

  // Fullscreen.
  if (k === "f") {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore
    }
    return;
  }

  // Keyboard controls for automation/accessibility:
  // - Enter: 시작(=투하)
  if (e.key === "Enter" && state.mode !== "playing") {
    if (tryStart()) e.preventDefault();
    return;
  }
});

let fixedAccumulatorSec = 0;

function tickFixed(ms: number): void {
  const dt = 1 / 60;
  const sec = Math.max(0, ms / 1000);
  const total = fixedAccumulatorSec + sec;
  const steps = Math.floor(total / dt);
  fixedAccumulatorSec = total - steps * dt;
  for (let i = 0; i < steps; i++) step(state, dt);
  renderer.draw(state, ballsCatalog, imagesById);
  onAfterFrame();
}

function onAfterFrame() {
  if (state.winner && state._shownWinnerT !== state.winner.t) {
    state._shownWinnerT = state.winner.t;
    const p = getWinnerPayloadFromState();
    if (p) {
      setWinnerCache(p);
      setResultText(`마지막 도착: ${p.name} (${p.order}번째)`);
    }
    showWinnerModal();
  }
  updateControls();
}

// Skill integration points: deterministic stepping + text state.
window.render_game_to_text = () => {
  const base = snapshotForText(state);
  const v = renderer.getViewState();
  const out: TextSnapshot & { camera: { cameraY: number; viewHWorld: number; override: number | null } } = {
    ...base,
    camera: { cameraY: v.cameraY, viewHWorld: v.viewHWorld, override: v.cameraOverrideY }
  };
  return JSON.stringify(out);
};
window.advanceTime = async (ms: number): Promise<void> => {
  tickFixed(ms);
};

function resize(): void {
  // Deprecated: kept for any external callers.
  scheduleResize();
}

let _resizeRaf = 0;
function scheduleResize(): void {
  if (_resizeRaf) return;
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    syncVisualViewportHeight();
    renderer.resizeToFit();
    renderer.draw(state, ballsCatalog, imagesById);
  });
}

window.addEventListener("resize", scheduleResize);
window.visualViewport?.addEventListener("resize", scheduleResize);
window.visualViewport?.addEventListener("scroll", scheduleResize);
syncVisualViewportHeight();
scheduleResize();

// Animation loop for interactive play. `advanceTime()` overrides are for automation.
let last = performance.now();
function raf(now: number): void {
  const dtMs = Math.min(40, now - last);
  last = now;
  if (state.mode === "playing") tickFixed(dtMs);
  else renderer.draw(state, ballsCatalog, imagesById);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

function drawMinimap(): void {
  if (!minimapCtx) return;
  const w = minimap.width;
  const h = minimap.height;
  minimapCtx.clearRect(0, 0, w, h);

  const v = renderer.getViewState();
  const camY = v?.cameraY ?? 0;
  const viewH = v?.viewHWorld ?? board.worldH;
  const worldH = board.worldH;
  const worldW = board.worldW;

  // Frame.
  minimapCtx.fillStyle = "rgba(0,0,0,0.25)";
  minimapCtx.fillRect(0, 0, w, h);
  minimapCtx.strokeStyle = "rgba(255,255,255,0.18)";
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(0.5, 0.5, w - 1, h - 1);

  // Track.
  const pad = 10;
  const trackX = pad;
  const trackW = w - pad * 2;
  const trackY = pad;
  const trackH = h - pad * 2;
  minimapCtx.fillStyle = "rgba(255,255,255,0.05)";
  minimapCtx.fillRect(trackX, trackY, trackW, trackH);

  // Slot zone marker.
  const finishY = worldH - board.slotH;
  const finishNy = finishY / worldH;
  minimapCtx.fillStyle = "rgba(255,176,0,0.18)";
  minimapCtx.fillRect(trackX, trackY + trackH * finishNy, trackW, Math.max(2, trackH * (board.slotH / worldH)));

  // Viewport.
  const y0 = clamp(camY / worldH, 0, 1);
  const y1 = clamp((camY + viewH) / worldH, 0, 1);
  minimapCtx.strokeStyle = "rgba(69,243,195,0.9)";
  minimapCtx.lineWidth = 2;
  minimapCtx.strokeRect(trackX + 1, trackY + trackH * y0, trackW - 2, Math.max(8, trackH * (y1 - y0)));

  // Zigzag propeller marker.
  if (board.layout === "zigzag" && board.zigzag?.propellers?.length) {
    for (const p of board.zigzag.propellers) {
      const nx = p.x / worldW;
      const ny = p.y / worldH;
      minimapCtx.fillStyle = "rgba(255,176,0,0.95)";
      minimapCtx.fillRect(trackX + trackW * nx - 2, trackY + trackH * ny - 2, 4, 4);
    }
  }

  // Marbles.
  const all = [...(state.pending || []), ...(state.marbles || [])];
  for (const m of all) {
    const nx = m.x / worldW;
    const ny = m.y / worldH;
    const cx = trackX + trackW * nx;
    const cy = trackY + trackH * ny;
    minimapCtx.fillStyle = "rgba(255,255,255,0.85)";
    minimapCtx.beginPath();
    minimapCtx.arc(cx, cy, 2.2, 0, Math.PI * 2);
    minimapCtx.fill();
  }

  // Hint text (runtime state).
  if (minimapHintEl) {
    if (state.mode !== "playing") minimapHintEl.textContent = "시작 전에도 미니맵으로 맵을 둘러볼 수 있어요.";
    else
      minimapHintEl.textContent =
        "토글 OFF: 자유 시점(미니맵으로 이동)\n토글 ON: 후미 공 자동 추적";
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

{
  const onPick = (e: PointerEvent) => {
    // Free view mode only. If the user interacts with the minimap, switch to free view.
    tailFocusOn = false;
    viewLockEl.checked = false;
    const rect = minimap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const v = renderer.getViewState();
    const viewH = v.viewHWorld;
    const desired = y * board.worldH - viewH * 0.5;
    renderer.setCameraOverrideY(desired);
    updateControls();
  };
  minimap.addEventListener("pointerdown", onPick);
  minimap.addEventListener("pointermove", (e) => {
    if (e.buttons !== 1) return;
    onPick(e);
  });
}

canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (!coordMode) return;
  if (pinnedCanvasFrac) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = renderer.screenToWorld(sx, sy);
  const xFrac = w.x / board.worldW;
  const yFrac = w.y / board.worldH;
  updateCanvasCoordReadout(xFrac, yFrac);
});
canvas.addEventListener("pointerleave", () => {
  if (!coordMode) return;
  if (!pinnedCanvasFrac) updateCanvasCoordReadout(NaN, NaN);
});

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  if (!coordMode) return;
  // Pin coordinate on click.
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const w = renderer.screenToWorld(sx, sy);
  pinnedCanvasFrac = { xFrac: clamp01(w.x / board.worldW), yFrac: clamp01(w.y / board.worldH) };
  updateCanvasCoordReadout(pinnedCanvasFrac.xFrac, pinnedCanvasFrac.yFrac);
});

canvasCoordCopyBtn.addEventListener("click", async () => {
  if (!coordMode) return;
  const v = pinnedCanvasFrac || lastCanvasFrac;
  if (!v) return;
  const txt = `{ xFrac: ${v.xFrac.toFixed(3)}, yFrac: ${v.yFrac.toFixed(3)} }`;
  const ok = await copyText(txt);
  const prev = canvasCoordCopyBtn.textContent;
  canvasCoordCopyBtn.textContent = ok ? "복사됨" : "실패";
  setTimeout(() => {
    canvasCoordCopyBtn.textContent = prev;
  }, 650);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!coordMode) return;
  pinnedCanvasFrac = null;
  updateCanvasCoordReadout(NaN, NaN);
});

function setCoordMode(on: boolean): void {
  coordMode = !!on;
  document.documentElement.classList.toggle("coord-mode", coordMode);
  pinnedCanvasFrac = null;
  lastCanvasFrac = null;
  lastMinimapFrac = null;
  // Refresh readouts if visible.
  if (coordMode) {
    updateCanvasCoordReadout(NaN, NaN);
  }
}

// Secret toggle: click "미니맵" title 5 times in a row.
{
  let clicks = 0;
  let lastClickMs = 0;
  minimapTitleEl.addEventListener("click", () => {
    const now = Date.now();
    if (now - lastClickMs > 900) clicks = 0;
    lastClickMs = now;
    clicks++;
    if (clicks >= 5) {
      clicks = 0;
      setCoordMode(!coordMode);
    }
  });
}

// Default: hidden.
setCoordMode(false);

viewLockEl.addEventListener("change", () => {
  const v = renderer.getViewState();
  tailFocusOn = !!viewLockEl.checked;
  if (tailFocusOn) {
    renderer.clearCameraOverride(); // auto tail focus
  } else {
    // Freeze at current view; user can scrub via minimap.
    renderer.setCameraOverrideY(v.cameraY);
  }
  updateControls();
});

// Draw minimap at a fixed cadence, independent of requestAnimationFrame variability.
setInterval(drawMinimap, 100);

// Init persisted BGM.
try {
  const v = localStorage.getItem("bgmOn");
  setBgmOn(v === "1");
} catch {
  setBgmOn(false);
}
