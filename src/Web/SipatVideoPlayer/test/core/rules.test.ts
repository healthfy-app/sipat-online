import { describe, expect, it } from 'vitest';
import { bounceNativeSeek, clampSeek, enforcedRate, unlockedSeconds } from '../../src/core/rules';

describe('rules', () => {
  it('blocks a seek beyond what was unlocked', () => {
    expect(clampSeek(40, 12)).toEqual({ seconds: 12, blocked: true });
    expect(clampSeek(12.2, 12)).toEqual({ seconds: 12.2, blocked: false });
  });
  it('unlocks the whole video without the watch-in-order rule', () => {
    expect(unlockedSeconds({}, 5, 6, 100)).toBe(100);
    expect(unlockedSeconds({ watchInOrder: true }, 5, 6, 100)).toBe(6);
    expect(unlockedSeconds({ watchInOrder: true }, 5, 500, 100)).toBe(100);
  });
  it('sends a native seek back to what was watched', () => {
    expect(bounceNativeSeek({ watchInOrder: true }, 40, 2.4)).toBe(2.4);
    expect(bounceNativeSeek({ watchInOrder: true }, 3, 2.4)).toBeNull();
    expect(bounceNativeSeek({}, 40, 2.4)).toBeNull();
  });
  it('keeps the speed at 1x when the rule is on', () => {
    expect(enforcedRate({ fixedSpeed: true }, 2)).toBe(1);
    expect(enforcedRate({}, 2)).toBe(2);
  });
});
