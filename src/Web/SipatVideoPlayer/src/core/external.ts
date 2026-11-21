export type ExternalProvider = 'YouTube' | 'Vimeo';

const idPattern: Record<ExternalProvider, RegExp> = {
  YouTube: /^[A-Za-z0-9_-]{11}$/,
  Vimeo: /^[0-9]{1,32}$/,
};

/** Only ids of the provider's own shape may reach a URL: a crafted id must never change the host or path. */
function checkedId(provider: ExternalProvider, externalId: string): string {
  if (!idPattern[provider]?.test(externalId)) throw new Error(`Invalid ${provider} video id`);
  return externalId;
}

export function externalEmbedUrl(provider: ExternalProvider, externalId: string): string {
  const id = checkedId(provider, externalId);
  return provider === 'YouTube'
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}?dnt=1`;
}

export function externalWatchUrl(provider: ExternalProvider, externalId: string): string {
  const id = checkedId(provider, externalId);
  return provider === 'YouTube' ? `https://youtu.be/${id}` : `https://vimeo.com/${id}`;
}
