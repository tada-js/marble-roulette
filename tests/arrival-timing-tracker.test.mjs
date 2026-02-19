import test from "node:test";
import assert from "node:assert/strict";
import { createArrivalTimingTracker } from "../src/app/arrival-timing-tracker.ts";

test("arrival timing tracker estimates arrival time and falls back safely", () => {
  const tracker = createArrivalTimingTracker();
  const entry = { marbleId: "m1", ballId: "b1", t: 1, slot: 0, label: "A" };

  tracker.capture({
    nowMs: 1300,
    simNow: 0.2,
    finished: [entry],
  });
  assert.equal(tracker.getArrivalSeconds(entry), 1);

  tracker.begin(1000, 0);
  tracker.capture({
    nowMs: 2500,
    simNow: 1,
    finished: [entry],
  });

  assert.equal(Math.round(tracker.getArrivalSeconds(entry) * 10) / 10, 1.5);

  tracker.reset();
  assert.equal(tracker.getArrivalSeconds(entry), 1);
});
