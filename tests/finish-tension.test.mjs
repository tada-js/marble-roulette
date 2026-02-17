import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFinishTriggerRemaining,
  resolveFinishTriggerRemaining,
} from "../src/game/finish-tension.ts";

test("computeFinishTriggerRemaining scales by participant/winner counts", () => {
  assert.equal(computeFinishTriggerRemaining(10, 1), 4);
  assert.equal(computeFinishTriggerRemaining(20, 1), 6);
  assert.equal(computeFinishTriggerRemaining(30, 1), 7);
  assert.equal(computeFinishTriggerRemaining(30, 3), 9);
  assert.equal(computeFinishTriggerRemaining(50, 5), 10);
});

test("resolveFinishTriggerRemaining respects configured value with clamp", () => {
  assert.equal(resolveFinishTriggerRemaining(6, 20), 6);
  assert.equal(resolveFinishTriggerRemaining(99, 20), 10);
  assert.equal(resolveFinishTriggerRemaining(undefined, 20), 6);
});

