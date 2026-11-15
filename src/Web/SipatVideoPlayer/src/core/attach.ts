import { createCheckpointWatcher, watchCheckpoints, type Checkpoint, type CheckpointWatcher } from './checkpoints';
import { createCoverage } from './coverage';
import type { PlayerErrorKind, PlayerEvent, PlayerEventHandler, SaveReason, WatchedRange } from './events';
import { bounceNativeSeek, clampSeek, enforcedRate, unlockedSeconds, type PlayerRules } from './rules';
import { trackPlaybackQuality, type QualityLabel } from './quality';
import { SAVE_INTERVAL_MS, planSave } from './saveSchedule';
import { createDowngradeWatch, type QualityPreference, type SourceQuality, type VideoSource } from './sources';

export interface AttachOptions {
  /** Opt-in rules. Leave out for free playback (previews); the lesson page passes both. */
  rules?: PlayerRules;
  resumeAt?: number;
  furthest?: number;
  checkpoints?: () => Checkpoint[];
  /** Default true. When false no checkpoint is reported (the markers are only drawn). */
  pauseAtCheckpoints?: boolean;
  /** Default true. */
  reopenOnRewind?: boolean;
  /** The quality being played, for the quality report. Default 'single' (one source). */
  quality?: QualityLabel;
  /** The renditions the viewer can switch between; the one being played is `quality`. */
  sources?: VideoSource[];
  /** With 'auto' (and a 480p to go to) repeated stalls in 720p step down by themselves. */
  preference?: () => QualityPreference;
  onEvent: PlayerEventHandler;
}

export interface AttachedPlayer {
  /** Seconds the viewer may reach (the Scrubber's "unlocked" bar). */
  unlocked(): number;
  /** Applies the seek rule; a blocked jump goes to the unlocked point and reports `seekBlocked`. */
  seekTo(seconds: number): void;
  /** For 'hidden' and 'leave' the quality report goes out first, while the page is still there. */
  requestSave(reason: SaveReason): Promise<boolean>;
  /** Plays another rendition from the same position; the lock and what was watched stay. */
  switchQuality(quality: SourceQuality): void;
  /** Closes the open activity and plays on. */
  resumeAfterActivity(): void;
  /** Checkpoints already fired (the markers drawn as done). */
  firedCheckpoints(): ReadonlySet<string>;
  detach(): void;
}

const toMs = (seconds: number) => Math.floor(seconds * 1000);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const errorKind = (code: number | undefined): PlayerErrorKind => code === 2 ? 'network' : code === 3 ? 'decode' : 'source';

/** Wires a real `<video>` to the pure core: coverage, rules, save schedule, checkpoints and the quality meter. */
export function attachPlayer(video: HTMLVideoElement, options: AttachOptions): AttachedPlayer {
  const rules = options.rules ?? {};
  const coverage = createCoverage(options.furthest ?? 0);
  const watcher: CheckpointWatcher = createCheckpointWatcher({ reopenOnRewind: options.reopenOnRewind ?? true });
  const cleanups: Array<() => void> = [];
  let lastSavedMs = toMs(options.resumeAt ?? 0);
  let activityOpen = false;
  let detached = false;
  let currentQuality: QualityLabel = options.quality ?? 'single';
  // While another file loads, currentTime is 0 and the browser fires events that mean nothing to the viewer.
  let switching: { position: number; resume: boolean; seeking: boolean; timer: ReturnType<typeof setTimeout> | null } | null = null;
  const downgrade = createDowngradeWatch();
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;

  const emit = (event: PlayerEvent) => { if (!detached) return options.onEvent(event); };
  const durationS = () => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const positionS = () => { const duration = durationS(); return switching ? switching.position : clamp(video.currentTime, 0, duration || Infinity); };
  const unlocked = () => {
    const duration = durationS();
    return duration ? unlockedSeconds(rules, coverage.furthestS, video.currentTime, duration) : 0;
  };

  function clampRange(range: WatchedRange | null): WatchedRange | null {
    if (!range) return null;
    const max = durationS() ? toMs(durationS()) : Infinity;
    return { startMs: clamp(range.startMs, 0, max), endMs: clamp(range.endMs, 0, max) };
  }

  /**
   * Saves one at a time, in order, so a slow save never overlaps the next one. The position and the
   * range are taken when the save is asked (a queued save still sends the moment it stands for); with
   * nothing pending the page is asked in the same tick.
   */
  function save(reason: SaveReason, snapshot?: { positionMs: number; range: WatchedRange | null }): Promise<boolean> {
    const positionMs = snapshot ? snapshot.positionMs : toMs(positionS());
    const asked = snapshot ? snapshot.range : coverage.open(positionS());
    const run = async (): Promise<boolean> => {
      if (detached) return true;
      const range = clampRange(asked);
      const plan = planSave({ reason, positionMs, range, lastSavedPositionMs: lastSavedMs });
      if (!plan) return true;
      let saved = false;
      try { saved = (await Promise.resolve(emit({ type: 'save', reason, positionMs: plan.positionMs, range: plan.range }))) === true; } catch { saved = false; }
      if (!saved) return false;
      if (plan.range) {
        coverage.commit(plan.range);
        if (reason !== 'interval') emit({ type: 'range', range: plan.range });
      }
      lastSavedMs = plan.positionMs;
      return true;
    };
    const start = () => run().finally(() => { inFlight -= 1; });
    inFlight += 1;
    const result = inFlight === 1 ? start() : queue.then(start, start);
    queue = result.catch(() => undefined);
    return result;
  }

  const tracker = trackPlaybackQuality(video, {
    quality: currentQuality,
    onStall: () => {
      if (options.preference?.() !== 'auto' || currentQuality !== '720p') return;
      if (downgrade.recordStall(performance.now(), '720p')) switchTo('480p', true);
    },
    onReport: (summary, reason) => { emit({ type: 'quality', summary, reason }); },
  });

  function requestSave(reason: SaveReason): Promise<boolean> {
    if (reason === 'hidden' || reason === 'leave') tracker.flush(reason);
    return save(reason);
  }

  const on = <K extends keyof HTMLVideoElementEventMap>(name: K, handler: () => void) => {
    video.addEventListener(name, handler);
    cleanups.push(() => video.removeEventListener(name, handler));
  };

  function finishSwitch(started: NonNullable<typeof switching>) {
    if (switching !== started) return;
    if (started.timer !== null) clearTimeout(started.timer);
    switching = null;
    coverage.onSeeking(started.position); // the range starts again where the viewer was, never at 0
    if (started.resume) void video.play()?.catch(() => undefined);
  }

  function switchTo(quality: SourceQuality, automatic: boolean) {
    if (detached || quality === currentQuality) return;
    const target = options.sources?.find(source => source.quality === quality);
    if (!target) return;
    const started = switching ?? { position: positionS(), resume: !video.paused, seeking: false, timer: null };
    if (!switching) void requestSave('pause'); // takes the range up to here before the file changes
    if (started.timer !== null) clearTimeout(started.timer);
    started.seeking = false; started.timer = null;
    switching = started;
    tracker.setQuality(quality);
    currentQuality = quality;
    video.src = target.src;
    emit({ type: 'qualityChange', quality, automatic });
  }

  const onMetadata = () => {
    if (switching) {
      const started = switching;
      if (rules.fixedSpeed) video.playbackRate = 1;
      if (started.position > 0 && started.position < video.duration) {
        started.seeking = true;
        // some browsers never report the seek: do not stay in the switch forever
        started.timer = setTimeout(() => finishSwitch(started), 3000);
        video.currentTime = started.position;
      } else finishSwitch(started);
      return;
    }
    const resumeAt = options.resumeAt ?? 0;
    if (resumeAt > 0 && resumeAt < video.duration) video.currentTime = resumeAt;
    if (rules.fixedSpeed) video.playbackRate = 1;
  };
  on('loadedmetadata', onMetadata);
  if (video.readyState >= 1) onMetadata(); // metadata may have arrived before we attached
  on('ratechange', () => {
    const rate = enforcedRate(rules, video.playbackRate);
    if (rate !== video.playbackRate) video.playbackRate = rate;
  });
  on('playing', () => { if (switching) return; coverage.onPlaying(video.currentTime); emit({ type: 'playing' }); });
  on('timeupdate', () => {
    if (switching || video.paused || video.seeking) return;
    coverage.onTimeUpdate(clamp(video.currentTime, 0, durationS() || Infinity));
  });
  on('seeking', () => {
    if (switching) return;
    const back = bounceNativeSeek(rules, video.currentTime, coverage.furthestS);
    if (back !== null) {
      video.currentTime = back;
      emit({ type: 'seekBlocked' });
      return;
    }
    const closed = coverage.onSeeking(positionS());
    if (closed) void save('seeked', { positionMs: closed.endMs, range: closed });
  });
  on('seeked', () => {
    if (switching) { if (switching.seeking) finishSwitch(switching); return; }
    void save('seeked');
  });
  on('pause', () => { if (switching) return; emit({ type: 'paused' }); void save('pause'); });
  on('ended', () => { if (switching) return; void save('ended').then(() => { emit({ type: 'ended' }); }); });

  // Capture phase: an error on a <source> child does not bubble to the <video>.
  const onError = (event: Event) => {
    if (event.target !== video) {
      const sources = video.querySelectorAll('source');
      if (event.target !== sources[sources.length - 1]) return;
    }
    emit({ type: 'error', kind: errorKind(video.error?.code) });
  };
  video.addEventListener('error', onError, true);
  cleanups.push(() => video.removeEventListener('error', onError, true));

  const onVisibility = () => { if (document.visibilityState === 'hidden') void requestSave('hidden'); };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  const interval = setInterval(() => { if (!switching) void save('interval'); }, SAVE_INTERVAL_MS);
  cleanups.push(() => clearInterval(interval));

  if (options.pauseAtCheckpoints ?? true) {
    cleanups.push(watchCheckpoints(video, {
      checkpoints: () => switching ? [] : (options.checkpoints ?? (() => []))(),
      reopenOnRewind: options.reopenOnRewind ?? true,
      onDue: checkpoint => { activityOpen = true; video.pause(); emit({ type: 'checkpoint', id: checkpoint.id }); },
    }, watcher));
  }

  return {
    unlocked,
    seekTo(seconds) {
      const duration = durationS();
      if (!duration) return;
      const limit = unlocked();
      const result = clampSeek(seconds, limit);
      if (result.blocked) emit({ type: 'seekBlocked' });
      video.currentTime = clamp(result.seconds, 0, limit);
    },
    requestSave,
    switchQuality: quality => switchTo(quality, false),
    resumeAfterActivity() {
      if (!activityOpen) return;
      activityOpen = false;
      void video.play()?.catch(() => undefined);
    },
    firedCheckpoints: () => watcher.fired(),
    detach() {
      if (detached) return;
      tracker.stop(); // its last report still reaches the page
      if (switching?.timer) clearTimeout(switching.timer);
      detached = true;
      cleanups.forEach(cleanup => cleanup());
    },
  };
}
