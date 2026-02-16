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
} from "./game/engine.js";
import { makeRenderer } from "./game/render.js";
import { loadBallsCatalog, loadBallCounts, saveBallsCatalog, saveBallCounts } from "./ui/storage.js";
import { mountSettingsDialog } from "./ui/settings.js";
import { BALL_LIBRARY } from "./game/assets.js";

const canvas = document.getElementById("game");
const startBtn = document.getElementById("start-btn");
const settingsBtn = document.getElementById("settings-btn");
const bgmBtn = document.getElementById("bgm-btn");
const winnerBtn = document.getElementById("winner-btn");
const ballsEl = document.getElementById("balls");
const minimap = document.getElementById("minimap");
const viewLockEl = document.getElementById("view-lock");
const minimapHintEl = document.getElementById("minimap-hint");
const canvasCoordReadoutEl = document.getElementById("canvas-coord-readout");
const canvasCoordCopyBtn = document.getElementById("canvas-coord-copy");
const minimapTitleEl = document.getElementById("minimap-title");

function syncVisualViewportHeight() {
  // Mobile browsers: 100vh often includes dynamic browser chrome; use the visual viewport height instead.
  const vv = window.visualViewport;
  const h = vv?.height || window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--appH", `${Math.round(h)}px`);
}

const settingsDialog = document.getElementById("settings-dialog");
const settingsList = document.getElementById("settings-list");
const restoreDefaultsBtn = document.getElementById("restore-defaults");
const addBallBtn = document.getElementById("add-ball");

const winnerDialog = document.getElementById("winner-dialog");
const winnerImgEl = document.getElementById("winner-img");
const winnerNameEl = document.getElementById("winner-name");

// Hand-tuned extra rotors can be added here (world coords or xFrac/yFrac in [0..1]).
// These override the auto-added mid-section rotors (the early rotor ring stays).
const customRotors = [
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
function normalizeBallIcons(catalog) {
  const libById = new Map(BALL_LIBRARY.map((b) => [b.id, b]));
  let changed = false;
  const next = (Array.isArray(catalog) ? catalog : []).map((b) => {
    const lib = libById.get(b?.id);
    if (!lib) return b;

    const url = String(b?.imageDataUrl || "");
    const isSvg = url.startsWith("data:image/svg+xml");
    const isOurSvg =
      url.startsWith("data:image/svg+xml") &&
      (url.includes("radialGradient%20id%3D%22v%22") ||
        url.includes('radialGradient id="v"') ||
        url.includes("paint-order%3A%20stroke") ||
        url.includes("paint-order: stroke"));

    // Only migrate our built-in SVG icons; keep user-provided PNG/JPEG/etc (and custom SVG).
    if (isSvg && isOurSvg && url !== lib.imageDataUrl) {
      changed = true;
      return { ...b, imageDataUrl: lib.imageDataUrl, tint: lib.tint };
    }
    return b;
  });
  return { next, changed };
}

let ballsCatalog = loadBallsCatalog();
{
  const { next, changed } = normalizeBallIcons(ballsCatalog);
  if (changed) {
    ballsCatalog = next;
    saveBallsCatalog(ballsCatalog);
  }
}

const state = makeGameState({ seed: 1337, board, ballsCatalog });
state.counts = loadBallCounts(ballsCatalog);
const renderer = makeRenderer(canvas, { board });
const minimapCtx = minimap?.getContext?.("2d");

let lastMinimapFrac = null; // {xFrac,yFrac}
let lastCanvasFrac = null; // {xFrac,yFrac}
let pinnedCanvasFrac = null; // {xFrac,yFrac}
let coordMode = false;

// View mode:
// - OFF (unchecked): free view (minimap sets a manual camera override)
// - ON  (checked): tail focus (auto-follow the straggler)
let tailFocusOn = true;

let lastWinner = null;
function setWinnerCache(payload) {
  lastWinner = payload || null;
  if (winnerBtn) winnerBtn.disabled = !lastWinner;
}

const imagesById = new Map();
function refreshImages() {
  imagesById.clear();
  for (const b of ballsCatalog) {
    const img = new Image();
    img.src = b.imageDataUrl;
    imagesById.set(b.id, img);
  }
}
refreshImages();

function setBalls(next) {
  ballsCatalog = next;
  state.ballsCatalog = next;
  // Keep counts aligned with catalog.
  const nextCounts = {};
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
);

addBallBtn?.addEventListener("click", () => {
  if (state.mode === "playing") return;
  // Cap to the curated library (15).
  if (ballsCatalog.length >= BALL_LIBRARY.length) return;
  const used = new Set(ballsCatalog.map((b) => b.id));
  const nextBall = BALL_LIBRARY.find((b) => !used.has(b.id));
  if (!nextBall) return;
  const next = [...ballsCatalog, structuredClone(nextBall)];
  saveBallsCatalog(next);
  setBalls(next);
  settings.render?.();
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
    name.className = "ball-name tooltip";
    name.setAttribute("data-tip", b.name);
    name.setAttribute("aria-label", b.name);
    const nameText = document.createElement("span");
    nameText.className = "ball-name__text";
    nameText.textContent = b.name;
    name.appendChild(nameText);
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

    const applyDelta = (d) => {
      if (state.mode === "playing" && !state.winner) return;
      const next = getBallCount(state, b.id) + d;
      setBallCount(state, b.id, next);
      saveBallCounts(state.counts);
      count.value = String(getBallCount(state, b.id));
      updateControls();
    };
    minus.addEventListener("click", () => applyDelta(-1));
    plus.addEventListener("click", () => applyDelta(+1));

    count.addEventListener("input", () => {
      if (state.mode === "playing" && !state.winner) return;
      const next = Number(count.value);
      setBallCount(state, b.id, next);
      saveBallCounts(state.counts);
      count.value = String(getBallCount(state, b.id));
      updateControls();
    });

    const disabled = state.mode === "playing" && !state.winner;
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
  startBtn.disabled = total <= 0;
  // While playing (before the last ball arrives), the button acts as a quick restart.
  // After the game ends, show it as "게임 시작" for the next run.
  const inRun = state.mode === "playing" && !state.winner;
  startBtn.textContent = inRun ? "게임 재시작" : "게임 시작";
  if (viewLockEl) {
    const v = renderer.getViewState?.();
    viewLockEl.disabled = !(state.mode === "playing" && state.released && v);
    viewLockEl.checked = !!tailFocusOn;
  }
}

function updateCanvasCoordReadout(xFrac, yFrac) {
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

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

async function copyText(s) {
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
let bgm = {
  on: false,
  ctx: null,
  gain: null,
  timer: null,
  loopSec: 0,
  nextT: 0,
};

function midiToHz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function bgmStop() {
  if (bgm.timer) {
    clearInterval(bgm.timer);
    bgm.timer = null;
  }
  bgm.nextT = 0;
  if (bgm.gain) {
    try { bgm.gain.gain.setValueAtTime(0.0, bgm.ctx.currentTime); } catch {}
  }
  if (bgm.ctx) {
    bgm.ctx.close().catch(() => {});
  }
  bgm.ctx = null;
  bgm.gain = null;
  bgm.loopSec = 0;
}

function bgmStart() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  bgmStop();
  const ctx = new AC();
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

  function playTone(type, hz, start, dur, vol) {
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

  function schedule(fromT, horizonSec) {
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
  bgm.timer = setInterval(() => {
    if (!bgm.ctx) return;
    const now = bgm.ctx.currentTime;
    // If we fell behind (e.g., tab was backgrounded), catch up.
    if (bgm.nextT && bgm.nextT < now) bgm.nextT = now;
    schedule(now, 0.9);
  }, 320);
}

function setBgmOn(on) {
  return setBgmOnWithOpts(on, { autoplay: true });
}

function setBgmOnWithOpts(on, { autoplay } = {}) {
  bgm.on = !!on;
  try { localStorage.setItem("bgmOn", bgm.on ? "1" : "0"); } catch {}
  if (bgmBtn) {
    bgmBtn.setAttribute("aria-pressed", bgm.on ? "true" : "false");
    bgmBtn.textContent = bgm.on ? "BGM 켬" : "BGM 끔";
  }
  if (bgm.on) {
    if (autoplay) bgmStart();
    else armBgmAutostart();
  }
  else bgmStop();
}

function armBgmAutostart() {
  if (bgm.ctx) return;
  if (bgm._armed) return;
  bgm._armed = true;

  const tryResume = () => {
    if (!bgm.on) return cleanup();
    if (bgm.ctx) return cleanup();
    bgmStart();
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener("pointerdown", tryResume);
    window.removeEventListener("keydown", tryResume);
    bgm._armed = false;
  };

  window.addEventListener("pointerdown", tryResume, { once: true, passive: true });
  window.addEventListener("keydown", tryResume, { once: true });
}

function getWinnerPayloadFromState() {
  if (!state?.winner) return null;
  const b = ballsCatalog.find((x) => x.id === state.winner?.ballId);
  const name = b?.name || state.winner?.ballId || "알 수 없는 공";
  return {
    name,
    img: b?.imageDataUrl || "",
  };
}

function showWinnerModal({ fanfare = true } = {}) {
  if (!winnerDialog) return;
  const payload = lastWinner || getWinnerPayloadFromState();
  if (!payload) return;

  if (winnerImgEl) {
    winnerImgEl.src = payload.img || "";
    winnerImgEl.alt = payload.name;
  }
  if (winnerNameEl) winnerNameEl.textContent = payload.name;

  if (fanfare) playFanfare();
  try {
    winnerDialog.showModal();
  } catch {
    // ignore
  }
}

function tryStart() {
  if (getTotalSelectedCount(state) <= 0) return false;
  // Make each run unpredictable to the user, but still deterministic within the run.
  // (The seed is exposed via render_game_to_text for debugging/fairness.)
  state.seed = ((Date.now() & 0xffffffff) ^ (Math.random() * 0xffffffff)) >>> 0;
  state.rng = makeRng(state.seed);
  startGame(state);
  state._shownResultId = null;
  state._shownWinnerT = null;
  renderBallCards(); // disable +/- while playing
  updateControls();
  // Default to tail focus when a run starts.
  tailFocusOn = true;
  renderer.clearCameraOverride?.();
  if (viewLockEl) viewLockEl.checked = true;
  setWinnerCache(null);
  // Start implies drop: release all marbles immediately.
  dropAll(state);
  return true;
}

startBtn.addEventListener("click", () => {
  if (state.mode === "playing") {
    // Fast restart: no need to click "초기화" first.
    resetGame(state);
    state._shownResultId = null;
    state._shownWinnerT = null;
    renderer.clearCameraOverride?.();
    tailFocusOn = true;
    if (viewLockEl) viewLockEl.checked = true;
    setWinnerCache(null);
  }
  tryStart();
});

settingsBtn.addEventListener("click", () => {
  settings.open();
});

bgmBtn?.addEventListener("click", async () => {
  // Ensure this runs under a user gesture so AudioContext can start.
  setBgmOnWithOpts(!bgm.on, { autoplay: true });
});

winnerBtn?.addEventListener("click", () => {
  showWinnerModal({ fanfare: false });
});

// Drop position selection via clicking the board was removed (always uses the default spawn x).

// Fullscreen toggle per skill guidance.
document.addEventListener("keydown", async (e) => {
  const tag = e.target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

  const k = e.key?.toLowerCase?.() || "";

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

function tickFixed(ms) {
  const dt = 1 / 60;
  const steps = Math.max(1, Math.round((ms / 1000) / dt));
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
    }
    showWinnerModal();
  }
  updateControls();
}

// Skill integration points: deterministic stepping + text state.
window.render_game_to_text = () => {
  const base = snapshotForText(state);
  const v = renderer.getViewState?.();
  if (v) base.camera = { cameraY: v.cameraY, viewHWorld: v.viewHWorld, override: v.cameraOverrideY };
  return JSON.stringify(base);
};
window.advanceTime = async (ms) => {
  tickFixed(ms);
};

function resize() {
  // Deprecated: kept for any external callers.
  scheduleResize();
}

let _resizeRaf = 0;
function scheduleResize() {
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
function raf(now) {
  const dtMs = Math.min(40, now - last);
  last = now;
  if (state.mode === "playing") tickFixed(dtMs);
  else renderer.draw(state, ballsCatalog, imagesById);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

function drawMinimap() {
  if (!minimapCtx || !minimap) return;
  const w = minimap.width;
  const h = minimap.height;
  minimapCtx.clearRect(0, 0, w, h);

  const v = renderer.getViewState?.();
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

if (minimap) {
  const onPick = (e) => {
    // Free view mode only. If the user interacts with the minimap, switch to free view.
    tailFocusOn = false;
    if (viewLockEl) viewLockEl.checked = false;
    const rect = minimap.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const v = renderer.getViewState?.();
    const viewH = v?.viewHWorld ?? board.worldH;
    const desired = y * board.worldH - viewH * 0.5;
    renderer.setCameraOverrideY?.(desired);
    updateControls();
  };
  minimap.addEventListener("pointerdown", onPick);
  minimap.addEventListener("pointermove", (e) => {
    if (e.buttons !== 1) return;
    onPick(e);
  });
}

canvas?.addEventListener("pointermove", (e) => {
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
canvas?.addEventListener("pointerleave", () => {
  if (!coordMode) return;
  if (!pinnedCanvasFrac) updateCanvasCoordReadout(NaN, NaN);
});

canvas?.addEventListener("pointerdown", (e) => {
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

canvasCoordCopyBtn?.addEventListener("click", async () => {
  if (!coordMode) return;
  const v = pinnedCanvasFrac || lastCanvasFrac;
  if (!v) return;
  const txt = `{ xFrac: ${v.xFrac.toFixed(3)}, yFrac: ${v.yFrac.toFixed(3)} }`;
  const ok = await copyText(txt);
  if (canvasCoordCopyBtn) {
    const prev = canvasCoordCopyBtn.textContent;
    canvasCoordCopyBtn.textContent = ok ? "복사됨" : "실패";
    setTimeout(() => {
      if (canvasCoordCopyBtn) canvasCoordCopyBtn.textContent = prev;
    }, 650);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!coordMode) return;
  pinnedCanvasFrac = null;
  updateCanvasCoordReadout(NaN, NaN);
});

function setCoordMode(on) {
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
if (minimapTitleEl) {
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

viewLockEl?.addEventListener("change", () => {
  const v = renderer.getViewState?.();
  if (!v) return;
  tailFocusOn = !!viewLockEl.checked;
  if (tailFocusOn) {
    renderer.clearCameraOverride?.(); // auto tail focus
  } else {
    // Freeze at current view; user can scrub via minimap.
    renderer.setCameraOverrideY?.(v.cameraY);
  }
  updateControls();
});

// Draw minimap at a fixed cadence, independent of requestAnimationFrame variability.
setInterval(drawMinimap, 100);

// Init persisted BGM.
try {
  const v = localStorage.getItem("bgmOn");
  // Restore UI state, but defer AudioContext start until a user gesture.
  setBgmOnWithOpts(v === "1", { autoplay: false });
} catch {
  setBgmOnWithOpts(false, { autoplay: false });
}
