import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameModule, PlatformCourseVideo } from '@/api';
import type { Catalog, CatalogVideo, DaySlots } from '../model';
import { buildPreviewDays } from './previewModel';
import { reducePreview, startPreview, withWatched } from './previewSession';
import TrainingPreview from './TrainingPreview';

afterEach(cleanup);
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
});

function video(id: string, title: string, durationMs: number, external?: { provider: 'YouTube'; externalId: string }): CatalogVideo {
  const source = {
    id, title, contentType: 'video/mp4', sizeBytes: 1, durationMilliseconds: durationMs, createdAt: '2026-11-01T00:00:00Z',
    fileUrl: external ? '' : `/videos/${id}.mp4`, status: 'Ready', processingError: null, hasSd480: false, checkpoints: [],
    provider: external?.provider ?? 'Sipat', externalId: external?.externalId ?? null,
  } satisfies PlatformCourseVideo;
  return { id, title, durationMs, code: null, provider: source.provider, source };
}

const quiz = { id: 'g1', title: 'Quiz do EPI' } as GameModule;
const catalog: Catalog = {
  videos: new Map([
    ['v1', video('v1', 'Uso do capacete', 60_000)],
    ['v2', video('v2', 'Protetor auricular', 120_000)],
    ['yt', video('yt', 'Palestra no YouTube', 0, { provider: 'YouTube', externalId: 'abc' })],
  ]),
  subjects: [],
  games: new Map([['g1', quiz]]),
};
const day = (key: string, title: string, date: string, videos: (string | null)[], games: string[] = []): DaySlots =>
  ({ key, title, date, subject: '', videos, games });
const board = [day('a', 'Abertura', '2026-12-04', ['v1', 'gone', null, 'yt', 'v2'], ['g1']), day('b', '', '2026-12-05', [])];

describe('the preview of a training, from the board', () => {
  it('makes each day of the board a day of the participant', () => {
    const [first, second] = buildPreviewDays(board, catalog, 'Dia', { games: true });
    // a video the catalog no longer has is left out, and the positions follow the ones that stay
    expect(first.lessons.map(lesson => [lesson.title, lesson.position])).toEqual([['Uso do capacete', 1], ['Palestra no YouTube', 2], ['Protetor auricular', 3]]);
    // a YouTube video with no length is an extra: it never counts
    expect(first.lessons.map(lesson => !!lesson.isBonus)).toEqual([false, true, false]);
    expect(first.sources[first.lessons[0].id]).toEqual({ kind: 'house', url: '/videos/v1.mp4' });
    expect(first.sources[first.lessons[1].id]).toEqual({ kind: 'external', provider: 'YouTube', externalId: 'abc' });
    expect(first.games).toEqual([quiz]);
    // a day with no slogan gets the name the server gives it
    expect(second).toMatchObject({ title: 'Dia 2', position: 2, date: '2026-12-05', lessons: [] });
  });

  it('leaves the games out when the company plan has none', () => {
    expect(buildPreviewDays(board, catalog, 'Dia', { games: false })[0].games).toEqual([]);
  });

  it('keeps what was watched in memory: the furthest point, the end, and a finished game stays finished', () => {
    const days = buildPreviewDays(board, catalog, 'Dia', { games: true });
    const lesson = days[0].lessons[0];
    let state = startPreview(days);
    expect(state.dayKey).toBe('a');
    state = reducePreview(state, { type: 'progress', lessonId: lesson.id, positionMs: 30_000, reachedMs: 30_000, durationMs: 60_000 });
    // going back does not undo what was watched
    state = reducePreview(state, { type: 'progress', lessonId: lesson.id, positionMs: 10_000, reachedMs: 10_000, durationMs: 60_000 });
    expect(withWatched(days[0].lessons, state.watched)[0]).toMatchObject({ watchedPercentage: 50, lastPlaybackPositionMilliseconds: 10_000, isCompleted: false });
    state = reducePreview(state, { type: 'ended', lessonId: lesson.id, durationMs: 60_000, upNext: 'next', game: null });
    expect(withWatched(days[0].lessons, state.watched)[0]).toMatchObject({ watchedPercentage: 100, isCompleted: true });
    expect(state.upNext).toBe('next');

    state = reducePreview(state, { type: 'startGame', id: 'quiz' });
    state = reducePreview(state, { type: 'closeGame', outcome: 'completed', next: null });
    state = reducePreview(state, { type: 'startGame', id: 'quiz' });
    state = reducePreview(state, { type: 'closeGame', outcome: 'skipped', next: null });
    expect(state.outcomes.quiz).toBe('completed');
    expect(state.game).toBeNull();
  });

  it('shows the day on the participant pieces, goes through the days on the bar and closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TrainingPreview catalog={catalog} days={board} games name="SIPAT 2026" onClose={onClose} word="Dia" />);

    const preview = screen.getByRole('dialog', { name: 'Visão do participante' });
    expect(within(preview).getByRole('heading', { level: 1, name: 'Abertura' })).toBeVisible();
    expect(within(preview).getByText('Vídeo 1 de 2')).toBeVisible();
    expect(within(preview).getByText('0 de 2 vídeos · 0%')).toBeVisible();
    expect(within(preview).getByRole('button', { name: /Uso do capacete/ })).toHaveAttribute('aria-current', 'step');
    expect(within(preview).getByRole('region', { name: 'Atividades para praticar' })).toBeVisible();

    await user.click(within(preview).getByRole('button', { name: /Protetor auricular/ }));
    expect(within(preview).getByText('Vídeo 2 de 2')).toBeVisible();

    await user.click(within(preview).getByRole('button', { name: /^Dia 2/ }));
    expect(within(preview).getByRole('heading', { level: 1, name: 'Dia 2' })).toBeVisible();
    expect(within(preview).getByText('Este dia ainda não tem vídeos')).toBeVisible();
    expect(within(preview).getByRole('button', { name: /^Dia 2/ })).toHaveAttribute('aria-pressed', 'true');

    // the video picked on a day is still on stage when the person comes back to it
    await user.click(within(preview).getByRole('button', { name: /^Dia 1/ }));
    expect(within(preview).getByText('Vídeo 2 de 2')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});
