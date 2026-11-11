import { useState } from 'react';

export default function VideoPreview({ src, title, preload = 'metadata' }: {
  src: string;
  title: string;
  preload?: 'none' | 'metadata';
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <div className="video-preview">
    {failed ? <div className="video-preview-error" role="alert">
      <p>Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.</p>
      <button className="button button-secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} type="button">Tentar reproduzir novamente</button>
    </div> : <video aria-label={title} controls key={`${src}-${attempt}`} onError={() => setFailed(true)}
      playsInline preload={preload} src={src}>Seu navegador não oferece suporte à reprodução de vídeo.</video>}
  </div>;
}
