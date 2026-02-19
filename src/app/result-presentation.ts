import type { FinishedMarble } from "../game/engine.ts";
import type { ResultUiItem } from "./ui-store";

export type ResultPresentationPhase = "idle" | "spinning" | "single" | "summary";

export type ResultPresentationState = {
  open: boolean;
  phase: ResultPresentationPhase;
  requestedCount: number;
  effectiveCount: number;
  items: ResultUiItem[];
};

type WinnerPayload = {
  name?: string;
  img?: string;
} | null;

type BuildResultItemsParams = {
  selected: FinishedMarble[];
  getWinnerPayload: (ballId: string) => WinnerPayload;
  getArrivalTimeSeconds: (entry: FinishedMarble) => number;
};

export function buildIdleResultState(winnerCount: number): ResultPresentationState {
  return {
    open: false,
    phase: "idle",
    requestedCount: winnerCount,
    effectiveCount: 0,
    items: [],
  };
}

export function resolveResultPhase(items: ResultUiItem[]): "single" | "summary" {
  if (items.length === 1) return "single";
  return "summary";
}

export function buildResultStateFromItems(
  items: ResultUiItem[],
  requestedCount: number
): ResultPresentationState {
  if (!items.length) {
    return {
      open: true,
      phase: "summary",
      requestedCount,
      effectiveCount: 0,
      items,
    };
  }

  return {
    open: true,
    phase: "spinning",
    requestedCount,
    effectiveCount: items.length,
    items,
  };
}

export function closeResultPresentation(state: ResultPresentationState): ResultPresentationState {
  if (state.phase === "spinning") {
    return {
      ...state,
      open: false,
      phase: resolveResultPhase(state.items),
    };
  }
  return {
    ...state,
    open: false,
  };
}

export function completeSpinResultPresentation(
  state: ResultPresentationState
): ResultPresentationState {
  if (!state.items.length || state.phase !== "spinning") return state;
  return {
    ...state,
    phase: resolveResultPhase(state.items),
  };
}

export function buildResultItems(params: BuildResultItemsParams): ResultUiItem[] {
  const { selected, getWinnerPayload, getArrivalTimeSeconds } = params;
  return selected.map((entry, idx) => {
    const payload = getWinnerPayload(entry.ballId);
    return {
      rank: idx + 1,
      ballId: entry.ballId,
      name: payload?.name || entry.ballId || "알 수 없는 공",
      img: payload?.img || "",
      finishedAt: getArrivalTimeSeconds(entry),
      slot: entry.slot,
      label: entry.label,
    };
  });
}
