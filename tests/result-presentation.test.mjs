import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIdleResultState,
  buildResultItems,
  buildResultStateFromItems,
  closeResultPresentation,
  completeSpinResultPresentation,
} from "../src/app/result-presentation.ts";

test("result state helpers handle idle -> spinning -> summary/single flow", () => {
  const idle = buildIdleResultState(2);
  assert.deepEqual(idle, {
    open: false,
    phase: "idle",
    requestedCount: 2,
    effectiveCount: 0,
    items: [],
  });

  const oneItem = [
    { rank: 1, ballId: "b1", name: "강", img: "", finishedAt: 1.2, slot: 0, label: "1" },
  ];
  const spinning = buildResultStateFromItems(oneItem, 2);
  assert.equal(spinning.phase, "spinning");
  assert.equal(spinning.open, true);
  assert.equal(spinning.effectiveCount, 1);

  const completed = completeSpinResultPresentation(spinning);
  assert.equal(completed.phase, "single");

  const closed = closeResultPresentation(spinning);
  assert.equal(closed.open, false);
  assert.equal(closed.phase, "single");
});

test("buildResultItems maps winners with payload and arrival time", () => {
  const selected = [
    { marbleId: "m2", ballId: "rabbit", t: 4.2, slot: 0, label: "A" },
    { marbleId: "m1", ballId: "dog", t: 3.2, slot: 1, label: "B" },
  ];

  const items = buildResultItems({
    selected,
    getWinnerPayload: (ballId) => {
      if (ballId === "rabbit") return { name: "토끼", img: "rabbit.png" };
      if (ballId === "dog") return { name: "강아지", img: "dog.png" };
      return null;
    },
    getArrivalTimeSeconds: (entry) => (entry.marbleId === "m2" ? 5.5 : 4.4),
  });

  assert.deepEqual(
    items.map((item) => ({
      rank: item.rank,
      name: item.name,
      finishedAt: item.finishedAt,
    })),
    [
      { rank: 1, name: "토끼", finishedAt: 5.5 },
      { rank: 2, name: "강아지", finishedAt: 4.4 },
    ]
  );
});
