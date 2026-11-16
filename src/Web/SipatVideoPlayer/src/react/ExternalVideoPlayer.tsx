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

function urlsOf(provider: ExternalProvider, externalId: string) {
  try {
    return { embed: externalEmbedUrl(provider, externalId), watch: externalWatchUrl(provider, externalId) };
  } catch {
    return null;
  }
}

/**
 * Provider video in the same frame as the house player. No rules, progress or events.
 * Root is a plain wrapper; `div.sipat-player` inside it is the frame, and the "outside" line sits under the frame.
 */
export default function ExternalVideoPlayer({ provider, externalId, title, blockedAfterMs = 8000 }: ExternalVideoPlayerProps) {
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const urls = urlsOf(provider, externalId);
  const valid = urls !== null;

  useEffect(() => {
    setBlocked(false);
    if (!valid) return;
    timer.current = setTimeout(() => setBlocked(true), blockedAfterMs);
    return () => clearTimeout(timer.current);
  }, [provider, externalId, blockedAfterMs, valid]);

  function loaded() { clearTimeout(timer.current); setBlocked(false); }

  if (!urls) {
    return <div className="sipat-player">
      <div className="sipat-player-error" role="alert"><p>{texts.externalUnavailable}</p></div>
    </div>;
  }

  const openText = texts.externalOpenOutside.replace('{provider}', provider);
  return <div className="sipat-player-external">
    <div className="sipat-player">
      <iframe
        allow="fullscreen; picture-in-picture" allowFullScreen className="sipat-player-embed"
        onLoad={loaded} referrerPolicy="strict-origin-when-cross-origin" src={urls.embed} title={title} />
      {blocked && <div className="sipat-player-error" role="alert">
        <p>{texts.externalBlocked}</p>
        <a className="sipat-player-retry sipat-player-link" href={urls.watch} rel="noopener noreferrer" target="_blank">{openText}</a>
      </div>}
    </div>
    <p className="sipat-player-outside">{texts.externalNotOpening}{' '}
      <a href={urls.watch} rel="noopener noreferrer" target="_blank">{openText}</a>
    </p>
  </div>;
}
