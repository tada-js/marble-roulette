import test from "node:test";
import assert from "node:assert/strict";
import { createControlPanelController } from "../src/ui/control-panel-controller.js";

function makeButton() {
  return {
    disabled: false,
    textContent: "",
    attrs: new Map(),
    setAttribute(key, value) {
      this.attrs.set(key, value);
    },
  };
}

test("control panel reflects playing/pause state", () => {
  const startBtn = makeButton();
  const pauseBtn = makeButton();
  const viewLockEl = { disabled: false, checked: false };
  const state = { mode: "playing", winner: null, released: true, paused: false };
  const viewState = { tailFocusOn: true };

  const controller = createControlPanelController({
    startBtn,
    pauseBtn,
    viewLockEl,
    state,
    viewState,
    renderer: { getViewState: () => ({ cameraY: 0 }) },
    getTotalSelectedCount: () => 3,
  });

  controller.updateControls();
  assert.equal(startBtn.disabled, false);
  assert.equal(startBtn.textContent, "게임 재시작");
  assert.equal(pauseBtn.disabled, false);
  assert.equal(pauseBtn.textContent, "일시정지");
  assert.equal(pauseBtn.attrs.get("aria-pressed"), "false");
  assert.equal(viewLockEl.disabled, false);
  assert.equal(viewLockEl.checked, true);

  state.paused = true;
  controller.updateControls();
  assert.equal(pauseBtn.textContent, "이어하기");
  assert.equal(pauseBtn.attrs.get("aria-pressed"), "true");
});

test("control panel disables start when nothing is selected", () => {
  const startBtn = makeButton();
  const pauseBtn = makeButton();

  const controller = createControlPanelController({
    startBtn,
    pauseBtn,
    viewLockEl: null,
    state: { mode: "menu", winner: null, paused: false },
    viewState: { tailFocusOn: false },
    renderer: {},
    getTotalSelectedCount: () => 0,
  });

  controller.updateControls();
  assert.equal(startBtn.disabled, true);
  assert.equal(startBtn.textContent, "게임 시작");
  assert.equal(pauseBtn.disabled, true);
});
