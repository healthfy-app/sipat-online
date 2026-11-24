import { describe, expect, it } from 'vitest';
import { externalEmbedUrl, externalWatchUrl } from '../../src/core/external';

describe('externalEmbedUrl', () => {
  it('uses the privacy-enhanced YouTube embed', () => {
    expect(externalEmbedUrl('YouTube', 'dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
  it('uses the Vimeo player with do-not-track', () => {
    expect(externalEmbedUrl('Vimeo', '76979871')).toBe('https://player.vimeo.com/video/76979871?dnt=1');
  });
  it.each([
    ['YouTube', 'a/b'], ['YouTube', 'x?y'], ['YouTube', 'short'], ['YouTube', 'dQw4w9WgXcQ&x=1'], ['YouTube', ''],
    ['Vimeo', 'a/b'], ['Vimeo', 'x?y'], ['Vimeo', '12ab'], ['Vimeo', ''], ['Vimeo', '1'.repeat(33)],
  ] as const)('throws for %s id %j', (provider, id) => {
    expect(() => externalEmbedUrl(provider, id)).toThrow(Error);
  });
});

describe('externalWatchUrl', () => {
  it('builds the public watch links', () => {
    expect(externalWatchUrl('YouTube', 'dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(externalWatchUrl('Vimeo', '76979871')).toBe('https://vimeo.com/76979871');
  });
  it('throws for an invalid id', () => {
    expect(() => externalWatchUrl('YouTube', 'a/b')).toThrow(Error);
    expect(() => externalWatchUrl('Vimeo', 'x?y')).toThrow(Error);
  });
});
