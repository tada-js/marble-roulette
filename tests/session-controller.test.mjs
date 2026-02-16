import test from "node:test";
import assert from "node:assert/strict";
import { createSessionController } from "../src/game/session-controller.ts";

function makeCallCounter() {
  const calls = [];
  return {
    calls,
    fn: (...args) => {
      calls.push(args);
    },
  };
}

test("session controller starts a run and applies default run view", () => {
  const state = { mode: "menu", winner: null, paused: true };
  const viewState = { tailFocusOn: false };

  const startCounter = makeCallCounter();
  const dropCounter = makeCallCounter();
  const preStartCounter = makeCallCounter();
  const resetCounter = makeCallCounter();
  const updateCounter = makeCallCounter();
  const clearCameraCounter = makeCallCounter();

  const controller = createSessionController({
    state,
    renderer: { clearCameraOverride: clearCameraCounter.fn },
    viewState,
    getTotalSelectedCount: () => 5,
    makeRng: () => ({ next: 1 }),
    startGame: (s) => {
      s.mode = "playing";
      startCounter.fn();
    },
    dropAll: () => {
      dropCounter.fn();
    },
    resetGame: () => {
      throw new Error("resetGame should not run during tryStart from menu");
    },
    onPreStart: preStartCounter.fn,
    onReset: resetCounter.fn,
    onUpdateControls: updateCounter.fn,
  });

  const started = controller.tryStart();
  assert.equal(started, true);
  assert.equal(state.mode, "playing");
  assert.equal(state.paused, false);
  assert.equal(viewState.tailFocusOn, true);

  assert.equal(startCounter.calls.length, 1);
  assert.equal(dropCounter.calls.length, 1);
  assert.equal(preStartCounter.calls.length, 1);
  assert.equal(resetCounter.calls.length, 1);
  assert.equal(updateCounter.calls.length, 1);
  assert.equal(clearCameraCounter.calls.length, 1);
});

test("session controller toggles pause only while in active run", () => {
  const state = { mode: "menu", winner: null, paused: false };
  const updateCounter = makeCallCounter();

  const controller = createSessionController({
    state,
    renderer: {},
    viewState: { tailFocusOn: true },
    getTotalSelectedCount: () => 1,
    makeRng: () => ({}),
    startGame: () => {},
    dropAll: () => {},
    resetGame: () => {},
    onUpdateControls: updateCounter.fn,
  });

  assert.equal(controller.togglePause(), false);
  assert.equal(state.paused, false);

  state.mode = "playing";
  assert.equal(controller.togglePause(), true);
  assert.equal(state.paused, true);

  state.winner = { t: 1 };
  assert.equal(controller.togglePause(), false);
  assert.equal(state.paused, true);

  assert.equal(updateCounter.calls.length, 1);
});
