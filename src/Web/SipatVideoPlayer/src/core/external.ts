export type ExternalProvider = 'YouTube' | 'Vimeo';

const idPattern: Record<ExternalProvider, RegExp> = {
  YouTube: /^[A-Za-z0-9_-]{11}$/,
  Vimeo: /^[0-9]{1,32}$/,
};

/** Only ids of the provider's own shape may reach a URL: a crafted id must never change the host or path. */
function checkedId(provider: ExternalProvider, externalId: string): string {
  if (externalId.length > 240 || !idPattern[provider]?.test(externalId)) throw new Error(`Invalid ${provider} video id`);
  return externalId;
}

export interface EmbedOptions {
  /** Lets the page follow the video through the provider's player API. */
  api?: boolean;
  /** Whole seconds to start at (only with `api`). */
  startS?: number;
}

export function externalEmbedUrl(provider: ExternalProvider, externalId: string, options: EmbedOptions = {}): string {
  const id = checkedId(provider, externalId);
  const start = options.api && options.startS && options.startS >= 1 ? Math.floor(options.startS) : 0;
  if (provider === 'YouTube') {
    if (!options.api) return `https://www.youtube-nocookie.com/embed/${id}`;
    const origin = typeof location === 'undefined' ? '' : `&origin=${encodeURIComponent(location.origin)}`;
    return `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&playsinline=1${start ? `&start=${start}` : ''}${origin}`;
  }
  return `https://player.vimeo.com/video/${id}?dnt=1${start ? `#t=${start}s` : ''}`;
}

export function externalWatchUrl(provider: ExternalProvider, externalId: string): string {
  const id = checkedId(provider, externalId);
  return provider === 'YouTube' ? `https://youtu.be/${id}` : `https://vimeo.com/${id}`;
}
