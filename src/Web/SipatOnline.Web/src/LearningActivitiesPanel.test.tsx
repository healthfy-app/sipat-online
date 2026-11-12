import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LearningActivitiesPanel from './LearningActivitiesPanel';
import type { LearningActivity } from './api';

const { load, save } = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('./api', () => ({ getLearningActivities: load, saveLearningActivityOutcome: save }));

const checkpoint: LearningActivity = {
  id: 'checkpoint-0-0', afterVideoCount: 0, lessonId: 'lesson-1', timeMilliseconds: 2000, outcome: null,
  module: { id: 'quiz', title: 'Pratique segurança', gameType: 'Quiz', createdAt: '', usageCount: 0,
    questions: [{ text: 'Qual a opção segura?', options: ['Usar EPI', 'Ignorar proteção'], correctIndex: 0 }] },
};

beforeEach(() => {
  load.mockReset(); save.mockReset().mockResolvedValue({ saved: true });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, writable: true, value: false });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, writable: true, value: true });
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function setup(items: LearningActivity[]) {
  load.mockResolvedValue({ revisionId: 'revision-1', items });
  const video = document.createElement('video');
  Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
  const videoRef = { current: video };
  const result = render(<LearningActivitiesPanel trackId="track-1" lessonId="lesson-1"
    lessonPosition={1} playbackKey="session-1" videoRef={videoRef} />);
  await waitFor(() => expect(load).toHaveBeenCalledWith('track-1'));
  if (items.length) await screen.findByRole('region', { name: 'Atividades para praticar' });
  return { ...result, video, videoRef };
}

describe('course activities during playback', () => {
  it('pauses exactly at a checkpoint, persists the answer and resumes without reopening it', async () => {
    const user = userEvent.setup();
    const { video } = await setup([checkpoint]);
    video.currentTime = 1.999; fireEvent.timeUpdate(video);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    video.currentTime = 2; fireEvent.timeUpdate(video);
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Pratique segurança');
    expect(video.paused).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Usar EPI' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledExactlyOnceWith('track-1', 'checkpoint-0-0', 'completed');
    expect(video.play).toHaveBeenCalledTimes(1);
    fireEvent.timeUpdate(video);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver atividades' }));
    const completedActivity = screen.getByRole('button', { name: 'Pratique segurança · Concluída' });
    expect(completedActivity).toBeVisible();
    expect(completedActivity).toHaveTextContent('✓');
    expect(completedActivity).not.toHaveTextContent('Concluída');
  });

  it('does not open a saved checkpoint again after reloading the course', async () => {
    const user = userEvent.setup();
    const { video } = await setup([{ ...checkpoint, outcome: 'skipped' }]);
    video.currentTime = 3; fireEvent.timeUpdate(video);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(video.pause).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ver atividades' }));
    expect(screen.getByRole('button', { name: 'Pratique segurança · Pulada' })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });

  it('opens the optional activity list in a dialog and resumes the video when dismissed', async () => {
    const user = userEvent.setup();
    const { video } = await setup([checkpoint]);

    await user.click(screen.getByRole('button', { name: 'Ver atividades' }));
    const dialog = screen.getByRole('dialog', { name: 'Atividades para praticar' });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass('learning-dialog', 'learning-activities-dialog');
    expect(dialog).toHaveTextContent('Todas são opcionais e não bloqueiam seu progresso.');
    expect(video.paused).toBe(true);
    expect(screen.getByRole('button', { name: 'Pratique segurança · Iniciar atividade' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Fechar atividades para praticar' }));
    await waitFor(() => expect(video.play).toHaveBeenCalledTimes(1));
    expect(video.paused).toBe(false);
  });

  it('does not trigger checkpoints for another lesson or while seeking', async () => {
    const { video } = await setup([{ ...checkpoint, lessonId: 'lesson-2' }]);
    video.currentTime = 3; fireEvent.timeUpdate(video);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('keeps a failed outcome open and paused until a successful retry', async () => {
    const user = userEvent.setup();
    const { video } = await setup([checkpoint]);
    save.mockRejectedValueOnce(new Error('Registro indisponível.'));
    video.currentTime = 2; fireEvent.timeUpdate(video);
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Registro indisponível.');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(video.play).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(save).toHaveBeenNthCalledWith(2, 'track-1', 'checkpoint-0-0', 'skipped');
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('sequences activities before and after the video without restarting an ended video', async () => {
    const user = userEvent.setup();
    const before = { ...checkpoint, id: 'placement-0', lessonId: null, timeMilliseconds: null, afterVideoCount: 0 };
    const after = { ...before, id: 'placement-1', afterVideoCount: 1 };
    const { video } = await setup([before, after, { ...after, id: 'placement-2' }]);
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(video.paused).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(video.play).toHaveBeenCalledTimes(1));
    Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true });
    Object.defineProperty(video, 'ended', { configurable: true, value: true });
    fireEvent.ended(video);
    expect(await screen.findByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('track-1', 'placement-1', 'skipped'));
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith('track-1', 'placement-2', 'skipped');
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('reports an autoplay rejection instead of claiming playback resumed', async () => {
    const user = userEvent.setup();
    const { video } = await setup([checkpoint]);
    vi.mocked(video.play).mockRejectedValueOnce(new DOMException('Autoplay blocked', 'NotAllowedError'));
    video.currentTime = 2; fireEvent.timeUpdate(video);
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Use Reproduzir para continuar o vídeo.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(video.paused).toBe(true);
  });

  it('leaves a course without games playable and reports activity loading failures explicitly', async () => {
    const { video, rerender, videoRef } = await setup([]);
    fireEvent.playing(video); video.currentTime = 3; fireEvent.timeUpdate(video);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(video.pause).not.toHaveBeenCalled();
    load.mockRejectedValueOnce(new Error('Atividades indisponíveis.'));
    rerender(<LearningActivitiesPanel trackId="track-2" lessonId="lesson-1"
      lessonPosition={1} playbackKey="session-1" videoRef={videoRef} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Atividades indisponíveis.');
    expect(screen.getByRole('button', { name: 'Recarregar atividades' })).toBeVisible();
    expect(video.pause).not.toHaveBeenCalled();
  });
});
