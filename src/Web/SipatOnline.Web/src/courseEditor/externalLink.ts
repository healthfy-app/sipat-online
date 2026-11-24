import type { ExternalProvider } from '@sipat/video-player';

const youtubeId = /^[A-Za-z0-9_-]{11}$/;
const vimeoId = /^\d+$/;
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const vimeoHosts = new Set(['vimeo.com', 'www.vimeo.com']);

function parse(link: string): URL | null {
  try {
    const url = new URL(link.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function youtube(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (url.hostname === 'youtu.be') id = parts[0];
  else if (youtubeHosts.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v') ?? undefined;
    else if (parts[0] === 'shorts' || parts[0] === 'embed') id = parts[1];
  }
  return id && youtubeId.test(id) ? id : null;
}

function vimeo(url: URL): string | null {
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | undefined;
  if (vimeoHosts.has(url.hostname)) id = parts.length === 1 ? parts[0] : undefined;
  else if (url.hostname === 'player.vimeo.com' && parts[0] === 'video') id = parts[1];
  return id && vimeoId.test(id) ? id : null;
}

/**
 * The video id of a YouTube or Vimeo link, only to enable the button and show the preview.
 * The server is the authority: it decides what is accepted and writes the message when it refuses.
 */
export function externalIdFromLink(provider: ExternalProvider, link: string): string | null {
  const url = parse(link);
  if (!url) return null;
  return provider === 'YouTube' ? youtube(url) : vimeo(url);
}
