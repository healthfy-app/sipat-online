// Measures the quality of one video playback session. Pure TypeScript: no React and no
// imports from the app, so it can move into the player package unchanged.

export type QualityLabel = 'single' | '720p' | '480p';
export type PlaybackDevice = 'phone' | 'tablet' | 'desktop';

export interface PlaybackEnvironment {
  connectionType: 'slow-2g' | '2g' | '3g' | '4g' | null;
  downlinkMbps: number | null;
  device: PlaybackDevice;
  timezoneOffsetMinutes: number;
}

export interface PlaybackQualitySummary {
  id: string;
  lessonId: string;
  playbackSessionId: string;
  startedAt: string;
  timezoneOffsetMinutes: number;
  startupMs: number | null;
  neverStarted: boolean;
  stallCount: number;
  stallMs: number;
  watchedMs: number;
  errorKind: 'network' | 'decode' | 'source' | 'unknown' | null;
  quality: QualityLabel;
  qualitySwitches: number;
  connectionType: PlaybackEnvironment['connectionType'];
  downlinkMbps: number | null;
  device: PlaybackDevice;
}

export type FlushReason = 'interval' | 'paused' | 'ended' | 'hidden' | 'leave' | 'stop';

export interface QualityTracker {
  flush(reason: FlushReason): void;
  stop(): void;
}

const NEVER_STARTED_MS = 30_000;
const INTERVAL_MS = 60_000;
const PAUSED_MS = 30_000;
const MIN_STALL_MS = 500;

// Server-side limits (POST playback-quality).
const MAX_STARTUP_MS = 600_000;
const MAX_STALL_COUNT = 10_000;
const MAX_DURATION_MS = 21_600_000;
const MAX_DOWNLINK = 10_000;
const MAX_TZ = 840;

const CONNECTION_TYPES = ['slow-2g', '2g', '3g', '4g'] as const;

function clampInt(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

export function detectDevice(
  screenWidth: number,
  screenHeight: number,
  touch: boolean,
): PlaybackDevice {
  const min = Math.min(screenWidth, screenHeight);
  if (touch && min < 600) return 'phone';
  if (touch && min < 1100) return 'tablet';
  return 'desktop';
}

export function readPlaybackEnvironment(): PlaybackEnvironment {
  const connection = (
    typeof navigator !== 'undefined'
      ? (navigator as unknown as { connection?: { effectiveType?: unknown; downlink?: unknown } })
          .connection
      : undefined
  );
  const type = connection?.effectiveType;
  const connectionType = (CONNECTION_TYPES as readonly unknown[]).includes(type)
    ? (type as PlaybackEnvironment['connectionType'])
    : null;
  const rawDownlink = connection?.downlink;
  const downlinkMbps =
    typeof rawDownlink === 'number' && Number.isFinite(rawDownlink)
      ? Math.min(MAX_DOWNLINK, Math.max(0, rawDownlink))
      : null;

  const touch =
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
    (typeof window !== 'undefined' && 'ontouchstart' in window);
  const width = typeof window !== 'undefined' ? window.screen?.width ?? 0 : 0;
  const height = typeof window !== 'undefined' ? window.screen?.height ?? 0 : 0;

  const offset = -new Date().getTimezoneOffset();
  return {
    connectionType,
    downlinkMbps,
    device: detectDevice(width, height, touch),
    timezoneOffsetMinutes: Math.min(MAX_TZ, Math.max(-MAX_TZ, Math.round(offset))),
  };
}

function errorKindOf(video: HTMLVideoElement): PlaybackQualitySummary['errorKind'] {
  switch (video.error?.code) {
    case 2:
      return 'network';
    case 3:
      return 'decode';
    case 4:
      return 'source';
    default:
      return 'unknown';
  }
}

export function trackPlaybackQuality(
  video: HTMLVideoElement,
  options: {
    lessonId: string;
    playbackSessionId: string;
    quality: QualityLabel;
    environment?: PlaybackEnvironment;
    onReport: (summary: PlaybackQualitySummary, reason: FlushReason) => void;
  },
): QualityTracker {
  const environment = options.environment ?? readPlaybackEnvironment();
  const id = crypto.randomUUID();

  let stopped = false;
  let startedAt: string | null = null;
  let playRequestedAt = 0;
  let startupMs: number | null = null;
  let hasPlayed = false; // first 'playing' seen
  let neverStarted = false;
  let stallCount = 0;
  let stallMs = 0;
  let watchedMs = 0;
  let playingSince: number | null = null;
  let waitingSince: number | null = null;
  let errorKind: PlaybackQualitySummary['errorKind'] = null;

  let neverStartedTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let pausedTimer: ReturnType<typeof setTimeout> | null = null;

  const now = () => performance.now();

  function clearNeverStarted() {
    if (neverStartedTimer !== null) clearTimeout(neverStartedTimer);
    neverStartedTimer = null;
  }
  function clearInterval_() {
    if (intervalTimer !== null) clearInterval(intervalTimer);
    intervalTimer = null;
  }
  function clearPaused() {
    if (pausedTimer !== null) clearTimeout(pausedTimer);
    pausedTimer = null;
  }

  function closeWatched() {
    if (playingSince !== null) {
      watchedMs += now() - playingSince;
      playingSince = null;
    }
  }

  function buildSummary(): PlaybackQualitySummary {
    const watched = watchedMs + (playingSince !== null ? now() - playingSince : 0);
    return {
      id,
      lessonId: options.lessonId,
      playbackSessionId: options.playbackSessionId,
      startedAt: startedAt ?? new Date().toISOString(),
      timezoneOffsetMinutes: environment.timezoneOffsetMinutes,
      startupMs: startupMs === null ? null : clampInt(startupMs, MAX_STARTUP_MS),
      neverStarted,
      stallCount: clampInt(stallCount, MAX_STALL_COUNT),
      stallMs: clampInt(stallMs, MAX_DURATION_MS),
      watchedMs: clampInt(watched, MAX_DURATION_MS),
      errorKind,
      quality: options.quality,
      qualitySwitches: 0,
      connectionType: environment.connectionType,
      downlinkMbps: environment.downlinkMbps,
      device: environment.device,
    };
  }

  function flush(reason: FlushReason) {
    if (startedAt === null) return; // nothing before the first play
    try {
      options.onReport(buildSummary(), reason);
    } catch {
      // a failing report must never break playback
    }
  }

  function startInterval() {
    if (intervalTimer !== null) return;
    intervalTimer = setInterval(() => flush('interval'), INTERVAL_MS);
  }

  function onPlay() {
    clearPaused();
    if (startedAt !== null) return;
    startedAt = new Date().toISOString();
    playRequestedAt = now();
    neverStartedTimer = setTimeout(() => {
      neverStartedTimer = null;
      if (!hasPlayed) {
        neverStarted = true;
        flush('interval');
      }
    }, NEVER_STARTED_MS);
  }

  function onPlaying() {
    clearPaused();
    if (startedAt === null) return;
    if (!hasPlayed) {
      hasPlayed = true;
      startupMs = now() - playRequestedAt;
      neverStarted = false;
      clearNeverStarted();
    }
    if (waitingSince !== null) {
      const duration = now() - waitingSince;
      waitingSince = null;
      if (duration >= MIN_STALL_MS) {
        stallCount += 1;
        stallMs += duration;
      }
    }
    if (playingSince === null) playingSince = now();
    startInterval();
  }

  function onWaiting() {
    if (!hasPlayed) return;
    closeWatched();
    if (video.seeking) return;
    if (waitingSince === null) waitingSince = now();
  }

  function onPause() {
    if (!hasPlayed || video.ended) return;
    closeWatched();
    waitingSince = null;
    clearInterval_();
    clearPaused();
    pausedTimer = setTimeout(() => {
      pausedTimer = null;
      if (video.paused) flush('paused');
    }, PAUSED_MS);
  }

  function onEnded() {
    if (!hasPlayed) return;
    closeWatched();
    waitingSince = null;
    clearInterval_();
    clearPaused();
    flush('ended');
  }

  function onError() {
    errorKind = errorKindOf(video);
    if (startedAt === null) return;
    if (!hasPlayed) {
      neverStarted = true;
      clearNeverStarted();
    }
    flush('interval');
  }

  const handlers: Array<[string, () => void]> = [
    ['play', onPlay],
    ['playing', onPlaying],
    ['waiting', onWaiting],
    ['pause', onPause],
    ['ended', onEnded],
    ['error', onError],
  ];
  // Never let an exception escape an event handler.
  const guarded = handlers.map(([name, fn]) => {
    const wrapped = () => {
      try {
        fn();
      } catch {
        // ignore
      }
    };
    video.addEventListener(name, wrapped);
    return [name, wrapped] as const;
  });

  return {
    flush(reason) {
      if (stopped) return;
      flush(reason);
    },
    stop() {
      if (stopped) return;
      flush('stop');
      stopped = true;
      for (const [name, wrapped] of guarded) video.removeEventListener(name, wrapped);
      clearNeverStarted();
      clearInterval_();
      clearPaused();
    },
  };
}
