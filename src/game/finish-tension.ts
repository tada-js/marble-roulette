const FINISH_TRIGGER_MIN_REMAINING = 4;
const FINISH_TRIGGER_MAX_REMAINING = 10;
const PARTICIPANT_FACTOR = 1.2;
const WINNER_FACTOR = 0.7;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Compute dynamic finish trigger threshold.
 *
 * Formula:
 * round(sqrt(participantCount) * 1.2 + winnerCount * 0.7), clamped to [4, 10]
 */
export function computeFinishTriggerRemaining(
  participantCount: number,
  winnerCount: number
): number {
  const participants = Math.max(1, Number.isFinite(participantCount) ? Math.floor(participantCount) : 1);
  const winners = Math.max(1, Number.isFinite(winnerCount) ? Math.floor(winnerCount) : 1);
  const raw = Math.sqrt(participants) * PARTICIPANT_FACTOR + winners * WINNER_FACTOR;
  return clampInt(raw, FINISH_TRIGGER_MIN_REMAINING, FINISH_TRIGGER_MAX_REMAINING);
}

export function resolveFinishTriggerRemaining(
  configuredRemaining: unknown,
  fallbackParticipantCount: number
): number {
  const parsed = Number(configuredRemaining);
  if (Number.isFinite(parsed) && parsed > 0) {
    return clampInt(parsed, FINISH_TRIGGER_MIN_REMAINING, FINISH_TRIGGER_MAX_REMAINING);
  }
  return computeFinishTriggerRemaining(fallbackParticipantCount, 1);
}

