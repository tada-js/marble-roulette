import type { StatusTone } from "./ui-store";

// At 3x caption font, ~28 chars keeps 2-line readability on 900px world width.
export const START_CAPTION_MAX = 28;
export const DEFAULT_START_CAPTION = "두근두근 당첨자는 누구일까요?";
const FINISH_TENSION_TRIGGER_Y_FRAC = 0.82;
const FINISH_TENSION_BASE_SLOWDOWN = 0.72;
const FINISH_TENSION_SLOWDOWN_BY_REMAINING = {
  1: 0.5,
  2: 0.54,
  3: 0.6,
} as const;
const FINISH_TENSION_CAP_BY_REMAINING = {
  1: 0.56,
  2: 0.62,
  3: 0.68,
} as const;

export const STATUS_LABEL_BY_TONE: Record<StatusTone, string> = {
  ready: "준비됨",
  running: "진행 중",
  paused: "일시 정지",
  done: "결과 준비 완료",
};

export type FinishTensionSnapshot = {
  active: boolean;
  remaining: number;
  progress: number;
};

type FinishTensionMarble = {
  done: boolean;
  y: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveStatusTone(state: {
  mode?: string;
  winner?: unknown;
  paused?: boolean;
}): StatusTone {
  if (state.mode !== "playing") return "ready";
  if (state.winner) return "done";
  if (state.paused) return "paused";
  return "running";
}

export function sanitizeBallName(name: unknown, fallback: string): string {
  const value = String(name || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return value || fallback;
}

export function sanitizeStartCaption(value: unknown, maxLength = START_CAPTION_MAX): string {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, maxLength);
}

export function getParticipantCount(totalToDrop: number, totalSelectedCount: number): number {
  const resolvedTotal = totalToDrop > 0 ? Number(totalToDrop) || 1 : Number(totalSelectedCount) || 1;
  return Math.max(1, resolvedTotal);
}

export function getWinnerCountMax(totalToDrop: number, totalSelectedCount: number): number {
  return getParticipantCount(totalToDrop, totalSelectedCount);
}

export function getFinishTensionSnapshot(params: {
  mode: string;
  hasWinner: boolean;
  released: boolean;
  totalToDrop: number;
  finishedCount: number;
  finishTriggerRemaining: number;
  marbles: FinishTensionMarble[];
  worldH: number;
}): FinishTensionSnapshot {
  const {
    mode,
    hasWinner,
    released,
    totalToDrop,
    finishedCount,
    finishTriggerRemaining,
    marbles,
    worldH,
  } = params;

  const inRun = mode === "playing" && !hasWinner && released;
  if (!inRun) return { active: false, remaining: 0, progress: 0 };

  const remaining = Math.max(0, (Number(totalToDrop) || 0) - finishedCount);
  const triggerRemaining = Math.max(1, Number(finishTriggerRemaining) || 3);
  if (remaining <= 0 || remaining > triggerRemaining) {
    return { active: false, remaining, progress: 0 };
  }

  let leaderY = Number.NEGATIVE_INFINITY;
  for (const marble of marbles) {
    if (marble.done) continue;
    if (marble.y > leaderY) leaderY = marble.y;
  }

  if (!Number.isFinite(leaderY)) {
    return { active: false, remaining, progress: 0 };
  }

  const triggerY = worldH * FINISH_TENSION_TRIGGER_Y_FRAC;
  if (leaderY <= triggerY) {
    return { active: false, remaining, progress: 0 };
  }

  const progress = clamp((leaderY - triggerY) / Math.max(1, worldH - triggerY), 0, 1);
  return { active: true, remaining, progress };
}

function toRemainingKey(remaining: number): 1 | 2 | 3 {
  if (remaining <= 1) return 1;
  if (remaining === 2) return 2;
  return 3;
}

export function getFinishTempoMultiplier(baseMultiplier: number, snapshot: FinishTensionSnapshot): number {
  if (!snapshot.active) return baseMultiplier;

  const remainingKey = toRemainingKey(snapshot.remaining);
  const minSlowdown = FINISH_TENSION_SLOWDOWN_BY_REMAINING[remainingKey];
  const slowdown =
    FINISH_TENSION_BASE_SLOWDOWN -
    (FINISH_TENSION_BASE_SLOWDOWN - minSlowdown) * snapshot.progress;
  const cappedByState = FINISH_TENSION_CAP_BY_REMAINING[remainingKey];
  return clamp(Math.min(baseMultiplier * slowdown, cappedByState), 0.5, 3);
}
