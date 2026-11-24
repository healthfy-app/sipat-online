import type { ExternalProvider } from './external';

/** What the page hears from a YouTube or Vimeo player. Times in seconds. */
export interface ProviderCallbacks {
  ready(durationS: number): void;
  play(currentS: number): void;
  pause(currentS: number): void;
  ended(currentS: number): void;
  time(currentS: number): void;
  rate(rate: number): void;
}

/** The commands the page gives the provider's player. */
export interface ProviderControl {
  seek(seconds: number): void;
  pause(): void;
  play(): void;
  setRate(rate: number): void;
  destroy(): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Win = Window & { YT?: any; Vimeo?: any; onYouTubeIframeAPIReady?: () => void };

const loading = new Map<string, Promise<void>>();

function loadScript(src: string, ready: () => boolean, hook?: (done: () => void) => void): Promise<void> {
  if (ready()) return Promise.resolve();
  const pending = loading.get(src);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    if (hook) hook(resolve);
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => { if (!hook) resolve(); };
    script.onerror = () => { loading.delete(src); reject(new Error(`Could not load ${src}`)); };
    document.head.appendChild(script);
  });
  loading.set(src, promise);
  return promise;
}

function loadYouTube(): Promise<any> {
  const win = window as Win;
  return loadScript('https://www.youtube.com/iframe_api', () => !!win.YT?.Player, done => {
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { previous?.(); done(); };
  }).then(() => win.YT);
}

function loadVimeo(): Promise<any> {
  const win = window as Win;
  return loadScript('https://player.vimeo.com/api/player.js', () => !!win.Vimeo?.Player).then(() => win.Vimeo);
}

const POLL_MS = 400;

function connectYouTube(iframe: HTMLIFrameElement, on: ProviderCallbacks): Promise<ProviderControl> {
  return loadYouTube().then(YT => new Promise<ProviderControl>(resolve => {
    let poll: ReturnType<typeof setInterval> | undefined;
    let player: any;
    const now = (): number => { try { return Number(player?.getCurrentTime?.()) || 0; } catch { return 0; } };
    const control: ProviderControl = {
      seek: seconds => player?.seekTo?.(seconds, true),
      pause: () => player?.pauseVideo?.(),
      play: () => player?.playVideo?.(),
      setRate: rate => player?.setPlaybackRate?.(rate),
      destroy: () => { clearInterval(poll); },
    };
    player = new YT.Player(iframe, {
      events: {
        onReady: () => {
          // YouTube may report 0 until the video's data arrives: the duration is sent again once known
          let known = Number(player.getDuration?.()) || 0;
          on.ready(known);
          poll = setInterval(() => {
            const duration = Number(player.getDuration?.()) || 0;
            if (duration > 0 && duration !== known) { known = duration; on.ready(duration); }
            on.time(now());
          }, POLL_MS);
          resolve(control);
        },
        onStateChange: (event: { data: number }) => {
          if (event.data === 1) on.play(now());
          else if (event.data === 2) on.pause(now());
          else if (event.data === 0) on.ended(now());
        },
        onPlaybackRateChange: (event: { data: number }) => on.rate(Number(event.data) || 1),
      },
    });
  }));
}

function connectVimeo(iframe: HTMLIFrameElement, on: ProviderCallbacks): Promise<ProviderControl> {
  return loadVimeo().then(async Vimeo => {
    const player = new Vimeo.Player(iframe);
    let current = 0;
    await player.ready();
    on.ready(Number(await player.getDuration().catch(() => 0)) || 0);
    player.on('timeupdate', (data: { seconds: number }) => { current = data.seconds; on.time(current); });
    player.on('play', (data?: { seconds: number }) => { if (data) current = data.seconds; on.play(current); });
    player.on('pause', (data?: { seconds: number }) => { if (data) current = data.seconds; on.pause(current); });
    player.on('ended', (data?: { seconds: number }) => { if (data) current = data.seconds; on.ended(current); });
    player.on('playbackratechange', (data: { playbackRate: number }) => on.rate(Number(data.playbackRate) || 1));
    const ignore = () => undefined;
    return {
      seek: seconds => { player.setCurrentTime(seconds).catch(ignore); },
      pause: () => { player.pause().catch(ignore); },
      play: () => { player.play().catch(ignore); },
      setRate: rate => { player.setPlaybackRate(rate).catch(ignore); },
      destroy: () => { player.off('timeupdate'); player.off('play'); player.off('pause'); player.off('ended'); player.off('playbackratechange'); },
    };
  });
}

/** Follows the provider iframe through its official player API (the iframe must use `externalEmbedUrl(..., { api: true })`). */
export function connectProvider(provider: ExternalProvider, iframe: HTMLIFrameElement, on: ProviderCallbacks): Promise<ProviderControl> {
  return provider === 'YouTube' ? connectYouTube(iframe, on) : connectVimeo(iframe, on);
}
