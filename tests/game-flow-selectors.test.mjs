import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  deriveStatusTone,
  getFinishTempoMultiplier,
  getFinishTensionSnapshot,
  getParticipantCount,
  getWinnerCountMax,
  sanitizeBallName,
  sanitizeStartCaption,
} from "../src/app/game-flow-selectors.ts";

test("winner count max uses totalToDrop first and falls back to selected count", () => {
  assert.equal(getWinnerCountMax(12, 5), 12);
  assert.equal(getWinnerCountMax(0, 7), 7);
  assert.equal(getParticipantCount(0, 0), 1);
});

test("status tone selector returns ready/running/paused/done correctly", () => {
  assert.equal(deriveStatusTone({ mode: "menu", paused: false, winner: null }), "ready");
  assert.equal(deriveStatusTone({ mode: "playing", paused: false, winner: null }), "running");
  assert.equal(deriveStatusTone({ mode: "playing", paused: true, winner: null }), "paused");
  assert.equal(deriveStatusTone({ mode: "playing", paused: false, winner: {} }), "done");
});

test("finish tension snapshot activates near finish and slowdown clamps correctly", () => {
  const snapshot = getFinishTensionSnapshot({
    mode: "playing",
    hasWinner: false,
    released: true,
    totalToDrop: 8,
    finishedCount: 7,
    finishTriggerRemaining: 3,
    worldH: 1000,
    marbles: [
      { done: false, y: 940 },
      { done: true, y: 990 },
    ],
  });

  assert.equal(snapshot.active, true);
  assert.equal(snapshot.remaining, 1);
  assert.equal(snapshot.progress > 0, true);
  assert.equal(getFinishTempoMultiplier(1, snapshot) <= 0.56, true);
});

test("sanitize helpers trim control chars and preserve fallback", () => {
  assert.equal(sanitizeBallName("  토끼\t\n", "기본"), "토끼");
  assert.equal(sanitizeBallName("", "기본"), "기본");
  assert.equal(sanitizeStartCaption("안녕\u0001하세요"), "안녕하세요");
  assert.equal(clamp(10, 1, 5), 5);
});
