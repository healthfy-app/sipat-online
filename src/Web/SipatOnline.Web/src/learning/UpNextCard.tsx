import { Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './UpNextCard.css';

const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The card over the finished video, as on Netflix: the next video's title and a ring that closes while it counts
 * down; when it closes the next video starts. "Assistir agora" skips the wait, "Cancelar" (or Esc) stays here.
 */
export default function UpNextCard({ title, seconds = 8, onPlay, onCancel }: {
  title: string;
  seconds?: number;
  onPlay: () => void;
  onCancel: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const playRef = useRef(onPlay);
  const cancelRef = useRef(onCancel);
  playRef.current = onPlay;
  cancelRef.current = onCancel;

  useEffect(() => {
    const endsAt = Date.now() + seconds * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0) { window.clearInterval(timer); playRef.current(); }
    }, 200);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', onKey); };
  }, [seconds]);

  return <aside aria-label="Próximo vídeo" className="up-next" role="dialog">
    <button aria-label={`Assistir agora: ${title}`} className="up-next-ring" onClick={onPlay} type="button">
      <svg aria-hidden="true" viewBox="0 0 52 52">
        <circle className="up-next-track" cx="26" cy="26" r={RADIUS} />
        <circle className="up-next-progress" cx="26" cy="26" r={RADIUS}
          style={{ strokeDasharray: CIRCUMFERENCE, animationDuration: `${seconds}s`, ['--up-next-length' as string]: CIRCUMFERENCE }} />
      </svg>
      <Play aria-hidden="true" className="up-next-play" />
    </button>
    <div className="up-next-text">
      <span className="up-next-label" aria-live="polite">Próximo vídeo em {left}s</span>
      <strong className="up-next-title">{title}</strong>
      <div className="up-next-actions">
        <button className="up-next-now" onClick={onPlay} type="button">Assistir agora</button>
        <button className="up-next-cancel" onClick={onCancel} type="button"><X aria-hidden="true" />Cancelar</button>
      </div>
    </div>
  </aside>;
}
