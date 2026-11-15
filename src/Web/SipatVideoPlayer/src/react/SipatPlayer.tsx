import type { ReactNode, RefObject } from 'react';
import PlayerChrome from './PlayerChrome';
import type { ScrubberMarker } from './Scrubber';

/** A point on the timeline where something happens (today: an activity that pauses the video). */
export type PlayerMarker = ScrubberMarker;

/**
 * Optional "watch in order" rule. The timeline only goes as far as `furthest` (seconds already
 * watched; `Infinity` when the lesson is done), and `onBlocked` fires when someone tries to go beyond it.
 */
export interface PlayerLock { furthest: RefObject<number>; onBlocked: () => void }

export interface SipatPlayerProps {
  /** The `<video>` element. The player never creates it, so each screen keeps its own playback logic. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Pass the `<video slot="media" …>` element here. */
  children: ReactNode;
  /** Leave out for free playback (previews); pass it for compulsory lessons. */
  lock?: PlayerLock;
  markers?: PlayerMarker[];
}

/**
 * Thin wrapper kept for the lesson page, which still owns its playback logic.
 * It goes away once that page uses `SipatVideoPlayer`.
 */
export default function SipatPlayer({ videoRef, lock, markers = [], children }: SipatPlayerProps) {
  const unlocked = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return 0;
    return lock ? Math.min(video.duration, Math.max(lock.furthest.current, Math.min(video.currentTime, video.duration))) : video.duration;
  };
  function onSeek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    const limit = unlocked();
    if (lock && seconds > limit + 0.25) lock.onBlocked();
    video.currentTime = Math.max(0, Math.min(seconds, limit));
  }
  return <PlayerChrome locked={!!lock} markers={markers} onSeek={onSeek} unlocked={unlocked} videoRef={videoRef}>{children}</PlayerChrome>;
}
