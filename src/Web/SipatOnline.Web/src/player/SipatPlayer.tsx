import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { Gamepad2, Lock, Maximize, Minimize } from 'lucide-react';
import { loadMediaChrome } from './loadMediaChrome';
import './SipatPlayer.css';

/** A point on the timeline where something happens (today: an activity that pauses the video). */
export interface PlayerMarker { id: string; seconds: number; title: string; done: boolean }

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

function clock(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600);
  const rest = `${String(Math.floor(seconds % 3600 / 60)).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest}` : rest;
}

/**
 * SIPAT Online video player.
 *
 * The browser still decodes the video; this component is the interface over it: our controls,
 * the SIPAT look, a timeline that can be locked to what was already watched, activity markers,
 * and a fullscreen that keeps our controls (on iPhone it fills the page instead of handing over
 * to the system player). Controls come from Media Chrome, loaded on demand in its own chunk.
 *
 * Features are added here, once, for every screen that plays video.
 */
export default function SipatPlayer({ videoRef, lock, markers = [], children }: SipatPlayerProps) {
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
      <Scrubber lock={lock} markers={markers} videoRef={videoRef} />
      <media-control-bar class="sipat-player-bar">
        <media-play-button />
        <media-seek-backward-button seekoffset="10" />
        <media-mute-button />
        <media-volume-range />
        <media-time-display showduration />
        <span className="sipat-player-spacer" />
        {markers.length > 0 && <span className="sipat-player-activities">
          <Gamepad2 aria-hidden="true" />{markers.filter(marker => marker.done).length}/{markers.length}
          <span className="sr-only"> atividades deste vídeo concluídas</span>
        </span>}
        <button aria-label={expanded ? 'Sair da tela cheia' : 'Tela cheia'} className="sipat-player-button" onClick={toggleFullscreen} type="button">
          {expanded ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </media-control-bar>
    </media-controller>
  </div>;
}

function Scrubber({ videoRef, lock, markers }: { videoRef: RefObject<HTMLVideoElement | null>; lock?: PlayerLock; markers: PlayerMarker[] }) {
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
  const unlocked = !duration ? 0 : lock ? Math.min(duration, Math.max(lock.furthest.current, current)) : duration;
  const buffered = video && duration && video.buffered.length ? Math.min(duration, video.buffered.end(video.buffered.length - 1)) : 0;
  const percent = (seconds: number) => (duration ? `${Math.min(100, Math.max(0, seconds / duration * 100))}%` : '0%');

  function fractionAt(event: PointerEvent) {
    const box = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / (box.width || 1)));
  }
  function seekTo(seconds: number) {
    if (!video || !duration) return;
    if (lock && seconds > unlocked + 0.25) lock.onBlocked();
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
  const hoverLocked = !!lock && hover !== null && hoverSeconds > unlocked + 0.25;
  const hoverMarker = hover === null ? undefined : markers.find(marker => Math.abs(marker.seconds - hoverSeconds) <= Math.max(1.5, duration * 0.015));
  return <div
    aria-label="Posição do vídeo" aria-valuemax={Math.round(duration)} aria-valuemin={0} aria-valuenow={Math.round(current)}
    aria-valuetext={`${clock(current)} de ${clock(duration)}`}
    className={`sipat-scrubber${hover !== null ? ' is-hovered' : ''}`}
    onKeyDown={onKey}
    onPointerCancel={() => { dragging.current = false; setHover(null); }}
    onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); seekTo(fractionAt(event) * duration); }}
    onPointerLeave={() => { if (!dragging.current) setHover(null); }}
    onPointerMove={event => { const fraction = fractionAt(event); setHover(fraction); if (dragging.current) seekTo(fraction * duration); }}
    onPointerUp={event => { dragging.current = false; if (event.pointerType !== 'mouse') setHover(null); }}
    role="slider" tabIndex={0}>
    <div className="sipat-scrubber-track" ref={track}>
      <span className="sipat-scrubber-buffered" style={{ width: percent(buffered) }} />
      {lock && <span className="sipat-scrubber-unlocked" style={{ width: percent(unlocked) }} />}
      <span className="sipat-scrubber-played" style={{ width: percent(current) }} />
      {markers.map(marker => <span className={`sipat-scrubber-marker${marker.done ? ' is-done' : ''}`} key={marker.id} style={{ left: percent(marker.seconds) }} />)}
      <span className="sipat-scrubber-thumb" style={{ left: percent(current) }} />
    </div>
    {hover !== null && duration > 0 && <span className={`sipat-scrubber-tip${hoverLocked ? ' is-locked' : ''}`} style={{ left: `${hover * 100}%` }}>
      {hoverMarker && <strong><Gamepad2 aria-hidden="true" />{hoverMarker.title}</strong>}
      {hoverLocked ? <span><Lock aria-hidden="true" />Assista para liberar</span> : <span>{clock(hoverSeconds)}</span>}
    </span>}
  </div>;
}
