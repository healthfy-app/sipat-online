import type { SaveReason, WatchedRange } from './events';

export const SAVE_INTERVAL_MS = 10_000;
export const MIN_INTERVAL_RANGE_MS = 8_000;

export function planSave(input: {
  reason: SaveReason; positionMs: number; range: WatchedRange | null; lastSavedPositionMs: number;
}): { positionMs: number; range: WatchedRange | null } | null {
  const force = input.reason !== 'interval';
  const threshold = force ? 1 : 1000;
  const { positionMs, range } = input;
  const hasRange = range !== null && range.endMs - range.startMs >= threshold;
  const positionChanged = Math.abs(positionMs - input.lastSavedPositionMs) >= threshold;
  if (!hasRange && !positionChanged) return null;
  if (!force && hasRange && range!.endMs - range!.startMs < MIN_INTERVAL_RANGE_MS) return null;
  return { positionMs, range: hasRange ? range : null };
}
