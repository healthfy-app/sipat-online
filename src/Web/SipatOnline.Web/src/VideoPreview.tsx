import { useRef, useState } from 'react';
import type { PreviewCheckpoint } from '@/courseEditor/courseTrack';
import GameStage from '@/games/GameStage';
import GamePlayer from '@/games/LazyGamePlayer';
import SipatPlayer from '@/player/SipatPlayer';

/**
 * Free playback (no lock) of a library video, on the same SIPAT player participants use.
 * When the video has games at given moments, they open here too, so creators see what
 * participants will see. Seeking back before a game makes it open again.
 */
export default function VideoPreview({ src, title, preload = 'metadata', checkpoints = [] }: {
  src: string;
  title: string;
  preload?: 'none' | 'metadata';
  checkpoints?: PreviewCheckpoint[];
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fired, setFired] = useState<string[]>([]);
  const [active, setActive] = useState<PreviewCheckpoint | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  function onTimeUpdate() {
    const element = video.current;
    if (!element || !checkpoints.length || active) return;
    const seconds = element.currentTime;
    const rewound = fired.filter(id => (checkpoints.find(item => item.id === id)?.timeMilliseconds ?? 0) / 1000 > seconds + 1);
    if (rewound.length) setFired(current => current.filter(id => !rewound.includes(id)));
    if (element.paused || element.seeking) return;
    const due = checkpoints.find(item => !fired.includes(item.id) && item.timeMilliseconds / 1000 <= seconds);
    if (!due) return;
    element.pause();
    setFired(current => [...current, due.id]);
    setActive(due);
  }

  function closeGame() {
    setActive(null);
    void video.current?.play().catch(() => undefined);
  }

  const markers = checkpoints.map(item => ({ id: item.id, seconds: item.timeMilliseconds / 1000, title: item.module.title, done: fired.includes(item.id) }));
  return <div className="video-preview">
    {failed ? <div className="video-preview-error" role="alert">
      <p>Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.</p>
      <button className="button button-secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} type="button">Tentar reproduzir novamente</button>
    </div> : <SipatPlayer key={`${src}-${attempt}`} markers={markers} videoRef={video}>
      <video aria-label={title} className="learning-video" disablePictureInPicture onError={() => setFailed(true)} onTimeUpdate={onTimeUpdate}
        playsInline preload={preload} ref={video} slot="media" src={src}>Seu navegador não oferece suporte à reprodução de vídeo.</video>
    </SipatPlayer>}
    {active && <GameStage label={active.module.title} onClose={closeGame}>
      <GamePlayer key={active.id} module={active.module} onClose={closeGame} />
    </GameStage>}
  </div>;
}
