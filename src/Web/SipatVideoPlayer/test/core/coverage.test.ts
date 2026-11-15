import { describe, expect, it } from 'vitest';
import { createCoverage } from '../../src/core/coverage';

describe('coverage', () => {
  it('advances what was watched only while playing continuously', () => {
    const c = createCoverage(0);
    c.onPlaying(0);
    c.onTimeUpdate(3);
    expect(c.furthestS).toBe(3);
  });
  it('starts a new range after a jump of more than five seconds', () => {
    const c = createCoverage(0);
    c.onPlaying(0); c.onTimeUpdate(3); c.onTimeUpdate(9.5);
    expect(c.furthestS).toBe(3);
    expect(c.open(10)).toEqual({ startMs: 9500, endMs: 10000 });
  });
  it('starts a new range when time goes backwards', () => {
    const c = createCoverage(0);
    c.onPlaying(0); c.onTimeUpdate(4); c.onTimeUpdate(2);
    expect(c.open(3)).toEqual({ startMs: 2000, endMs: 3000 });
  });
  it('closes the range at the last sample when seeking', () => {
    const c = createCoverage(0);
    c.onPlaying(0); c.onTimeUpdate(4);
    expect(c.onSeeking(1)).toEqual({ startMs: 0, endMs: 4000 });
    expect(c.open(2)).toEqual({ startMs: 1000, endMs: 2000 });
  });
  it('moves the range start forward only after a successful save', () => {
    const c = createCoverage(0);
    c.onPlaying(0); c.onTimeUpdate(4);
    c.commit({ startMs: 0, endMs: 9000 });
    expect(c.open(10)?.startMs).toBe(9000);
    c.commit({ startMs: 0, endMs: 9500 });
    expect(c.open(10)?.startMs).toBe(9000);
  });
  it('keeps the range when playing resumes near the last sample', () => {
    const c = createCoverage(0);
    c.onPlaying(0); c.onTimeUpdate(3); c.onPlaying(3.2);
    expect(c.open(4)?.startMs).toBe(0);
  });
});
