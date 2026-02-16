import type { FinishedMarble } from "../game/engine.ts";

export function clampResultCount(requested: number, max: number): number {
  const safeMax = Math.max(1, Math.floor(Number(max) || 1));
  const safeRequested = Math.floor(Number(requested) || 1);
  return Math.max(1, Math.min(safeMax, safeRequested));
}

export function selectLastFinishers(
  finished: FinishedMarble[],
  requestedCount: number,
  totalToDrop: number
): FinishedMarble[] {
  if (!Array.isArray(finished) || !finished.length || totalToDrop <= 0) return [];
  const effective = clampResultCount(requestedCount, totalToDrop);

  return finished
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (b.entry.t !== a.entry.t) return b.entry.t - a.entry.t;
      return a.index - b.index;
    })
    .slice(0, effective)
    .map((x) => x.entry);
}
