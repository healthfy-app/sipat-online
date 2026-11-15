import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PlaygroundApp from './PlaygroundApp';

afterEach(cleanup);

function prepare(container: HTMLElement) {
  const video = container.querySelector('video')!;
  const define = (name: string, value: unknown) => Object.defineProperty(video, name, { configurable: true, writable: true, value });
  define('duration', 60); define('currentTime', 0); define('paused', true); define('seeking', false);
  video.pause = vi.fn(() => { define('paused', true); });
  video.play = vi.fn(() => { define('paused', false); return Promise.resolve(); });
  act(() => { video.dispatchEvent(new Event('durationchange')); });
  return { video, define };
}

const field = (name: string) => screen.getByLabelText(name);

describe('PlaygroundApp', () => {
  it('logs the events the player emits', () => {
    const { container } = render(<PlaygroundApp />);
    const { video } = prepare(container);
    act(() => { video.dispatchEvent(new Event('playing')); });
    expect(within(screen.getByRole('list', { name: 'Registro de eventos' })).getByText('playing')).toBeInTheDocument();
  });

  it('turns the watch-in-order rule on and off', () => {
    const { container } = render(<PlaygroundApp />);
    const { video } = prepare(container);
    fireEvent.change(field('Liberado até (s)'), { target: { value: '10' } });
    fireEvent.click(field('Assistir em ordem'));
    const slider = screen.getByRole('slider', { name: 'Posição do vídeo' });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(10);

    fireEvent.click(field('Assistir em ordem'));
    // the timeline redraws on the video's next timeupdate, as it does while playing
    act(() => { video.dispatchEvent(new Event('timeupdate')); });
    slider.focus();
    fireEvent.keyDown(slider, { key: 'End' });
    expect(video.currentTime).toBe(60);
  });

  it('opens the sample activity at its checkpoint', () => {
    const { container } = render(<PlaygroundApp />);
    const { video, define } = prepare(container);
    fireEvent.change(field('Ponto em (s)'), { target: { value: '5' } });
    fireEvent.change(field('Título do ponto'), { target: { value: 'Pausa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto de atividade' }));
    define('paused', false); define('currentTime', 5.1);
    act(() => { video.dispatchEvent(new Event('timeupdate')); });
    expect(screen.getByText('Atividade de exemplo')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByText('Atividade de exemplo')).not.toBeInTheDocument();
  });
});
