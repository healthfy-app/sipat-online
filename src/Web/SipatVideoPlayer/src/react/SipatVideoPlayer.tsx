import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import { attachPlayer, type AttachedPlayer } from '../core/attach';
import type { Checkpoint } from '../core/checkpoints';
import type { PlayerEvent, PlayerEventHandler, SaveReason } from '../core/events';
import type { QualityLabel } from '../core/quality';
import type { PlayerRules } from '../core/rules';
import PlayerChrome from './PlayerChrome';
import { texts } from './texts';

export interface VideoSource { src: string; quality?: '720p' | '480p'; type?: string }

export interface SipatVideoPlayerHandle {
  requestSave(reason: SaveReason): Promise<boolean>;
  play(): Promise<void>;
  pause(): void;
}

export interface SipatVideoPlayerProps {
  sources: VideoSource[];
  title: string;
  /** Opt-in rules; leave out for free playback (previews). */
  rules?: PlayerRules;
  resumeAt?: number;
  furthest?: number;
  checkpoints?: Checkpoint[];
  /** Default true: the video pauses at each checkpoint. */
  pauseAtCheckpoints?: boolean;
  /** Shown over the paused video from the checkpoint until the screen stops passing it; the video then plays on. */
  activity?: ReactNode;
  onEvent?: PlayerEventHandler;
  preload?: 'none' | 'metadata';
  videoRef?: RefObject<HTMLVideoElement | null>;
  ref?: Ref<SipatVideoPlayerHandle>;
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id));

/**
 * SIPAT Online video player: the `<video>`, our controls and timeline, the optional watch-in-order
 * and fixed-speed rules, activity checkpoints, and the save/coverage events the page listens to.
 * The browser still decodes the video.
 */
export default function SipatVideoPlayer({
  sources, title, rules, resumeAt, furthest, checkpoints = [], pauseAtCheckpoints = true, activity, onEvent,
  preload = 'metadata', videoRef, ref,
}: SipatVideoPlayerProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const attached = useRef<AttachedPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [fired, setFired] = useState<ReadonlySet<string>>(new Set());

  // Latest props for the long-lived listeners, so the player is not re-attached on every render.
  // One source is reported as 'single'.
  const quality: QualityLabel = sources.length === 1 ? 'single' : sources[0]?.quality ?? 'single';
  const latest = useRef({ onEvent, checkpoints, resumeAt, furthest, quality });
  latest.current = { onEvent, checkpoints, resumeAt, furthest, quality };

  const watchInOrder = rules?.watchInOrder;
  const fixedSpeed = rules?.fixedSpeed;
  // Attached in the layout phase: the first 'playing' or 'timeupdate' can come right after the commit.
  useLayoutEffect(() => {
    const element = video.current;
    if (!element) return;
    const syncFired = () => {
      const next = attached.current?.firedCheckpoints();
      if (next) setFired(current => sameSet(current, next) ? current : new Set(next));
    };
    const player = attachPlayer(element, {
      rules: { watchInOrder, fixedSpeed },
      resumeAt: latest.current.resumeAt,
      furthest: latest.current.furthest,
      quality: latest.current.quality,
      checkpoints: () => latest.current.checkpoints,
      pauseAtCheckpoints,
      onEvent: (event: PlayerEvent) => {
        if (event.type === 'error') setFailed(true);
        if (event.type === 'checkpoint') syncFired();
        return latest.current.onEvent?.(event);
      },
    });
    attached.current = player;
    const syncEvents = ['timeupdate', 'seeked', 'ended'];
    syncEvents.forEach(name => element.addEventListener(name, syncFired));
    return () => {
      syncEvents.forEach(name => element.removeEventListener(name, syncFired));
      player.detach();
      if (attached.current === player) attached.current = null;
    };
  }, [watchInOrder, fixedSpeed, pauseAtCheckpoints]);

  const hadActivity = useRef(false);
  useEffect(() => {
    const has = Boolean(activity);
    if (hadActivity.current && !has) attached.current?.resumeAfterActivity();
    hadActivity.current = has;
  }, [activity]);

  useImperativeHandle(ref, () => ({
    requestSave: reason => attached.current?.requestSave(reason) ?? Promise.resolve(true),
    play: () => video.current?.play() ?? Promise.resolve(),
    pause: () => video.current?.pause(),
  }), []);

  const setVideo = useCallback((node: HTMLVideoElement | null) => {
    video.current = node;
    if (videoRef) videoRef.current = node;
  }, [videoRef]);

  function retry() {
    setFailed(false);
    video.current?.load();
  }

  const markers = checkpoints.map(item => ({ id: item.id, seconds: item.seconds, title: item.title, done: item.done || fired.has(item.id) }));
  const overlay = <>
    {failed && <div className="sipat-player-error" role="alert">
      <p>{texts.loadFailed}</p>
      <button className="sipat-player-retry" onClick={retry} type="button">{texts.retry}</button>
    </div>}
    {activity ? <div className="sipat-player-activity">{activity}</div> : null}
  </>;

  return <PlayerChrome
    locked={!!watchInOrder} markers={markers} onSeek={seconds => attached.current?.seekTo(seconds)}
    overlay={overlay} unlocked={() => attached.current?.unlocked() ?? 0} videoRef={video}>
    <video
      aria-label={title} className="sipat-player-video" disablePictureInPicture playsInline preload={preload} slot="media"
      ref={setVideo} src={sources.length === 1 ? sources[0].src : undefined}>
      {sources.length > 1 && sources.map(source => <source data-quality={source.quality} key={source.src} src={source.src} type={source.type} />)}
      {texts.unsupported}
    </video>
  </PlayerChrome>;
}
