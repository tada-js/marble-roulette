import type { FinishedMarble } from "../game/engine.ts";
import { clamp } from "./game-flow-selectors";

export type ArrivalTimingTracker = {
  reset: () => void;
  begin: (startedAtMs: number, initialSimT: number) => void;
  capture: (params: { nowMs: number; simNow: number; finished: FinishedMarble[] }) => void;
  getArrivalSeconds: (entry: FinishedMarble) => number;
};

type TrackerState = {
  finishedAtSecondsByMarbleId: Map<string, number>;
  runStartedAtMs: number;
  prevFrameAtMs: number;
  prevFrameSimT: number;
  seenFinishedCount: number;
};

function createInitialState(): TrackerState {
  return {
    finishedAtSecondsByMarbleId: new Map<string, number>(),
    runStartedAtMs: 0,
    prevFrameAtMs: 0,
    prevFrameSimT: 0,
    seenFinishedCount: 0,
  };
}

export function createArrivalTimingTracker(): ArrivalTimingTracker {
  const state = createInitialState();

  function reset(): void {
    state.finishedAtSecondsByMarbleId.clear();
    state.runStartedAtMs = 0;
    state.prevFrameAtMs = 0;
    state.prevFrameSimT = 0;
    state.seenFinishedCount = 0;
  }

  function begin(startedAtMs: number, initialSimT: number): void {
    state.finishedAtSecondsByMarbleId.clear();
    state.runStartedAtMs = startedAtMs;
    state.prevFrameAtMs = startedAtMs;
    state.prevFrameSimT = initialSimT;
    state.seenFinishedCount = 0;
  }

  function capture(params: { nowMs: number; simNow: number; finished: FinishedMarble[] }): void {
    const { nowMs, simNow, finished } = params;

    if (state.runStartedAtMs <= 0) return;
    if (!finished.length) {
      state.prevFrameAtMs = nowMs;
      state.prevFrameSimT = simNow;
      return;
    }
    if (state.seenFinishedCount >= finished.length) {
      state.prevFrameAtMs = nowMs;
      state.prevFrameSimT = simNow;
      return;
    }

    const simDelta = Math.max(0, simNow - state.prevFrameSimT);
    const wallDeltaMs = Math.max(0, nowMs - state.prevFrameAtMs);
    const fallbackArrivalSeconds = Math.max(0, (nowMs - state.runStartedAtMs) / 1000);

    for (let index = state.seenFinishedCount; index < finished.length; index++) {
      const entry = finished[index];
      let arrivalSeconds = fallbackArrivalSeconds;

      if (simDelta > 1e-6 && wallDeltaMs > 0) {
        const simSinceArrival = Math.max(0, simNow - entry.t);
        const blend = clamp(simSinceArrival / simDelta, 0, 1);
        const estimatedArrivalMs = nowMs - wallDeltaMs * blend;
        arrivalSeconds = Math.max(0, (estimatedArrivalMs - state.runStartedAtMs) / 1000);
      }

      state.finishedAtSecondsByMarbleId.set(entry.marbleId, arrivalSeconds);
    }

    state.seenFinishedCount = finished.length;
    state.prevFrameAtMs = nowMs;
    state.prevFrameSimT = simNow;
  }

  function getArrivalSeconds(entry: FinishedMarble): number {
    const realSeconds = state.finishedAtSecondsByMarbleId.get(entry.marbleId);
    if (typeof realSeconds === "number" && Number.isFinite(realSeconds)) {
      return Math.max(0, realSeconds);
    }
    return Math.max(0, Number(entry.t) || 0);
  }

  return {
    reset,
    begin,
    capture,
    getArrivalSeconds,
  };
}
