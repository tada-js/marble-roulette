import test from "node:test";
import assert from "node:assert/strict";
import { createAudioController } from "../src/ui/audio-controller.js";

function makeStorage() {
  const db = new Map();
  return {
    getItem(key) {
      return db.has(key) ? db.get(key) : null;
    },
    setItem(key, value) {
      db.set(key, String(value));
    },
    removeItem(key) {
      db.delete(key);
    },
    clear() {
      db.clear();
    },
  };
}

class FakeAudio {
  /** @type {FakeAudio[]} */
  static instances = [];

  /**
   * @param {string} src
   */
  constructor(src) {
    this.src = src;
    this.preload = "";
    this.loop = false;
    this.volume = 1;
    this.currentTime = 0;
    this.readyState = 4;
    this.paused = true;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.loadCalls = 0;
    this._listeners = new Map();
    FakeAudio.instances.push(this);
  }

  /**
   * @param {string} type
   * @param {() => void} handler
   */
  addEventListener(type, handler) {
    this._listeners.set(type, handler);
  }

  /**
   * @param {string} type
   * @param {() => void} handler
   */
  removeEventListener(type, handler) {
    const current = this._listeners.get(type);
    if (current === handler) this._listeners.delete(type);
  }

  load() {
    this.loadCalls += 1;
    this.readyState = 4;
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
  }

  async play() {
    this.playCalls += 1;
    this.paused = false;
  }

  /**
   * @param {string} type
   */
  emit(type) {
    const handler = this._listeners.get(type);
    if (typeof handler === "function") handler();
  }
}

const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalAudio = globalThis.Audio;

test.beforeEach(() => {
  FakeAudio.instances = [];
  globalThis.localStorage = makeStorage();
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.Audio = FakeAudio;
});

test.afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.localStorage = originalLocalStorage;
  globalThis.Audio = originalAudio;
});

test("setTrack while bgm on disposes previous audio and avoids dual playback", async () => {
  const controller = createAudioController();

  controller.setOn(true, { autoplay: true });
  await Promise.resolve();

  assert.equal(FakeAudio.instances.length, 1);
  const first = FakeAudio.instances[0];
  assert.equal(first.playCalls, 1);

  controller.setTrack("bgm_2", { autoplay: true });
  await Promise.resolve();

  assert.equal(controller.getTrack(), "bgm_2");
  assert.equal(FakeAudio.instances.length, 2);
  const second = FakeAudio.instances[1];

  assert.equal(first.pauseCalls > 0, true);
  assert.equal(second.playCalls, 1);

  const firstPlayCalls = first.playCalls;
  first.emit("error");
  await Promise.resolve();

  // Old track must stay silent even if stale events fire.
  assert.equal(first.playCalls, firstPlayCalls);
  assert.equal(second.playCalls, 1);
});
