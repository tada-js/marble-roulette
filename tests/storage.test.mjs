import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BALLS } from "../src/game/assets.ts";
import {
  loadBallsCatalog,
  saveBallsCatalog,
  restoreDefaultBalls,
  loadBallCounts,
  saveBallCounts,
} from "../src/ui/storage.js";

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

test.beforeEach(() => {
  globalThis.localStorage = makeStorage();
});

test("loadBallsCatalog falls back to defaults for invalid payload", () => {
  localStorage.setItem("marble-roulette:balls:v1", "{not-json");
  const balls = loadBallsCatalog();
  assert.equal(Array.isArray(balls), true);
  assert.equal(balls.length, DEFAULT_BALLS.length);
});

test("save/load ball counts clamps values to supported range", () => {
  const catalog = [
    { id: "dog", name: "강아지", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" },
    { id: "cat", name: "고양이", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" },
  ];

  saveBallCounts({ dog: -10, cat: 150 });
  const counts = loadBallCounts(catalog);

  assert.equal(counts.dog, 1);
  assert.equal(counts.cat, 99);
});

test("restoreDefaultBalls removes custom catalog from storage", () => {
  const custom = [{ id: "x", name: "테스트", imageDataUrl: "data:image/svg+xml;utf8,<svg/>", tint: "#fff" }];
  saveBallsCatalog(custom);
  assert.equal(loadBallsCatalog().length, 1);

  const restored = restoreDefaultBalls();
  assert.equal(restored.length, DEFAULT_BALLS.length);
  assert.equal(loadBallsCatalog().length, DEFAULT_BALLS.length);
});
