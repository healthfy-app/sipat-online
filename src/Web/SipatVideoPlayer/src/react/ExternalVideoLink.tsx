import { externalWatchUrl, type ExternalProvider } from '../core/external';
import { texts } from './texts';
import './SipatVideoPlayer.css';

export interface ExternalVideoLinkProps {
  provider: ExternalProvider;
  externalId: string;
}

/** "Didn't open?" line the host page places under the external player's frame. Renders nothing for an invalid id. */
export default function ExternalVideoLink({ provider, externalId }: ExternalVideoLinkProps) {
  let href: string;
  try { href = externalWatchUrl(provider, externalId); } catch { return null; }
  return <p className="sipat-player-outside">{texts.externalNotOpening}{' '}
    <a href={href} rel="noopener noreferrer" target="_blank">{texts.externalOpenOutside.replace('{provider}', provider)}</a>
  </p>;
}
