import type { WatchedRange } from './events';

export interface Coverage {
  readonly furthestS: number;
  onPlaying(currentS: number): void;
  onTimeUpdate(currentS: number): void;
  onSeeking(currentS: number): WatchedRange | null;
  open(positionS: number): WatchedRange | null;
  commit(range: WatchedRange): void;
}

const ms = (s: number) => Math.floor(s * 1000);

export function createCoverage(furthestS: number): Coverage {
  let furthest = furthestS;
  let startMs: number | null = null;
  let lastSample: number | null = null;

  return {
    get furthestS() { return furthest; },
    onPlaying(currentS) {
      if (startMs === null || lastSample === null || Math.abs(currentS - lastSample) > 0.5)
        startMs = ms(currentS);
      lastSample = currentS;
    },
    onTimeUpdate(currentS) {
      if (lastSample === null) {
        startMs = ms(currentS);
        lastSample = currentS;
        return;
      }
      if (currentS < lastSample || currentS - lastSample > 5) startMs = ms(currentS);
      else if (currentS > furthest) furthest = currentS;
      lastSample = currentS;
    },
    onSeeking(currentS) {
      const closed = lastSample !== null && startMs !== null
        ? { startMs, endMs: ms(lastSample) } : null;
      startMs = ms(currentS);
      lastSample = currentS;
      return closed;
    },
    open(positionS) {
      return startMs === null ? null : { startMs, endMs: ms(positionS) };
    },
    commit(range) {
      if (startMs === range.startMs) startMs = range.endMs;
    },
  };
}
