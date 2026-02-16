import test from "node:test";
import assert from "node:assert/strict";
import { clampResultCount, selectLastFinishers } from "../src/app/ui-selectors.ts";

test("clampResultCount keeps value inside [1, max]", () => {
  assert.equal(clampResultCount(2, 5), 2);
  assert.equal(clampResultCount(0, 5), 1);
  assert.equal(clampResultCount(9, 5), 5);
});

test("selectLastFinishers picks latest finishers and keeps stable tie order", () => {
  const finished = [
    { marbleId: "m1", ballId: "b1", t: 2, slot: 0, label: "A" },
    { marbleId: "m2", ballId: "b2", t: 4, slot: 0, label: "B" },
    { marbleId: "m3", ballId: "b3", t: 4, slot: 0, label: "C" },
    { marbleId: "m4", ballId: "b4", t: 1, slot: 0, label: "D" },
  ];

  const selected = selectLastFinishers(finished, 3, 4);
  assert.deepEqual(
    selected.map((item) => item.marbleId),
    ["m2", "m3", "m1"]
  );
});
