import { describe, expect, it } from 'vitest';
import { externalIdFromLink } from './externalLink';

describe('externalIdFromLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('reads the YouTube id from %s', (link, id) => {
    expect(externalIdFromLink('YouTube', link)).toBe(id);
  });

  it.each([
    ['https://vimeo.com/123456789', '123456789'],
    ['https://www.vimeo.com/123456789', '123456789'],
    ['https://player.vimeo.com/video/123456789?h=abc', '123456789'],
  ])('reads the Vimeo id from %s', (link, id) => {
    expect(externalIdFromLink('Vimeo', link)).toBe(id);
  });

  it.each([
    ['YouTube', ''],
    ['YouTube', 'not a link'],
    ['YouTube', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'],
    ['YouTube', 'https://evil.com/youtu.be/dQw4w9WgXcQ'],
    ['YouTube', 'https://www.youtube.com/watch?v=curto'],
    ['YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ!!'],
    ['YouTube', 'https://vimeo.com/123456789'],
    ['Vimeo', 'https://vimeo.com/channels/staffpicks'],
    ['Vimeo', 'https://vimeo.com.evil.com/123456789'],
    ['Vimeo', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ] as const)('refuses %s link %s', (provider, link) => {
    expect(externalIdFromLink(provider, link)).toBeNull();
  });
});
