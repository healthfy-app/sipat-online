import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameModule } from './api';
import VideoPreview from './VideoPreview';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const quiz: GameModule = {
  id: 'quiz', title: 'Quiz do vídeo', gameType: 'Quiz', createdAt: '', usageCount: 0,
  questions: [{ text: 'Qual a opção segura?', options: ['Usar EPI', 'Ignorar'], correctIndex: 0 }],
};
const checkpoints = [{ id: 'cp-1', timeMilliseconds: 2000, module: quiz }];

function setup() {
  const view = render(<VideoPreview checkpoints={checkpoints} src="/demo.mp4" title="Vídeo de teste" />);
  const video = view.container.querySelector('video')!;
  Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
  Object.defineProperty(video, 'duration', { configurable: true, value: 10 });
  vi.spyOn(video, 'pause').mockImplementation(() => { Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true }); });
  vi.spyOn(video, 'play').mockImplementation(() => { Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false }); return Promise.resolve(); });
  return { video };
}
const at = (video: HTMLVideoElement, seconds: number) => { Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: seconds }); fireEvent.timeUpdate(video); };

describe('video preview with games at given moments', () => {
  it('opens the game when the video reaches its moment, then resumes', async () => {
    const user = userEvent.setup();
    const { video } = setup();
    at(video, 1.9);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    at(video, 2);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(await screen.findByRole('dialog', { name: 'Quiz do vídeo' }, { timeout: 5000 })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Pular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(video.play).toHaveBeenCalled();
  });

  it('does not reopen the same game while playing on, but does after seeking back before it', async () => {
    const user = userEvent.setup();
    const { video } = setup();
    at(video, 2);
    await user.click(await screen.findByRole('button', { name: 'Pular' }, { timeout: 5000 }));
    at(video, 3);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    at(video, 0.5);
    at(video, 2.1);
    expect(await screen.findByRole('dialog', { name: 'Quiz do vídeo' })).toBeVisible();
  });

  it('draws the game on the timeline', () => {
    setup();
    expect(document.querySelectorAll('.sipat-scrubber-marker')).toHaveLength(1);
  });
});
