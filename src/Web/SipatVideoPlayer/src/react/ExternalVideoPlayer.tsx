import { useEffect, useRef, useState } from 'react';
import { externalEmbedUrl, externalWatchUrl, type ExternalProvider } from '../core/external';
import { texts } from './texts';
import './SipatVideoPlayer.css';

export interface ExternalVideoPlayerProps {
  provider: ExternalProvider;
  externalId: string;
  title: string;
  /** ms without the iframe `load` event before the blocked message shows. Default 8000. */
  blockedAfterMs?: number;
}

/** Provider video in the same frame as the house player. No rules, progress or events. */
export default function ExternalVideoPlayer({ provider, externalId, title, blockedAfterMs = 8000 }: ExternalVideoPlayerProps) {
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setBlocked(false);
    timer.current = setTimeout(() => setBlocked(true), blockedAfterMs);
    return () => clearTimeout(timer.current);
  }, [provider, externalId, blockedAfterMs]);

  function loaded() { clearTimeout(timer.current); setBlocked(false); }

  return <div className="sipat-player">
    <iframe
      allow="fullscreen; picture-in-picture" allowFullScreen className="sipat-player-embed" loading="lazy"
      onLoad={loaded} referrerPolicy="strict-origin-when-cross-origin" src={externalEmbedUrl(provider, externalId)} title={title} />
    {blocked && <div className="sipat-player-error" role="alert">
      <p>{texts.externalBlocked}</p>
      <a className="sipat-player-retry sipat-player-link" href={externalWatchUrl(provider, externalId)} rel="noopener noreferrer" target="_blank">
        {texts.externalOpenOutside.replace('{provider}', provider)}
      </a>
    </div>}
  </div>;
}
