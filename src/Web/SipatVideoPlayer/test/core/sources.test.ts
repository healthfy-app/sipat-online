import { describe, expect, it } from 'vitest';
import { availableQualities, chooseSource, createDowngradeWatch, lowerQuality, readQualityPreference, saveQualityPreference, type VideoSource } from '../../src/core/sources';

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

describe('a video in 1080p and 720p (new uploads)', () => {
  const full: VideoSource[] = [{ src: '/1080.mp4', quality: '1080p' }, { src: '/720.mp4', quality: '720p' }];

  it('starts in 1080p on a fast network and without connection information (iPhone)', () => {
    expect(chooseSource(full, 'auto', { effectiveType: '4g', downlink: 10 }).src).toBe('/1080.mp4');
    expect(chooseSource(full, 'auto', null).src).toBe('/1080.mp4');
  });

  it('starts in 720p from 2 to 5 Mbps and on a slow network, the lowest it has', () => {
    expect(chooseSource(full, 'auto', { effectiveType: '4g', downlink: 3 }).src).toBe('/720.mp4');
    expect(chooseSource(full, 'auto', { effectiveType: '3g' }).src).toBe('/720.mp4');
  });

  it('keeps a saved 480p choice possible only where the video has it', () => {
    expect(chooseSource(full, '480p', { effectiveType: '4g', downlink: 10 }).src).toBe('/1080.mp4');
    expect(chooseSource(full, '1080p', { effectiveType: '2g' }).src).toBe('/1080.mp4');
  });

  it('lists and steps down through the versions it has', () => {
    expect(availableQualities(full)).toEqual(['1080p', '720p']);
    expect(lowerQuality(full, '1080p')).toBe('720p');
    expect(lowerQuality(full, '720p')).toBeNull();
    expect(lowerQuality(both, '720p')).toBe('480p');
  });

  it('steps down once from each version, never below the bottom one', () => {
    const watch = createDowngradeWatch({ bottom: '720p' });
    expect(watch.recordStall(0, '1080p')).toBe(false);
    expect(watch.recordStall(1_000, '1080p')).toBe(true);
    expect(watch.recordStall(2_000, '720p')).toBe(false);
    expect(watch.recordStall(3_000, '720p')).toBe(false);
  });

  it('goes from 1080p to 720p to 480p when a video has all three', () => {
    const watch = createDowngradeWatch();
    expect(watch.recordStall(0, '1080p')).toBe(false);
    expect(watch.recordStall(1_000, '1080p')).toBe(true);
    expect(watch.recordStall(2_000, '720p')).toBe(false);
    expect(watch.recordStall(3_000, '720p')).toBe(true);
    expect(watch.recordStall(4_000, '480p')).toBe(false);
    expect(watch.recordStall(5_000, '480p')).toBe(false);
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
