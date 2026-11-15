import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SipatVideoPlayer from '../../src/react/SipatVideoPlayer';

afterEach(cleanup);

function prepare(container: HTMLElement) {
  const video = container.querySelector('video')!;
  const define = (name: string, value: unknown) => Object.defineProperty(video, name, { configurable: true, writable: true, value });
  define('duration', 60); define('currentTime', 5); define('paused', true); define('seeking', false);
  video.pause = vi.fn(() => { define('paused', true); });
  video.play = vi.fn(() => { define('paused', false); return Promise.resolve(); });
  act(() => { video.dispatchEvent(new Event('durationchange')); });
  return { video, define };
}

describe('SipatVideoPlayer', () => {
  it('renders our controls over the video with the title as its label', () => {
    const { container } = render(<SipatVideoPlayer sources={[{ src: '/a.mp4' }]} title="Aula 1" />);
    const video = screen.getByLabelText('Aula 1');
    expect(video).toBe(container.querySelector('video'));
    expect(video).toHaveAttribute('slot', 'media');
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('src', '/a.mp4');
    expect(screen.getByRole('slider', { name: 'Posição do vídeo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeInTheDocument();
  });

  it('shows the activity over the paused video at its checkpoint and resumes when it closes', () => {
    const checkpoints = [{ id: 'a', seconds: 5, title: 'Quiz', done: false }];
    const { container, rerender } = render(<SipatVideoPlayer checkpoints={checkpoints} sources={[{ src: '/a.mp4' }]} title="Aula" />);
    const { video, define } = prepare(container);
    define('paused', false); define('currentTime', 5.2);
    act(() => { video.dispatchEvent(new Event('timeupdate')); });
    expect(video.pause).toHaveBeenCalledOnce();

    rerender(<SipatVideoPlayer activity={<p>Jogo aberto</p>} checkpoints={checkpoints} sources={[{ src: '/a.mp4' }]} title="Aula" />);
    expect(screen.getByText('Jogo aberto')).toBeVisible();
    expect(video.play).not.toHaveBeenCalled();

    rerender(<SipatVideoPlayer activity={null} checkpoints={checkpoints} sources={[{ src: '/a.mp4' }]} title="Aula" />);
    expect(screen.queryByText('Jogo aberto')).not.toBeInTheDocument();
    expect(video.play).toHaveBeenCalled();
  });

  it('offers a retry when the video fails to load', () => {
    const { container } = render(<SipatVideoPlayer sources={[{ src: '/a.mp4' }]} title="Aula" />);
    const { video } = prepare(container);
    video.load = vi.fn();
    act(() => { video.dispatchEvent(new Event('error')); });
    expect(screen.getByText('Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(video.load).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Não foi possível carregar/)).not.toBeInTheDocument();
  });

  it('stops the End key at what was already watched', () => {
    const { container } = render(<SipatVideoPlayer furthest={10} rules={{ watchInOrder: true }} sources={[{ src: '/a.mp4' }]} title="Aula" />);
    const { video } = prepare(container);
    const slider = screen.getByRole('slider');
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(10);
  });
});
