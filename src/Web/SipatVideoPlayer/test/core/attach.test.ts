import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPlayer, type AttachedPlayer } from '../../src/core/attach';
import type { PlayerEvent } from '../../src/core/events';

function makeVideo(duration = 60) {
  const video = document.createElement('video');
  const define = (name: string, value: unknown) => Object.defineProperty(video, name, { configurable: true, writable: true, value });
  define('duration', duration); define('currentTime', 0); define('paused', true); define('seeking', false); define('playbackRate', 1);
  video.pause = vi.fn(() => { define('paused', true); });
  video.play = vi.fn(() => { define('paused', false); return Promise.resolve(); });
  return { video, define };
}

type Harness = ReturnType<typeof makeVideo>;
const flush = () => vi.advanceTimersByTimeAsync(0);
function playTo(h: Harness, from: number, to: number) {
  h.define('paused', false); h.define('currentTime', from); h.video.dispatchEvent(new Event('playing'));
  for (let s = Math.floor(from) + 1; s <= to; s++) { h.define('currentTime', s); h.video.dispatchEvent(new Event('timeupdate')); }
}
const pauseAt = (h: Harness, at: number) => { h.define('currentTime', at); h.define('paused', true); h.video.dispatchEvent(new Event('pause')); };
const saving = (events: PlayerEvent[], answer: boolean) => (event: PlayerEvent) => {
  events.push(event);
  return event.type === 'save' ? Promise.resolve(answer) : undefined;
};

let player: AttachedPlayer | undefined;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { player?.detach(); player = undefined; vi.useRealTimers(); });

const saves = (events: PlayerEvent[]) => events.filter(event => event.type === 'save');

describe('attachPlayer', () => {
  it('emits save with the watched range on pause and commits it when the page saved', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    playTo(h, 0, 4); pauseAt(h, 4);
    await flush();
    expect(saves(events)).toEqual([{ type: 'save', reason: 'pause', positionMs: 4000, range: { startMs: 0, endMs: 4000 } }]);
    expect(events.some(event => event.type === 'paused')).toBe(true);
    expect(events.some(event => event.type === 'range')).toBe(true);

    events.length = 0;
    playTo(h, 4, 6); pauseAt(h, 6);
    await flush();
    expect(saves(events)).toEqual([{ type: 'save', reason: 'pause', positionMs: 6000, range: { startMs: 4000, endMs: 6000 } }]);
  });

  it('keeps the range when the page could not save', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, false) });
    playTo(h, 0, 4); pauseAt(h, 4); await flush();
    playTo(h, 4, 6); pauseAt(h, 6); await flush();
    expect(saves(events).map(event => event.type === 'save' && event.range)).toEqual([
      { startMs: 0, endMs: 4000 }, { startMs: 0, endMs: 6000 },
    ]);
  });

  it('ignores time updates while paused or seeking', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    playTo(h, 0, 2);
    h.define('seeking', true); h.define('currentTime', 40); h.video.dispatchEvent(new Event('timeupdate'));
    h.define('seeking', false); h.define('paused', true); h.video.dispatchEvent(new Event('timeupdate'));
    pauseAt(h, 2); await flush();
    expect(saves(events)).toEqual([{ type: 'save', reason: 'pause', positionMs: 2000, range: { startMs: 0, endMs: 2000 } }]);
  });

  it('sends a native seek beyond the unlocked point back and reports it', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { rules: { watchInOrder: true }, furthest: 5, onEvent: saving(events, true) });
    h.define('currentTime', 30); h.video.dispatchEvent(new Event('seeking'));
    await flush();
    expect(h.video.currentTime).toBe(5);
    expect(events).toEqual([{ type: 'seekBlocked' }]);
  });

  it('closes the range and saves it when the viewer seeks inside what was watched', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { rules: { watchInOrder: true }, furthest: 20, onEvent: saving(events, true) });
    playTo(h, 0, 4);
    h.define('currentTime', 1); h.video.dispatchEvent(new Event('seeking'));
    await flush();
    expect(saves(events)).toEqual([{ type: 'save', reason: 'seeked', positionMs: 4000, range: { startMs: 0, endMs: 4000 } }]);
  });

  it('seekTo clamps to the unlocked point and reports a blocked jump', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { rules: { watchInOrder: true }, furthest: 10, onEvent: saving(events, true) });
    expect(player.unlocked()).toBe(10);
    player.seekTo(40);
    expect(h.video.currentTime).toBe(10);
    expect(events).toEqual([{ type: 'seekBlocked' }]);
    player.seekTo(4);
    expect(h.video.currentTime).toBe(4);
  });

  it('saves on the 10 second interval once the range is long enough', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    playTo(h, 0, 9);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(saves(events)).toEqual([{ type: 'save', reason: 'interval', positionMs: 9000, range: { startMs: 0, endMs: 9000 } }]);
  });

  it('applies the resume point and the fixed speed when metadata loads', () => {
    const h = makeVideo();
    player = attachPlayer(h.video, { rules: { fixedSpeed: true }, resumeAt: 12, furthest: 12, onEvent: () => undefined });
    h.define('playbackRate', 2);
    h.video.dispatchEvent(new Event('loadedmetadata'));
    expect(h.video.currentTime).toBe(12);
    expect(h.video.playbackRate).toBe(1);
    h.define('playbackRate', 1.5); h.video.dispatchEvent(new Event('ratechange'));
    expect(h.video.playbackRate).toBe(1);
  });

  it('pauses at a checkpoint and reports it', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { checkpoints: () => [{ id: 'a', seconds: 5, title: 'Quiz', done: false }], onEvent: saving(events, true) });
    playTo(h, 0, 6);
    expect(h.video.pause).toHaveBeenCalledOnce();
    expect(events.filter(event => event.type === 'checkpoint')).toEqual([{ type: 'checkpoint', id: 'a' }]);
  });

  it('only reports checkpoints for markers when told not to pause', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, {
      pauseAtCheckpoints: false, checkpoints: () => [{ id: 'a', seconds: 5, title: 'Quiz', done: false }], onEvent: saving(events, true),
    });
    playTo(h, 0, 6);
    expect(h.video.pause).not.toHaveBeenCalled();
    expect(events.some(event => event.type === 'checkpoint')).toBe(false);
  });

  it('resumes playing after the activity closes', () => {
    const h = makeVideo();
    player = attachPlayer(h.video, { checkpoints: () => [{ id: 'a', seconds: 5, title: 'Quiz', done: false }], onEvent: () => undefined });
    playTo(h, 0, 6);
    player.resumeAfterActivity();
    expect(h.video.play).toHaveBeenCalledOnce();
    player.resumeAfterActivity();
    expect(h.video.play).toHaveBeenCalledOnce();
  });

  it('maps media errors to kinds', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    Object.defineProperty(h.video, 'error', { configurable: true, value: { code: 3 } });
    h.video.dispatchEvent(new Event('error'));
    expect(events.filter(event => event.type !== 'quality')).toEqual([{ type: 'error', kind: 'decode' }]);
    // an error before playing still reaches the quality report, as a session that never started
    const quality = events.find(event => event.type === 'quality');
    expect(quality?.type === 'quality' && quality.summary).toMatchObject({ errorKind: 'decode', neverStarted: true });
  });

  it('reports quality summaries without app data', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    h.video.dispatchEvent(new Event('play')); playTo(h, 0, 3);
    await player.requestSave('leave');
    const quality = events.filter(event => event.type === 'quality');
    expect(quality).toHaveLength(1);
    const [report] = quality;
    if (report.type !== 'quality') throw new Error('not a quality event');
    expect(report.reason).toBe('leave');
    expect(report.summary.quality).toBe('single');
    expect(report.summary).not.toHaveProperty('lessonId');
    expect(report.summary).not.toHaveProperty('playbackSessionId');
  });

  it('flushes quality before saving when the tab is hidden or the page is left', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    h.video.dispatchEvent(new Event('play')); playTo(h, 0, 3);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try { document.dispatchEvent(new Event('visibilitychange')); } finally { Reflect.deleteProperty(document, 'visibilityState'); }
    await flush();
    h.define('currentTime', 5);
    await player.requestSave('leave');
    expect(events.filter(event => event.type === 'quality' || event.type === 'save').map(event =>
      event.type === 'quality' ? `quality:${event.reason}` : event.type === 'save' ? `save:${event.reason}` : '')).toEqual([
      'quality:hidden', 'save:hidden', 'quality:leave', 'save:leave',
    ]);
  });

  it('does not flush quality for the other save reasons', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    h.video.dispatchEvent(new Event('play')); playTo(h, 0, 3);
    await player.requestSave('pause');
    expect(events.some(event => event.type === 'quality')).toBe(false);
  });

  it('sends the last quality report when detached', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    const attached = attachPlayer(h.video, { onEvent: saving(events, true) });
    h.video.dispatchEvent(new Event('play')); playTo(h, 0, 3);
    attached.detach();
    expect(events.filter(event => event.type === 'quality').map(event => event.type === 'quality' && event.reason)).toEqual(['stop']);
  });

  it('asks the page to save right away when no save is pending', () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    player = attachPlayer(h.video, { onEvent: saving(events, true) });
    playTo(h, 0, 2); pauseAt(h, 2);
    // no await: the page sends the range in the same tick, as it did before the player moved
    expect(saves(events)).toEqual([{ type: 'save', reason: 'pause', positionMs: 2000, range: { startMs: 0, endMs: 2000 } }]);
  });

  it('keeps the moment a save was asked while an earlier one is still pending', async () => {
    const h = makeVideo(); const events: PlayerEvent[] = [];
    let finish!: (saved: boolean) => void;
    let first = true;
    player = attachPlayer(h.video, { onEvent: event => {
      events.push(event);
      if (event.type !== 'save') return undefined;
      if (first) { first = false; return new Promise<boolean>(resolve => { finish = resolve; }); }
      return Promise.resolve(true);
    } });
    playTo(h, 0, 2); pauseAt(h, 2);
    h.define('paused', false); h.define('currentTime', 3.9);
    const ended = player.requestSave('ended');
    h.define('currentTime', 0); // the next lesson's video may already be loading
    finish(true);
    await ended;
    expect(saves(events)).toEqual([
      { type: 'save', reason: 'pause', positionMs: 2000, range: { startMs: 0, endMs: 2000 } },
      { type: 'save', reason: 'ended', positionMs: 3900, range: { startMs: 0, endMs: 3900 } },
    ]);
  });

  it('stops listening when detached', async () => {
    const h = makeVideo(); const onEvent = vi.fn();
    const attached = attachPlayer(h.video, { onEvent });
    attached.detach();
    playTo(h, 0, 4); pauseAt(h, 4);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
