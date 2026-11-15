/// <reference path="./mediaChrome.d.ts" />
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Gamepad2, Maximize, Minimize } from 'lucide-react';
import { loadMediaChrome } from './loadMediaChrome';
import Scrubber, { type ScrubberMarker } from './Scrubber';
import { texts } from './texts';
import './SipatVideoPlayer.css';

/**
 * The player frame: Media Chrome controls, our timeline and a fullscreen that keeps them
 * Used by `SipatVideoPlayer`.
 * Shared by `SipatVideoPlayer` and by the lesson page's `SipatPlayer` while that one still exists.
 */
export default function PlayerChrome({ videoRef, locked, unlocked, markers, onSeek, overlay, controls, children }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  locked: boolean;
  unlocked: () => number;
  markers: ScrubberMarker[];
  onSeek: (seconds: number) => void;
  /** Drawn over the video, inside the frame (error panel, activity). */
  overlay?: ReactNode;
  /** Extra buttons of the control bar, before the fullscreen one (the quality menu). */
  controls?: ReactNode;
  /** The `<video slot="media">`. */
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => { loadMediaChrome(); }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!filling) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // ancestors with transforms or container queries would trap a fixed element inside the page column
    document.documentElement.classList.add('sipat-player-filling');
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setFilling(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous; document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('sipat-player-filling');
    };
  }, [filling]);

  function toggleFullscreen() {
    const element = frame.current;
    if (!element) return;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (filling) { setFilling(false); return; }
    if (document.fullscreenEnabled && element.requestFullscreen) element.requestFullscreen().catch(() => setFilling(true));
    else setFilling(true);
  }

  const expanded = fullscreen || filling;
  return <div className={`sipat-player${filling ? ' is-filling' : ''}`} ref={frame}>
    <media-controller class="sipat-player-controller" hotkeys="noarrowright nof">
      {children}
      <media-loading-indicator noautohide slot="centered-chrome" />
      <media-play-button class="sipat-player-bigplay" slot="centered-chrome" />
      <Scrubber locked={locked} markers={markers} onSeek={onSeek} unlocked={unlocked} videoRef={videoRef} />
      <media-control-bar class="sipat-player-bar">
        <media-play-button />
        <media-seek-backward-button seekoffset="10" />
        <media-mute-button />
        <media-volume-range />
        <media-time-display showduration />
        <span className="sipat-player-spacer" />
        {markers.length > 0 && <span className="sipat-player-activities">
          <Gamepad2 aria-hidden="true" />{markers.filter(marker => marker.done).length}/{markers.length}
          <span className="sipat-player-sr-only"> {texts.activitiesDone}</span>
        </span>}
        {controls}
        <button aria-label={expanded ? texts.exitFullscreen : texts.fullscreen} className="sipat-player-button" onClick={toggleFullscreen} type="button">
          {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </media-control-bar>
    </media-controller>
    {overlay}
  </div>;
}
