import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectDevice,
  readPlaybackEnvironment,
  trackPlaybackQuality,
  type FlushReason,
  type PlaybackEnvironment,
  type PlaybackQualitySummary,
} from './quality';

const env: PlaybackEnvironment = {
  connectionType: '4g',
  downlinkMbps: 10,
  device: 'desktop',
  timezoneOffsetMinutes: -180,
};

function setup() {
  const video = document.createElement('video');
  const reports: Array<{ s: PlaybackQualitySummary; reason: FlushReason }> = [];
  const tracker = trackPlaybackQuality(video, {
    lessonId: 'lesson-1',
    playbackSessionId: 'session-1',
    quality: '720p',
    environment: env,
    onReport: (s, reason) => reports.push({ s, reason }),
  });
  const fire = (name: string) => video.dispatchEvent(new Event(name));
  const last = () => reports[reports.length - 1];
  return { video, reports, tracker, fire, last };
}

describe('trackPlaybackQuality', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-14T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('fake timers mock performance.now and Date', () => {
    const t0 = performance.now();
    vi.advanceTimersByTime(1000);
    expect(performance.now() - t0).toBe(1000);
    expect(new Date().toISOString()).toBe('2026-11-14T12:00:01.000Z');
  });

  it('measures startup from play to playing', () => {
    const { fire, tracker, last } = setup();
    fire('play');
    vi.advanceTimersByTime(1200);
    fire('playing');
    tracker.flush('leave');
    expect(last().s.startupMs).toBe(1200);
    expect(last().s.neverStarted).toBe(false);
    expect(last().s.startedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(last().s.lessonId).toBe('lesson-1');
    expect(last().s.playbackSessionId).toBe('session-1');
    expect(last().s.quality).toBe('720p');
    expect(last().s.timezoneOffsetMinutes).toBe(-180);
    expect(last().s.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('counts a stall only after playback started and when it lasts 500 ms', () => {
    const { fire, tracker, last } = setup();
    fire('waiting'); // before first playing: ignored
    fire('play');
    fire('playing');
    fire('waiting');
    vi.advanceTimersByTime(400);
    fire('playing');
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(0);
    expect(last().s.stallMs).toBe(0);
    fire('waiting');
    vi.advanceTimersByTime(800);
    fire('playing');
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(1);
    expect(last().s.stallMs).toBe(800);
    expect(last().s.watchedMs).toBe(0);
  });

  it('counts a stall that is still open at flush without double counting it later', () => {
    const { fire, tracker, last } = setup();
    fire('play');
    fire('playing');
    fire('waiting');
    vi.advanceTimersByTime(2000);
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(1);
    expect(last().s.stallMs).toBeGreaterThanOrEqual(2000);
    fire('playing');
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(1);
    expect(last().s.stallMs).toBeGreaterThanOrEqual(2000);
    expect(last().s.stallMs).toBeLessThan(2100);
  });

  it('does not report an open stall shorter than 500 ms', () => {
    const { fire, tracker, last } = setup();
    fire('play');
    fire('playing');
    fire('waiting');
    vi.advanceTimersByTime(300);
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(0);
    expect(last().s.stallMs).toBe(0);
  });

  it('does not count waiting while seeking', () => {
    const { video, fire, tracker, last } = setup();
    fire('play');
    fire('playing');
    Object.defineProperty(video, 'seeking', { value: true, configurable: true });
    fire('waiting');
    vi.advanceTimersByTime(2000);
    fire('playing');
    tracker.flush('leave');
    expect(last().s.stallCount).toBe(0);
  });

  it('marks never started after 30 seconds without playing and reports it', () => {
    const { fire, reports, last } = setup();
    fire('play');
    vi.advanceTimersByTime(29_999);
    expect(reports).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(reports).toHaveLength(1);
    expect(last().reason).toBe('interval');
    expect(last().s.neverStarted).toBe(true);
    expect(last().s.startupMs).toBeNull();
  });

  it('reports every 60 seconds while playing, 30 seconds after a pause, and on ended', () => {
    const { video, fire, reports, last } = setup();
    fire('play');
    fire('playing');
    vi.advanceTimersByTime(60_000);
    expect(reports.map((r) => r.reason)).toEqual(['interval']);
    expect(last().s.watchedMs).toBe(60_000);
    Object.defineProperty(video, 'paused', { value: true, configurable: true });
    fire('pause');
    vi.advanceTimersByTime(29_999);
    expect(reports).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(reports.map((r) => r.reason)).toEqual(['interval', 'paused']);
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    fire('playing');
    vi.advanceTimersByTime(5000);
    fire('ended');
    expect(last().reason).toBe('ended');
    expect(last().s.watchedMs).toBe(65_000);
    vi.advanceTimersByTime(120_000);
    expect(reports).toHaveLength(3);
  });

  it('does not report a pause that was resumed', () => {
    const { fire, reports } = setup();
    fire('play');
    fire('playing');
    fire('pause');
    vi.advanceTimersByTime(10_000);
    fire('play');
    fire('playing');
    vi.advanceTimersByTime(20_000);
    expect(reports).toHaveLength(0);
  });

  it('reports nothing before the first play for non-error events', () => {
    const { fire, tracker, reports } = setup();
    fire('loadedmetadata');
    fire('waiting');
    fire('pause');
    tracker.flush('leave');
    tracker.stop();
    vi.advanceTimersByTime(200_000);
    expect(reports).toHaveLength(0);
  });

  it('an error before the first play starts the session and reports it', () => {
    const { video, fire, reports, last } = setup();
    vi.advanceTimersByTime(5000);
    Object.defineProperty(video, 'error', { value: { code: 4 }, configurable: true });
    fire('error');
    expect(reports).toHaveLength(1);
    expect(last().reason).toBe('interval');
    expect(last().s.neverStarted).toBe(true);
    expect(last().s.errorKind).toBe('source');
    expect(last().s.startedAt).toBe('2026-11-14T12:00:05.000Z');
    vi.advanceTimersByTime(60_000);
    expect(reports).toHaveLength(1);
  });

  it('reports a video that already has an error when the tracker is created', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'error', { value: { code: 3 }, configurable: true });
    const reports: PlaybackQualitySummary[] = [];
    trackPlaybackQuality(video, {
      lessonId: 'l',
      playbackSessionId: 's',
      quality: 'single',
      environment: env,
      onReport: (s) => reports.push(s),
    });
    expect(reports).toHaveLength(1);
    expect(reports[0].neverStarted).toBe(true);
    expect(reports[0].errorKind).toBe('decode');
  });

  it('treats a video that is already playing as if play just fired', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    const reports: Array<{ s: PlaybackQualitySummary; reason: FlushReason }> = [];
    const tracker = trackPlaybackQuality(video, {
      lessonId: 'l',
      playbackSessionId: 's',
      quality: 'single',
      environment: env,
      onReport: (s, reason) => reports.push({ s, reason }),
    });
    vi.advanceTimersByTime(800);
    video.dispatchEvent(new Event('playing'));
    vi.advanceTimersByTime(60_000);
    expect(reports).toHaveLength(1);
    expect(reports[0].s.startedAt).toBe('2026-11-14T12:00:00.000Z');
    expect(reports[0].s.startupMs).toBe(800);
    tracker.stop();
    expect(reports[1].reason).toBe('stop');
  });

  it('works without crypto.randomUUID', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const { fire, tracker, last } = setup();
      fire('play');
      tracker.flush('leave');
      expect(last().s.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it.each([
    [2, 'network'],
    [3, 'decode'],
    [4, 'source'],
    [1, 'unknown'],
    [99, 'unknown'],
  ])('reads the error kind from media error code %i', (code, kind) => {
    const { video, fire, last, reports } = setup();
    fire('play');
    Object.defineProperty(video, 'error', { value: { code }, configurable: true });
    fire('error');
    expect(last().s.errorKind).toBe(kind);
    expect(last().s.neverStarted).toBe(true);
    expect(reports).toHaveLength(1);
  });

  it('stop reports once and removes its listeners', () => {
    const { fire, tracker, reports } = setup();
    fire('play');
    fire('playing');
    vi.advanceTimersByTime(1000);
    tracker.stop();
    expect(reports).toHaveLength(1);
    expect(reports[0].reason).toBe('stop');
    tracker.stop();
    fire('waiting');
    fire('ended');
    vi.advanceTimersByTime(300_000);
    expect(reports).toHaveLength(1);
  });

  it('survives a throwing onReport', () => {
    const video = document.createElement('video');
    const tracker = trackPlaybackQuality(video, {
      lessonId: 'l',
      playbackSessionId: 's',
      quality: 'single',
      environment: env,
      onReport: () => {
        throw new Error('boom');
      },
    });
    video.dispatchEvent(new Event('play'));
    video.dispatchEvent(new Event('playing'));
    expect(() => video.dispatchEvent(new Event('ended'))).not.toThrow();
    expect(() => tracker.stop()).not.toThrow();
  });

  it('keeps the summary inside the server ranges', () => {
    const { fire, tracker, last } = setup();
    fire('play');
    fire('playing');
    vi.advanceTimersByTime(7 * 3600 * 1000);
    tracker.flush('leave');
    expect(last().s.watchedMs).toBe(21_600_000);
    expect(Number.isInteger(last().s.startupMs)).toBe(true);
  });
});

describe('detectDevice', () => {
  it('classifies phones, tablets and desktops', () => {
    expect(detectDevice(390, 844, true)).toBe('phone');
    expect(detectDevice(820, 1180, true)).toBe('tablet');
    expect(detectDevice(1440, 900, false)).toBe('desktop');
    expect(detectDevice(1920, 1200, true)).toBe('desktop');
  });
});

describe('readPlaybackEnvironment', () => {
  it('works without navigator.connection', () => {
    const e = readPlaybackEnvironment();
    expect(e.connectionType).toBeNull();
    expect(e.downlinkMbps).toBeNull();
    expect(e.timezoneOffsetMinutes).toBe(-new Date().getTimezoneOffset());
    expect(['phone', 'tablet', 'desktop']).toContain(e.device);
  });

  it('reads and validates navigator.connection', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '3g', downlink: 1.5 },
      configurable: true,
    });
    expect(readPlaybackEnvironment()).toMatchObject({ connectionType: '3g', downlinkMbps: 1.5 });
    Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: 'wifi', downlink: Infinity },
      configurable: true,
    });
    expect(readPlaybackEnvironment()).toMatchObject({ connectionType: null, downlinkMbps: null });
    delete (navigator as unknown as Record<string, unknown>).connection;
  });
});
