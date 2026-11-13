import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import {
  MediaControlBar, MediaController, MediaLoadingIndicator, MediaMuteButton, MediaPlayButton,
  MediaSeekBackwardButton, MediaTimeDisplay, MediaVolumeRange,
} from 'media-chrome/react';
import { Gamepad2, Lock, Maximize, Minimize } from 'lucide-react';
import './LessonPlayer.css';

export interface PlayerMarker { id: string; seconds: number; title: string; done: boolean }

function clock(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600);
  const rest = `${String(Math.floor(seconds % 3600 / 60)).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest}` : rest;
}

/**
 * The lesson player: the browser still decodes the video, but the controls are ours.
 * The bar shows how far the participant may go (what was already watched), where the
 * activities are, and never offers speed or skipping ahead.
 */
export default function LessonPlayer({ videoRef, furthestRef, markers, onLockedSeek, children }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Furthest second already watched; Infinity when the lesson is complete. */
  furthestRef: RefObject<number>;
  markers: PlayerMarker[];
  onLockedSeek: () => void;
  /** The `<video slot="media">` element. */
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // iPhone has no element fullscreen: the player fills the page instead, keeping our controls.
  const [filling, setFilling] = useState(false);

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
    document.documentElement.classList.add('lesson-player-filling');
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setFilling(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous; document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('lesson-player-filling');
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
  return <div className={`lesson-player${filling ? ' is-filling' : ''}`} ref={frame}>
    <MediaController className="lesson-player-controller" hotkeys="noarrowright nof">
      {children}
      <MediaLoadingIndicator noAutohide slot="centered-chrome" />
      <MediaPlayButton className="lesson-player-bigplay" slot="centered-chrome" />
      <Scrubber furthestRef={furthestRef} markers={markers} onLockedSeek={onLockedSeek} videoRef={videoRef} />
      <MediaControlBar className="lesson-player-bar">
        <MediaPlayButton />
        <MediaSeekBackwardButton seekOffset={10} />
        <MediaMuteButton />
        <MediaVolumeRange />
        <MediaTimeDisplay showDuration />
        <span className="lesson-player-spacer" />
        {markers.length > 0 && <span className="lesson-player-activities">
          <Gamepad2 aria-hidden="true" />{markers.filter(marker => marker.done).length}/{markers.length}
          <span className="sr-only"> atividades deste vídeo concluídas</span>
        </span>}
        <button aria-label={expanded ? 'Sair da tela cheia' : 'Tela cheia'} className="lesson-player-button" onClick={toggleFullscreen} type="button">
          {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </MediaControlBar>
    </MediaController>
  </div>;
}

function Scrubber({ videoRef, furthestRef, markers, onLockedSeek }: {
  videoRef: RefObject<HTMLVideoElement | null>; furthestRef: RefObject<number>; markers: PlayerMarker[]; onLockedSeek: () => void;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const events = ['timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'seeked', 'ended'];
    events.forEach(name => video.addEventListener(name, refresh));
    return () => events.forEach(name => video.removeEventListener(name, refresh));
  }, [videoRef]);

  const video = videoRef.current;
  const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const current = video ? Math.min(video.currentTime, duration) : 0;
  const unlocked = duration ? Math.min(duration, Math.max(furthestRef.current, current)) : 0;
  const buffered = video && duration && video.buffered.length ? Math.min(duration, video.buffered.end(video.buffered.length - 1)) : 0;
  const percent = (seconds: number) => (duration ? `${Math.min(100, Math.max(0, seconds / duration * 100))}%` : '0%');

  function fractionAt(event: PointerEvent) {
    const box = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / (box.width || 1)));
  }
  function seekTo(seconds: number) {
    if (!video || !duration) return;
    const locked = seconds > unlocked + 0.25;
    if (locked) onLockedSeek();
    video.currentTime = Math.max(0, Math.min(seconds, unlocked));
    refresh();
  }
  function onKey(event: KeyboardEvent) {
    const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[event.key];
    if (step) seekTo(current + step);
    else if (event.key === 'Home') seekTo(0);
    else if (event.key === 'End') seekTo(unlocked);
    else return;
    event.preventDefault(); event.stopPropagation();
  }

  const hoverSeconds = hover === null ? 0 : hover * duration;
  const hoverLocked = hover !== null && hoverSeconds > unlocked + 0.25;
  const hoverMarker = hover === null ? undefined : markers.find(marker => Math.abs(marker.seconds - hoverSeconds) <= Math.max(1.5, duration * 0.015));
  return <div
    aria-label="Posição do vídeo" aria-valuemax={Math.round(duration)} aria-valuemin={0} aria-valuenow={Math.round(current)}
    aria-valuetext={`${clock(current)} de ${clock(duration)}`}
    className={`lesson-scrubber${hover !== null ? ' is-hovered' : ''}`}
    onKeyDown={onKey}
    onPointerCancel={() => { dragging.current = false; setHover(null); }}
    onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); seekTo(fractionAt(event) * duration); }}
    onPointerLeave={() => { if (!dragging.current) setHover(null); }}
    onPointerMove={event => { const fraction = fractionAt(event); setHover(fraction); if (dragging.current) seekTo(fraction * duration); }}
    onPointerUp={event => { dragging.current = false; if (event.pointerType !== 'mouse') setHover(null); }}
    role="slider" tabIndex={0}>
    <div className="lesson-scrubber-track" ref={track}>
      <span className="lesson-scrubber-buffered" style={{ width: percent(buffered) }} />
      <span className="lesson-scrubber-unlocked" style={{ width: percent(unlocked) }} />
      <span className="lesson-scrubber-played" style={{ width: percent(current) }} />
      {markers.map(marker => <span className={`lesson-scrubber-marker${marker.done ? ' is-done' : ''}`} key={marker.id} style={{ left: percent(marker.seconds) }} />)}
      <span className="lesson-scrubber-thumb" style={{ left: percent(current) }} />
    </div>
    {hover !== null && duration > 0 && <span className={`lesson-scrubber-tip${hoverLocked ? ' is-locked' : ''}`} style={{ left: `${hover * 100}%` }}>
      {hoverMarker && <strong><Gamepad2 aria-hidden="true" />{hoverMarker.title}</strong>}
      {hoverLocked ? <span><Lock aria-hidden="true" />Assista para liberar</span> : <span>{clock(hoverSeconds)}</span>}
    </span>}
  </div>;
}
