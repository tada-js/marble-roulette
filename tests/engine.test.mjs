import test from "node:test";
import assert from "node:assert/strict";
import { makeBoard, makeGameState, startGame, setDropX, dropAll, setBallCount, step } from "../src/game/engine.js";

test("dropAll releases all marbles and winner is the last finisher", () => {
  const board = makeBoard({ slotCount: 8, heightMultiplier: 1 });
  const ballsCatalog = [
    { id: "dog", name: "강아지", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" }
  ];
  const state = makeGameState({ seed: 42, board, ballsCatalog });
  state.chaos.enabled = false;
  setBallCount(state, "dog", 5);
  startGame(state);

  setDropX(state, 450);
  assert.equal(state.pending.length, 5);
  const n = dropAll(state);
  assert.equal(n, 5);
  assert.equal(state.pending.length, 0);
  assert.equal(state.marbles.length, 5);

  for (let i = 0; i < 60 * 12; i++) step(state, 1 / 60);
  assert.equal(state.finished.length, 5);
  assert.ok(state.winner);
  assert.equal(state.winner.t, Math.max(...state.finished.map((x) => x.t)));
});
