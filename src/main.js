import {
  makeBoard,
  makeGameState,
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
import { loadBallsCatalog, loadBallCounts, saveBallsCatalog, saveBallCounts } from "./ui/storage.js";
import { mountSettingsDialog } from "./ui/settings.js";

const canvas = document.getElementById("game");
const startBtn = document.getElementById("start-btn");
const dropBtn = document.getElementById("drop-btn");
const resetBtn = document.getElementById("reset-btn");
const settingsBtn = document.getElementById("settings-btn");
const ballsEl = document.getElementById("balls");
const resultEl = document.getElementById("result");
const hintEl = document.getElementById("hint");

const settingsDialog = document.getElementById("settings-dialog");
const settingsList = document.getElementById("settings-list");
const restoreDefaultsBtn = document.getElementById("restore-defaults");

const board = makeBoard();
let ballsCatalog = loadBallsCatalog();
saveBallsCatalog(ballsCatalog);

const state = makeGameState({ seed: 1337, board, ballsCatalog });
state.counts = loadBallCounts(ballsCatalog);
const renderer = makeRenderer(canvas, { board });

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
  hintEl.textContent =
    state.mode === "playing"
      ? state.released
        ? `Dropping... Finished: ${state.finished.length}/${state.totalToDrop}`
        : `Click the board to set drop position. Press DROP to release all (${state.pending.length}).`
      : `Select counts (+/-), then press Start. Total selected: ${total}`;
}

function setResultText(msg) {
  resultEl.textContent = msg || "";
}

startBtn.addEventListener("click", () => {
  if (getTotalSelectedCount(state) <= 0) {
    setResultText("Select at least 1 ball.");
    return;
  }
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
window.render_game_to_text = () => JSON.stringify(snapshotForText(state));
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
