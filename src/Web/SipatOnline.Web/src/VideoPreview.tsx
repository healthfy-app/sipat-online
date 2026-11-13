import { useRef, useState } from 'react';
import SipatPlayer from '@/player/SipatPlayer';

/** Free playback (no lock) of a library video, on the same SIPAT player participants use. */
export default function VideoPreview({ src, title, preload = 'metadata' }: {
  src: string;
  title: string;
  preload?: 'none' | 'metadata';
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  return <div className="video-preview">
    {failed ? <div className="video-preview-error" role="alert">
      <p>Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.</p>
      <button className="button button-secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} type="button">Tentar reproduzir novamente</button>
    </div> : <SipatPlayer key={`${src}-${attempt}`} videoRef={video}>
      <video aria-label={title} className="learning-video" disablePictureInPicture onError={() => setFailed(true)}
        playsInline preload={preload} ref={video} slot="media" src={src}>Seu navegador não oferece suporte à reprodução de vídeo.</video>
    </SipatPlayer>}
  </div>;
}
