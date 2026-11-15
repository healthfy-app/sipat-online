import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SipatPlayer, { type PlayerLock } from '../../src/react/SipatPlayer';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  document.documentElement.classList.remove('sipat-player-filling');
  document.body.style.overflow = '';
});

function mount(lock?: PlayerLock) {
  const videoRef = createRef<HTMLVideoElement>();
  const result = render(<SipatPlayer lock={lock} videoRef={videoRef}><video ref={videoRef} slot="media" /></SipatPlayer>);
  const video = videoRef.current!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 5 });
  act(() => { video.dispatchEvent(new Event('durationchange')); });
  return { ...result, video };
}

describe('SipatPlayer', () => {
  it('stops the End key at what was already watched and reports the block', () => {
    const onBlocked = vi.fn();
    const { video } = mount({ furthest: { current: 10 }, onBlocked });
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(10);

    video.currentTime = 10;
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(10);
    expect(onBlocked).toHaveBeenCalled();
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
