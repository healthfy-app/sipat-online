import { describe, expect, it } from 'vitest';
import { MIN_INTERVAL_RANGE_MS, SAVE_INTERVAL_MS, planSave } from '../../src/core/saveSchedule';

describe('saveSchedule', () => {
  it('exposes the timings', () => {
    expect(SAVE_INTERVAL_MS).toBe(10000);
    expect(MIN_INTERVAL_RANGE_MS).toBe(8000);
  });
  it('skips interval saves until the range reaches 8 seconds', () => {
    expect(planSave({ reason: 'interval', positionMs: 5000, range: { startMs: 0, endMs: 5000 }, lastSavedPositionMs: 0 })).toBeNull();
    expect(planSave({ reason: 'interval', positionMs: 9000, range: { startMs: 0, endMs: 9000 }, lastSavedPositionMs: 0 }))
      .toEqual({ positionMs: 9000, range: { startMs: 0, endMs: 9000 } });
  });
  it('saves any range when forced', () => {
    expect(planSave({ reason: 'pause', positionMs: 5000, range: { startMs: 4700, endMs: 5000 }, lastSavedPositionMs: 0 }))
      .toEqual({ positionMs: 5000, range: { startMs: 4700, endMs: 5000 } });
  });
  it('saves only the position when there is no range', () => {
    expect(planSave({ reason: 'seeked', positionMs: 1000, range: null, lastSavedPositionMs: 4000 }))
      .toEqual({ positionMs: 1000, range: null });
  });
  it('does nothing when nothing changed', () => {
    expect(planSave({ reason: 'interval', positionMs: 4000, range: null, lastSavedPositionMs: 4000 })).toBeNull();
  });
  it('drops a range too short to count but keeps a moved position', () => {
    expect(planSave({ reason: 'interval', positionMs: 3000, range: { startMs: 2500, endMs: 3000 }, lastSavedPositionMs: 0 }))
      .toEqual({ positionMs: 3000, range: null });
  });
});
