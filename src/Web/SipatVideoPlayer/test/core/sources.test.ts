import { describe, expect, it } from 'vitest';
import { chooseSource, createDowngradeWatch, readQualityPreference, saveQualityPreference, type VideoSource } from '../../src/core/sources';

const both: VideoSource[] = [{ src: '/720.mp4', quality: '720p' }, { src: '/480.mp4', quality: '480p' }];
const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };

describe('chooseSource', () => {
  it('keeps the only source', () => {
    const only = [{ src: '/a.mp4' }];
    expect(chooseSource(only, '480p', { effectiveType: '2g' })).toBe(only[0]);
  });

  it('uses the saved preference when that quality exists', () => {
    expect(chooseSource(both, '480p', { effectiveType: '4g', downlink: 10 }).src).toBe('/480.mp4');
    expect(chooseSource(both, '720p', { effectiveType: '2g' }).src).toBe('/720.mp4');
    expect(chooseSource([both[0], { src: '/x.mp4' }], '480p', null).src).toBe('/720.mp4');
  });

  it('starts in 480p on 2g, 3g or less than 2 Mbps', () => {
    expect(chooseSource(both, 'auto', { effectiveType: '3g' }).src).toBe('/480.mp4');
    expect(chooseSource(both, 'auto', { effectiveType: 'slow-2g' }).src).toBe('/480.mp4');
    expect(chooseSource(both, 'auto', { effectiveType: '4g', downlink: 1.5 }).src).toBe('/480.mp4');
    expect(chooseSource(both, 'auto', { effectiveType: '4g', downlink: 10 }).src).toBe('/720.mp4');
  });

  it('starts in 720p without connection information', () => {
    expect(chooseSource(both, 'auto', null).src).toBe('/720.mp4');
  });

  it('falls back to the first source when the chosen quality is missing', () => {
    const odd = [{ src: '/a.mp4' }, { src: '/b.mp4' }];
    expect(chooseSource(odd, 'auto', null).src).toBe('/a.mp4');
  });
});

describe('quality preference', () => {
  it('falls back to automatic when storage throws', () => {
    expect(readQualityPreference(throwing)).toBe('auto');
    expect(() => saveQualityPreference('480p', throwing)).not.toThrow();
  });

  it('reads back what was saved and ignores strange values', () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
    saveQualityPreference('480p', storage);
    expect(readQualityPreference(storage)).toBe('480p');
    value = 'hd';
    expect(readQualityPreference(storage)).toBe('auto');
  });
});

describe('createDowngradeWatch', () => {
  it('steps down after two stalls within 60 seconds, once', () => {
    const watch = createDowngradeWatch();
    expect(watch.recordStall(0, '720p')).toBe(false);
    expect(watch.recordStall(59_000, '720p')).toBe(true);
    expect(watch.recordStall(60_000, '720p')).toBe(false);
    expect(watch.recordStall(61_000, '720p')).toBe(false);
  });

  it('ignores stalls further apart than 60 seconds', () => {
    const watch = createDowngradeWatch();
    expect(watch.recordStall(0, '720p')).toBe(false);
    expect(watch.recordStall(61_000, '720p')).toBe(false);
  });

  it('only counts stalls in 720p', () => {
    const watch = createDowngradeWatch();
    expect(watch.recordStall(0, '480p')).toBe(false);
    expect(watch.recordStall(1_000, '480p')).toBe(false);
    expect(watch.recordStall(2_000, undefined)).toBe(false);
  });
});
