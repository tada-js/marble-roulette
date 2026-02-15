import {
  makeBoard,
  makeGameState,
  makeRng,
  resetGame,
  setDropX,
  snapshotForText,
  startGame,
  step,
  dropAll,
  getBallCount,
  getTotalSelectedCount,
  setBallCount
} from "./game/engine.js";
import { makeRenderer } from "./game/render.js";
import { loadBallsCatalog, loadBallCounts, loadChaosEnabled, saveBallsCatalog, saveBallCounts, saveChaosEnabled } from "./ui/storage.js";
import { mountSettingsDialog } from "./ui/settings.js";

const canvas = document.getElementById("game");
const startBtn = document.getElementById("start-btn");
const dropBtn = document.getElementById("drop-btn");
const chaosBtn = document.getElementById("chaos-btn");
const resetBtn = document.getElementById("reset-btn");
const settingsBtn = document.getElementById("settings-btn");
const ballsEl = document.getElementById("balls");
const resultEl = document.getElementById("result");
const hintEl = document.getElementById("hint");
const minimap = document.getElementById("minimap");
const followBtn = document.getElementById("follow-btn");
const minimapHintEl = document.getElementById("minimap-hint");
const legendEl = document.querySelector(".legend");

const settingsDialog = document.getElementById("settings-dialog");
const settingsList = document.getElementById("settings-list");
const restoreDefaultsBtn = document.getElementById("restore-defaults");

const board = makeBoard({ layout: "roulette", heightMultiplier: 10, elementScale: 0.85 });
let ballsCatalog = loadBallsCatalog();
saveBallsCatalog(ballsCatalog);

const state = makeGameState({ seed: 1337, board, ballsCatalog });
state.counts = loadBallCounts(ballsCatalog);
state.chaos.enabled = loadChaosEnabled();
const renderer = makeRenderer(canvas, { board });
const minimapCtx = minimap?.getContext?.("2d");

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

function renderBallCards() {
  ballsEl.innerHTML = "";
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

    const count = document.createElement("div");
    count.className = "ball-qty__count";
    count.textContent = String(getBallCount(state, b.id));

    const plus = document.createElement("button");
    plus.className = "btn btn--ghost ball-qty__btn";
    plus.type = "button";
    plus.textContent = "+";

    const applyDelta = (d) => {
      if (state.mode === "playing") return;
      const next = getBallCount(state, b.id) + d;
      setBallCount(state, b.id, next);
      saveBallCounts(state.counts);
      count.textContent = String(getBallCount(state, b.id));
      updateControls();
    };
    minus.addEventListener("click", () => applyDelta(-1));
    plus.addEventListener("click", () => applyDelta(+1));

    const disabled = state.mode === "playing";
    minus.disabled = disabled;
    plus.disabled = disabled;

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
  dropBtn.disabled = state.mode !== "playing" || state.released || state.pending.length === 0;
  startBtn.disabled = state.mode === "playing";
  if (followBtn) {
    const v = renderer.getViewState?.();
    followBtn.disabled = !(state.mode === "playing" && v && typeof v.cameraOverrideY === "number");
  }
  hintEl.textContent =
    state.mode === "playing"
      ? state.released
        ? `Dropping... Finished: ${state.finished.length}/${state.totalToDrop}`
        : `Click the board to set drop position. Press DROP to release all (${state.pending.length}).`
      : `Select counts (+/-), then press Start. Total selected: ${total}`;

  if (legendEl) legendEl.hidden = !state.chaos?.enabled;
  if (chaosBtn) chaosBtn.textContent = `Chaos: ${state.chaos?.enabled ? "On" : "Off"}`;
}

function setResultText(msg) {
  resultEl.textContent = msg || "";
}

startBtn.addEventListener("click", () => {
  if (getTotalSelectedCount(state) <= 0) {
    setResultText("Select at least 1 ball.");
    return;
  }
  // Make each run unpredictable to the user, but still deterministic within the run.
  // (The seed is exposed via render_game_to_text for debugging/fairness.)
  state.seed = ((Date.now() & 0xffffffff) ^ (Math.random() * 0xffffffff)) >>> 0;
  state.rng = makeRng(state.seed);
  startGame(state);
  state._shownResultId = null;
  setResultText("");
  renderBallCards(); // disable +/- while playing
  updateControls();
});

resetBtn.addEventListener("click", () => {
  resetGame(state);
  state._shownResultId = null;
  setResultText("");
  renderBallCards();
  renderer.clearCameraOverride?.();
  updateControls();
});

chaosBtn?.addEventListener("click", () => {
  if (state.mode === "playing") return;
  state.chaos.enabled = !state.chaos.enabled;
  saveChaosEnabled(state.chaos.enabled);
  updateControls();
});

settingsBtn.addEventListener("click", () => {
  settings.open();
});

dropBtn.addEventListener("click", () => {
  const n = dropAll(state);
  if (!n) return;
  setResultText(`Dropped: ${n} marbles`);
});

function canvasPointerToWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  return renderer.screenToWorld(sx, sy);
}

canvas.addEventListener("pointerdown", (e) => {
  if (state.mode !== "playing") return;
  const p = canvasPointerToWorld(e);
  setDropX(state, p.x);
});

// Fullscreen toggle per skill guidance.
document.addEventListener("keydown", async (e) => {
  if (e.key.toLowerCase() !== "f") return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    // ignore
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
  if (state.lastResult && !state._shownResultId) {
    state._shownResultId = state.lastResult.marbleId;
    const b = ballsCatalog.find((x) => x.id === state.lastResult.ballId);
    setResultText(`Result: ${b?.name || state.lastResult.ballId} -> ${state.lastResult.label}`);
  }
  if (state.winner && state._shownWinnerT !== state.winner.t) {
    state._shownWinnerT = state.winner.t;
    const b = ballsCatalog.find((x) => x.id === state.winner.ballId);
    setResultText(`Winner (last to arrive): ${b?.name || state.winner.ballId} -> ${state.winner.label}`);
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
  renderer.resizeToFit();
  renderer.draw(state, ballsCatalog, imagesById);
}
window.addEventListener("resize", resize);
resize();

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

  // Chaos markers (bumpers/portals) as tiny dots.
  if (state.chaos?.enabled) {
    for (const o of state.chaos.bumpers || []) {
      const nx = o.x / worldW;
      const ny = o.y / worldH;
      minimapCtx.fillStyle = "rgba(255,176,0,0.75)";
      minimapCtx.fillRect(trackX + trackW * nx - 1, trackY + trackH * ny - 1, 2, 2);
    }
    for (const p of state.chaos.portals || []) {
      for (const end of [p.a, p.b]) {
        const nx = end.x / worldW;
        const ny = end.y / worldH;
        minimapCtx.fillStyle = "rgba(202,160,255,0.85)";
        minimapCtx.fillRect(trackX + trackW * nx - 1, trackY + trackH * ny - 1, 2, 2);
      }
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
    if (state.mode !== "playing") minimapHintEl.textContent = "Start the game to enable navigation.";
    else if (!state.released) minimapHintEl.textContent = "Click map to preview. DROP starts the run.";
    else minimapHintEl.textContent = "Click map to jump. Follow resumes auto-tracking.";
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

if (minimap) {
  const onPick = (e) => {
    if (state.mode !== "playing") return;
    const rect = minimap.getBoundingClientRect();
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

followBtn?.addEventListener("click", () => {
  renderer.clearCameraOverride?.();
  updateControls();
});

// Draw minimap at a fixed cadence, independent of requestAnimationFrame variability.
setInterval(drawMinimap, 100);
