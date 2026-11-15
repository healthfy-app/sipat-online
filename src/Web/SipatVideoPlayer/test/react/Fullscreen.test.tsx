import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SipatVideoPlayer from '../../src/react/SipatVideoPlayer';
import type { PlayerEventHandler } from '../../src/core/events';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  document.documentElement.classList.remove('sipat-player-filling');
  document.body.style.overflow = '';
});

function mount(lock?: { furthest: number; onEvent: PlayerEventHandler }) {
  const result = render(<SipatVideoPlayer furthest={lock?.furthest} onEvent={lock?.onEvent}
    rules={lock ? { watchInOrder: true } : undefined} sources={[{ src: '/a.mp4' }]} title="Aula" />);
  const video = result.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 5 });
  act(() => { video.dispatchEvent(new Event('durationchange')); });
  return { ...result, video };
}

describe('SipatVideoPlayer timeline and fullscreen', () => {
  it('stops the End key at what was already watched and reports the block', () => {
    const onEvent = vi.fn();
    const { video } = mount({ furthest: 10, onEvent });
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(10);

    video.currentTime = 10;
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(10);
    expect(onEvent).toHaveBeenCalledWith({ type: 'seekBlocked' });
  });

  it('lets the keyboard move freely without a lock', () => {
    const { video } = mount();
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(60);
  });

  it('fills the page when the browser has no fullscreen', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(container.querySelector('.sipat-player')).toHaveClass('is-filling');
    expect(document.documentElement).toHaveClass('sipat-player-filling');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.sipat-player')).not.toHaveClass('is-filling');
    expect(document.documentElement).not.toHaveClass('sipat-player-filling');
  });

  it('uses the real fullscreen on the player frame and keeps our controls', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    const { container } = mount();
    const frame = container.querySelector('.sipat-player') as HTMLElement;
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    frame.requestFullscreen = requestFullscreen;
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
      expect(requestFullscreen).toHaveBeenCalledTimes(1);
      expect(frame).not.toHaveClass('is-filling');

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: frame });
      act(() => { document.dispatchEvent(new Event('fullscreenchange')); });
      expect(screen.getByRole('button', { name: 'Sair da tela cheia' })).toBeInTheDocument();
      expect(screen.getByRole('slider')).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
  });
});
