import test from "node:test";
import assert from "node:assert/strict";
import { makeBoard, makeGameState, startGame, setDropX, dropAll, setBallCount, step } from "../src/game/engine.js";

test("dropAll releases all marbles and winner is the last finisher", () => {
  const board = makeBoard({ slotCount: 8, heightMultiplier: 1, corridorEnabled: false });
  const ballsCatalog = [
    { id: "dog", name: "강아지", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" }
  ];
  const state = makeGameState({ seed: 42, board, ballsCatalog });
  setBallCount(state, "dog", 5);
  startGame(state);

  setDropX(state, 450);
  assert.equal(state.pending.length, 5);
  const n = dropAll(state);
  assert.equal(n, 5);
  assert.equal(state.pending.length, 0);
  assert.equal(state.marbles.length, 5);

  // Physics tuning may change the exact time-to-finish; wait up to 60s.
  for (let i = 0; i < 60 * 60 && state.finished.length < state.totalToDrop; i++) step(state, 1 / 60);
  assert.equal(state.finished.length, 5);
  assert.ok(state.winner);
  assert.equal(state.winner.t, Math.max(...state.finished.map((x) => x.t)));
});

test("zigzag layout reduces straight falls (lateral motion) and propeller mixes", () => {
  const board = makeBoard({ layout: "zigzag", slotCount: 8, heightMultiplier: 1, corridorEnabled: false, elementScale: 0.85 });
  const ballsCatalog = [
    { id: "dog", name: "강아지", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" }
  ];
  const state = makeGameState({ seed: 7, board, ballsCatalog });

  setBallCount(state, "dog", 12);
  startGame(state);
  setDropX(state, board.worldW / 2);
  dropAll(state);

  let minX = Infinity;
  let maxX = -Infinity;
  const x0 = board.worldW / 2;
  let maxDev = 0;

  // Physics/map tuning may change time-to-finish; wait up to 120s.
  for (let i = 0; i < 120 * 60 && state.finished.length < state.totalToDrop; i++) {
    step(state, 1 / 60);
    for (const m of state.marbles) {
      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x);
      maxDev = Math.max(maxDev, Math.abs(m.x - x0));
    }
  }

  assert.equal(state.finished.length, state.totalToDrop);
  assert.ok(state.stats.propellerContacts > 0, "expected at least one propeller contact");
  assert.ok(maxDev > board.worldW * 0.12, `expected lateral deviation; got ${maxDev.toFixed(1)}px`);
  assert.ok(maxX - minX > board.worldW * 0.20, `expected horizontal spread; got ${(maxX - minX).toFixed(1)}px`);
});
