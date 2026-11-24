import { createCoverage } from './coverage';
import type { PlayerEvent, PlayerEventHandler, SaveReason, WatchedRange } from './events';
import type { ProviderCallbacks, ProviderControl } from './externalApi';
import { enforcedRate, type PlayerRules } from './rules';
import { SAVE_INTERVAL_MS, planSave } from './saveSchedule';

export interface ExternalTrackerOptions {
  rules?: PlayerRules;
  resumeAt?: number;
  furthest?: number;
  onEvent: PlayerEventHandler;
}

export interface ExternalTracker {
  /** The callbacks to give `connectProvider`. */
  callbacks: ProviderCallbacks;
  /** The provider's commands, once it is ready. */
  connect(control: ProviderControl): void;
  requestSave(reason: SaveReason): Promise<boolean>;
  pause(): void;
  play(): void;
  detach(): void;
}

const toMs = (seconds: number) => Math.floor(seconds * 1000);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A sample further than this from the last one is a jump (seek), not playback. */
const JUMP_S = 2;

/**
 * The same coverage, watch-in-order, fixed speed and save events as `attachPlayer`, for a YouTube or Vimeo player
 * followed through its API: the provider reports times; a jump past what was watched is sent back.
 */
export function createExternalTracker(options: ExternalTrackerOptions): ExternalTracker {
  const rules = options.rules ?? {};
  const coverage = createCoverage(options.furthest ?? 0);
  let control: ProviderControl | null = null;
  let duration = 0;
  let last = options.resumeAt ?? 0;
  let playing = false;
  let detached = false;
  let lastSavedMs = toMs(last);
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;

  const emit = (event: PlayerEvent) => { if (!detached) return options.onEvent(event); };
  const position = () => clamp(last, 0, duration || Infinity);

  function clampRange(range: WatchedRange | null): WatchedRange | null {
    if (!range) return null;
    const max = duration ? toMs(duration) : Infinity;
    return { startMs: clamp(range.startMs, 0, max), endMs: clamp(range.endMs, 0, max) };
  }

  function save(reason: SaveReason, snapshot?: { positionMs: number; range: WatchedRange | null }): Promise<boolean> {
    const positionMs = snapshot ? snapshot.positionMs : toMs(position());
    const asked = snapshot ? snapshot.range : coverage.open(position());
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

  /** True when the sample was a jump: blocked ones go back, allowed ones close the range watched so far. */
  function handleJump(currentS: number): boolean {
    if (Math.abs(currentS - last) <= JUMP_S) return false;
    if (rules.watchInOrder && currentS > Math.max(coverage.furthestS, last) + 1) {
      const back = Math.max(coverage.furthestS, 0);
      control?.seek(back);
      emit({ type: 'seekBlocked' });
      last = back;
      return true;
    }
    const closed = coverage.onSeeking(currentS);
    last = currentS;
    if (closed && closed.endMs > closed.startMs) void save('seeked', { positionMs: closed.endMs, range: closed });
    return true;
  }

  const callbacks: ProviderCallbacks = {
    ready(durationS) {
      duration = durationS > 0 ? durationS : 0;
    },
    play(currentS) {
      if (handleJump(currentS)) { playing = true; emit({ type: 'playing' }); return; }
      playing = true;
      coverage.onPlaying(currentS);
      last = currentS;
      emit({ type: 'playing' });
    },
    pause(currentS) {
      if (!handleJump(currentS)) {
        if (playing) coverage.onTimeUpdate(clamp(currentS, 0, duration || Infinity));
        last = currentS;
      }
      playing = false;
      emit({ type: 'paused' });
      void save('pause');
    },
    ended(currentS) {
      const end = duration || currentS;
      if (!handleJump(end)) {
        coverage.onTimeUpdate(end);
        last = end;
      }
      playing = false;
      void save('ended').then(() => { emit({ type: 'ended' }); });
    },
    time(currentS) {
      if (handleJump(currentS)) return;
      if (playing) coverage.onTimeUpdate(clamp(currentS, 0, duration || Infinity));
      last = currentS;
    },
    rate(rate) {
      const wanted = enforcedRate(rules, rate);
      if (wanted !== rate) control?.setRate(wanted);
    },
  };

  const onVisibility = () => { if (document.visibilityState === 'hidden') void save('hidden'); };
  document.addEventListener('visibilitychange', onVisibility);
  const interval = setInterval(() => { if (playing) void save('interval'); }, SAVE_INTERVAL_MS);

  return {
    callbacks,
    connect(next) {
      control = next;
      if (rules.fixedSpeed) next.setRate(1);
    },
    requestSave: reason => save(reason),
    pause: () => control?.pause(),
    play: () => control?.play(),
    detach() {
      if (detached) return;
      detached = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      control?.destroy();
    },
  };
}
