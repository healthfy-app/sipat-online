import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { Gamepad2, Lock } from 'lucide-react';
import { texts } from './texts';

/** A point on the timeline where something happens (today: an activity that pauses the video). */
export interface ScrubberMarker { id: string; seconds: number; title: string; done: boolean }

export function clock(total: number) {
  const seconds = Math.max(0, Math.floor(total));
  const hours = Math.floor(seconds / 3600);
  const rest = `${String(Math.floor(seconds % 3600 / 60)).padStart(hours ? 2 : 1, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${rest}` : rest;
}

/**
 * The timeline: played, buffered and "unlocked" bars, markers, hover tip, drag and keyboard.
 * It only draws and reports; `unlocked` says how far the viewer may go and `onSeek` applies the move
 * (the owner clamps it and reports a blocked jump).
 */
export default function Scrubber({ videoRef, locked, unlocked: unlockedSeconds, markers, onSeek }: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Draw the "unlocked" bar (the watch-in-order rule is on). */
  locked: boolean;
  unlocked: () => number;
  markers: ScrubberMarker[];
  onSeek: (seconds: number) => void;
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
  const unlocked = duration ? unlockedSeconds() : 0;
  const buffered = video && duration && video.buffered.length ? Math.min(duration, video.buffered.end(video.buffered.length - 1)) : 0;
  const percent = (seconds: number) => (duration ? `${Math.min(100, Math.max(0, seconds / duration * 100))}%` : '0%');

  function fractionAt(event: PointerEvent) {
    const box = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / (box.width || 1)));
  }
  function seekTo(seconds: number) {
    if (!video || !duration) return;
    onSeek(seconds);
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
  const hoverLocked = locked && hover !== null && hoverSeconds > unlocked + 0.25;
  const hoverMarker = hover === null ? undefined : markers.find(marker => Math.abs(marker.seconds - hoverSeconds) <= Math.max(1.5, duration * 0.015));
  return <div
    aria-label={texts.position} aria-valuemax={Math.round(duration)} aria-valuemin={0} aria-valuenow={Math.round(current)}
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
      {locked && <span className="sipat-scrubber-unlocked" style={{ width: percent(unlocked) }} />}
      <span className="sipat-scrubber-played" style={{ width: percent(current) }} />
      {markers.map(marker => <span className={`sipat-scrubber-marker${marker.done ? ' is-done' : ''}`} key={marker.id} style={{ left: percent(marker.seconds) }} />)}
      <span className="sipat-scrubber-thumb" style={{ left: percent(current) }} />
    </div>
    {hover !== null && duration > 0 && <span className={`sipat-scrubber-tip${hoverLocked ? ' is-locked' : ''}`} style={{ left: `${hover * 100}%` }}>
      {hoverMarker && <strong><Gamepad2 aria-hidden="true" />{hoverMarker.title}</strong>}
      {hoverLocked ? <span><Lock aria-hidden="true" />{texts.watchToUnlock}</span> : <span>{clock(hoverSeconds)}</span>}
    </span>}
  </div>;
}
