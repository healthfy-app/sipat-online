import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { createExternalTracker, type ExternalTracker } from '../core/attachExternal';
import { externalEmbedUrl, externalWatchUrl, type ExternalProvider } from '../core/external';
import { connectProvider } from '../core/externalApi';
import type { PlayerEventHandler } from '../core/events';
import type { PlayerRules } from '../core/rules';
import type { SipatVideoPlayerHandle } from './SipatVideoPlayer';
import { texts } from './texts';
import './SipatVideoPlayer.css';

export interface ExternalVideoPlayerProps {
  provider: ExternalProvider;
  externalId: string;
  title: string;
  /** ms without the iframe `load` event before the blocked message shows. Default 8000. */
  blockedAfterMs?: number;
  /**
   * With `onEvent` the video is followed through the provider's API like the house player: watched ranges,
   * the rules and the save events. Read once, at mount, with `rules`, `resumeAt` and `furthest`: remount (new `key`) to change them.
   */
  onEvent?: PlayerEventHandler;
  rules?: PlayerRules;
  resumeAt?: number;
  furthest?: number;
  /** The real duration (seconds) as the provider reports it, once its player is ready. */
  onDuration?: (seconds: number) => void;
  ref?: Ref<SipatVideoPlayerHandle>;
}

function urlsOf(provider: ExternalProvider, externalId: string, api: boolean, startS: number) {
  try {
    return { embed: externalEmbedUrl(provider, externalId, { api, startS }), watch: externalWatchUrl(provider, externalId) };
  } catch {
    return null;
  }
}

/**
 * Provider video in the same frame as the house player. Without `onEvent`/`onDuration` it is a plain frame;
 * with them the provider's API reports what was watched. The host places `ExternalVideoLink` under it.
 */
export default function ExternalVideoPlayer({
  provider, externalId, title, blockedAfterMs = 8000, onEvent, rules, resumeAt, furthest, onDuration, ref,
}: ExternalVideoPlayerProps) {
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const frame = useRef<HTMLIFrameElement>(null);
  const tracker = useRef<ExternalTracker | null>(null);
  const api = !!onEvent || !!onDuration;
  const [startS] = useState(() => resumeAt ?? 0);
  const urls = urlsOf(provider, externalId, api, startS);
  const valid = urls !== null;
  const latest = useRef({ onEvent, onDuration, rules, resumeAt, furthest });
  latest.current = { onEvent, onDuration, rules, resumeAt, furthest };

  useEffect(() => {
    setBlocked(false);
    if (!valid) return;
    timer.current = setTimeout(() => setBlocked(true), blockedAfterMs);
    return () => clearTimeout(timer.current);
  }, [provider, externalId, blockedAfterMs, valid]);

  useEffect(() => {
    const iframe = frame.current;
    if (!api || !valid || !iframe) return;
    const current = latest.current;
    const tracked = createExternalTracker({
      rules: current.rules,
      resumeAt: current.resumeAt,
      furthest: current.furthest,
      onEvent: event => latest.current.onEvent?.(event),
    });
    const ready = tracked.callbacks.ready;
    tracked.callbacks.ready = durationS => { ready(durationS); if (durationS > 0) latest.current.onDuration?.(durationS); };
    tracker.current = tracked;
    let gone = false;
    const stop = new AbortController();
    connectProvider(provider, iframe, tracked.callbacks, stop.signal)
      .then(control => { if (gone) control.destroy(); else tracked.connect(control); })
      .catch(() => undefined);
    return () => {
      gone = true;
      stop.abort();
      tracked.detach();
      if (tracker.current === tracked) tracker.current = null;
    };
  }, [api, valid, provider, externalId]);

  useImperativeHandle(ref, () => ({
    requestSave: reason => tracker.current?.requestSave(reason) ?? Promise.resolve(true),
    play: () => { tracker.current?.play(); return Promise.resolve(); },
    pause: () => tracker.current?.pause(),
  }), []);

  function loaded() { clearTimeout(timer.current); setBlocked(false); }

  if (!urls) {
    return <div className="sipat-player">
      <div className="sipat-player-error" role="alert"><p>{texts.externalUnavailable}</p></div>
    </div>;
  }

  const openText = texts.externalOpenOutside.replace('{provider}', provider);
  return <div className="sipat-player">
    <iframe
      allow="fullscreen; picture-in-picture" allowFullScreen className="sipat-player-embed"
      onLoad={loaded} ref={frame} referrerPolicy="strict-origin-when-cross-origin" src={urls.embed} title={title} />
    {blocked && <div className="sipat-player-error" role="alert">
      <p>{texts.externalBlocked}</p>
      <a className="sipat-player-retry sipat-player-link" href={urls.watch} rel="noopener noreferrer" target="_blank">{openText}</a>
    </div>}
  </div>;
}
