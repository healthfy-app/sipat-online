import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SipatVideoPlayer from '../../src/react/SipatVideoPlayer';
import { QUALITY_PREFERENCE_KEY, type VideoSource } from '../../src/core/sources';

const both: VideoSource[] = [{ src: '/720.mp4', quality: '720p' as const }, { src: '/480.mp4', quality: '480p' as const }];

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

function mount(sources = both, onEvent = vi.fn()) {
  const result = render(<SipatVideoPlayer onEvent={onEvent} sources={sources} title="Aula" />);
  const video = result.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  act(() => { video.dispatchEvent(new Event('durationchange')); });
  return { ...result, video, onEvent };
}

describe('quality menu', () => {
  it('offers automatic, 720p and 480p only when there are two sources', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade: Automática (720p)' }));
    expect(screen.getAllByRole('menuitemradio').map(item => item.textContent)).toEqual(['Automática', '720p', '480p']);
    expect(screen.getByRole('menuitemradio', { name: 'Automática' })).toHaveAttribute('aria-checked', 'true');
    cleanup();
    mount([{ src: '/a.mp4' }]);
    expect(screen.queryByRole('button', { name: /Qualidade/ })).not.toBeInTheDocument();
  });

  it('switches and remembers the choice', () => {
    const { video } = mount();
    expect(video).toHaveAttribute('src', '/720.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade: Automática (720p)' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '480p' }));
    expect(video.getAttribute('src')).toBe('/480.mp4');
    expect(localStorage.getItem(QUALITY_PREFERENCE_KEY)).toBe('480p');
    expect(screen.getByRole('button', { name: 'Qualidade: 480p' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });

  it('loads the file once per switch, by menu or by automatic step-down', () => {
    vi.useFakeTimers();
    try {
      const loads: string[] = [];
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
      const set = vi.spyOn(Element.prototype, 'setAttribute');
      const { video } = mount();
      Object.defineProperty(video, 'src', { configurable: true, get: () => descriptor.get!.call(video), set: (value: string) => { loads.push(value); descriptor.set!.call(video, value); } });
      set.mockClear();
      const fire = (name: string) => act(() => { video.dispatchEvent(new Event(name)); });
      const stall = () => { fire('waiting'); act(() => { vi.advanceTimersByTime(600); }); fire('playing'); };
      fire('play'); fire('playing'); stall(); stall();
      expect(video.getAttribute('src')).toBe('/480.mp4');
      expect(loads).toEqual(['/480.mp4']);
      expect(set.mock.calls.filter(([name]) => name === 'src')).toEqual([]);

      fireEvent.click(screen.getByRole('button', { name: /Qualidade/ }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: '720p' }));
      expect(loads).toEqual(['/480.mp4', '/720.mp4']);
      expect(set.mock.calls.filter(([name]) => name === 'src')).toEqual([]);
    } finally { vi.useRealTimers(); }
  });

  it('starts in the saved quality', () => {
    localStorage.setItem(QUALITY_PREFERENCE_KEY, '480p');
    const { video } = mount();
    expect(video).toHaveAttribute('src', '/480.mp4');
  });

  it('works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    const { video } = mount();
    expect(video).toHaveAttribute('src', '/720.mp4');
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade: Automática (720p)' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '480p' }));
    expect(video.getAttribute('src')).toBe('/480.mp4');
  });

  it('closes with Escape', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Qualidade: Automática (720p)' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
  });
});
