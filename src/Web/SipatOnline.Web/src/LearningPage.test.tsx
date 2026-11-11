import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import LearningPage, { type LearningSummary } from './LearningPage';

const { getAssignedTrack, listAssignedTracks, startPlayback, savePosition, recordRange } = vi.hoisted(() => ({
  getAssignedTrack: vi.fn(),
  listAssignedTracks: vi.fn(),
  startPlayback: vi.fn(),
  savePosition: vi.fn(),
  recordRange: vi.fn(),
}));

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  },
  getAssignedLearningTrack: getAssignedTrack,
  listAssignedLearningTracks: listAssignedTracks,
  startLearningPlayback: startPlayback,
  saveLearningPosition: savePosition,
  recordLearningPlaybackRange: recordRange,
  getLearningActivities: vi.fn().mockResolvedValue({ revisionId: 'revision-1', items: [] }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, writable: true, value: true });
  });
});

const trackCard = {
  id: 'track-1',
  sipatEventId: 'sipat-1',
  title: 'Segurança no trabalho',
  description: 'Orientações para o dia a dia.',
  revisionNumber: 1,
  lessonCount: 1,
  completedLessonCount: 0,
  progressPercentage: 0,
};

const lesson = {
  id: 'lesson-1',
  title: 'Identificação de riscos',
  description: 'Como reconhecer riscos no ambiente de trabalho.',
  position: 1,
  durationMilliseconds: 5000,
  lastPlaybackPositionMilliseconds: 0,
  watchedPercentage: 0,
  isCompleted: false,
  completedAt: null,
};

function renderAt(path: string, onSummary?: (summary: LearningSummary | null) => void) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Outlet context={onSummary} />}>
          <Route element={<LearningPage />} path="/learning" />
          <Route element={<LearningPage />} path="/learning/tracks/:trackId" />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function progress(position: number, percentage = 40) {
  return { ...lesson, lessonId: lesson.id, lastPlaybackPositionMilliseconds: position,
    watchedPercentage: percentage, isCompleted: percentage >= 90, completedAt: null };
}

async function playableCourse(lessons = [lesson]) {
  listAssignedTracks.mockResolvedValue([trackCard]);
  getAssignedTrack.mockResolvedValue({ track: { ...trackCard, lessonCount: lessons.length }, lessons });
  startPlayback.mockReset().mockImplementation((_track: string, id: string) => Promise.resolve({
    url: `https://media.example.test/${id}.mp4`, sessionId: `session-${id}`,
    expiresAt: '2099-01-01T00:00:00Z', isDevelopmentDemo: false,
  }));
  recordRange.mockReset().mockResolvedValue(progress(2000));
  savePosition.mockReset().mockImplementation((_track: string, _lesson: string, position: number) =>
    Promise.resolve(progress(position)));
  const result = renderAt('/learning/tracks/track-1');
  await waitFor(() => expect(result.container.querySelector('video')).toHaveAttribute('src',
    `https://media.example.test/${lessons[0].id}.mp4`));
  const video = result.container.querySelector('video')!;
  Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
  return { ...result, video };
}

function atTime(video: HTMLVideoElement, seconds: number) {
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: seconds });
}

describe('learning experience', () => {
  it.each([90, 99])('shows completed courses and the formation at 100 when raw coverage is %i', async (coverage) => {
    const user = userEvent.setup();
    const onSummary = vi.fn();
    listAssignedTracks.mockResolvedValue([{ ...trackCard, lessonCount: 5, completedLessonCount: 5, progressPercentage: coverage }]);
    renderAt('/learning', onSummary);

    expect(await screen.findByText('1 de 1 cursos concluídos', { exact: false })).toHaveTextContent('100% da formação');
    expect(screen.getByRole('progressbar', { name: 'Progresso de Segurança no trabalho' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar', { name: 'Progresso geral da formação' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('link', { name: /Rever um curso/ })).toHaveAttribute('href', '/learning/tracks/seguranca-no-trabalho');
    expect(onSummary).toHaveBeenLastCalledWith({ percentage: 100, completed: 5, total: 5 });
    await user.click(screen.getByRole('button', { name: 'Em andamento' }));
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluídos' }));
    expect(screen.getByRole('link', { name: 'Rever curso Segurança no trabalho' })).toBeVisible();
  });

  it('continues an unfinished course instead of a completed course with 99 percent raw coverage', async () => {
    const user = userEvent.setup();
    listAssignedTracks.mockResolvedValue([
      { ...trackCard, lessonCount: 5, completedLessonCount: 5, progressPercentage: 99 },
      { ...trackCard, id: 'track-2', title: 'Ergonomia', lessonCount: 5, progressPercentage: 40 },
    ]);
    renderAt('/learning');
    expect(await screen.findByRole('link', { name: /Continuar aprendendo/ })).toHaveAttribute('href', '/learning/tracks/ergonomia');
    expect(screen.getByText('1 de 2 cursos concluídos', { exact: false })).toHaveTextContent('70% da formação');
    await user.click(screen.getByRole('button', { name: 'Em andamento' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Continuar curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Segurança no trabalho' })).not.toBeInTheDocument();
  });

  it.each([
    { label: 'unfinished', lessonCount: 1, raw: 100, expected: 99 },
    { label: 'empty', lessonCount: 0, raw: 100, expected: 0 },
  ])('does not mark an $label course complete from its percentage alone', async ({ lessonCount, raw, expected }) => {
    listAssignedTracks.mockResolvedValue([{ ...trackCard, lessonCount, progressPercentage: raw }]);
    renderAt('/learning');
    expect(await screen.findByText('0 de 1 cursos concluídos', { exact: false })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso de Segurança no trabalho' })).toHaveAttribute('aria-valuenow', String(expected));
    expect(screen.queryByRole('link', { name: 'Rever curso Segurança no trabalho' })).not.toBeInTheDocument();
  });

  it('shows 100 course completion at the accepted threshold without changing watched coverage', async () => {
    const { video } = await playableCourse();
    recordRange.mockResolvedValue(progress(4500, 90));
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 4.5); fireEvent.pause(video);
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Progresso do curso' })).toHaveAttribute('aria-valuenow', '100'));
    expect(screen.getByText('90% assistido')).toBeVisible();
    expect(screen.getByText('100% concluído')).toBeVisible();
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 4500, 4500);
  });

  it('restores saved position and preserves the chosen playback speed', async () => {
    const user = userEvent.setup();
    const { video } = await playableCourse([{ ...lesson, lastPlaybackPositionMilliseconds: 2400 }]);
    Object.defineProperty(video, 'duration', { configurable: true, value: 5 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(2.4);
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    await user.selectOptions(screen.getByLabelText('Velocidade de reprodução'), '1.5');
    fireEvent.loadedMetadata(video);
    expect(video.playbackRate).toBe(1.5);
    expect(recordRange).not.toHaveBeenCalled();
  });

  it('waits for pending progress and the final range before changing lessons', async () => {
    const user = userEvent.setup();
    const { video, container } = await playableCourse([lesson, { ...lesson, id: 'lesson-2', title: 'Segunda aula', position: 2 }]);
    let finish!: (value: ReturnType<typeof progress>) => void;
    recordRange.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 2); fireEvent.pause(video);
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 2000, 2000);
    atTime(video, 3.9); fireEvent.ended(video);
    await user.click(screen.getByRole('button', { name: /Próximo vídeo/ }));
    expect(startPlayback).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Próximo vídeo/ })).toBeDisabled();
    finish(progress(2000));
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.example.test/lesson-2.mp4'));
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 3900, 3900);
    const secondVideo = container.querySelector('video')!;
    atTime(secondVideo, 0); fireEvent.playing(secondVideo);
    atTime(secondVideo, 1); fireEvent.pause(secondVideo);
    await waitFor(() => expect(recordRange).toHaveBeenLastCalledWith('track-1', 'lesson-2', 'session-lesson-2', 0, 1000, 1000));
  });

  it('saves watched coverage before seeking without crediting the skipped interval', async () => {
    const { video } = await playableCourse();
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 2); fireEvent.timeUpdate(video);
    atTime(video, 4); fireEvent.seeking(video); fireEvent.seeked(video);
    await waitFor(() => expect(savePosition).toHaveBeenCalledWith('track-1', 'lesson-1', 4000));
    fireEvent.playing(video);
    atTime(video, 5); fireEvent.ended(video);
    await waitFor(() => expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 4000, 5000, 5000));
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 2000, 2000);
    expect(recordRange.mock.calls.every((call: unknown[]) => !(call[3] === 0 && call[4] === 5000))).toBe(true);
  });

  it('keeps the course open on save failure and retries before returning to the catalog', async () => {
    const user = userEvent.setup();
    const { video } = await playableCourse();
    recordRange.mockRejectedValue(new Error('Não foi possível salvar. Tente novamente.'));
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 2);
    await user.click(screen.getByRole('link', { name: /Meus cursos/ }));
    expect(await screen.findByText('Não foi possível salvar. Tente novamente.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).not.toBeInTheDocument();
    recordRange.mockResolvedValue(progress(2000));
    await user.click(screen.getByRole('button', { name: 'Tentar salvar progresso' }));
    expect(await screen.findByText('Progresso salvo')).toBeVisible();
    await user.click(screen.getByRole('link', { name: /Meus cursos/ }));
    expect(await screen.findByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).toBeVisible();
  });

  it('persists the final subsecond range rather than losing the end of a lesson', async () => {
    const { video } = await playableCourse();
    recordRange.mockResolvedValue(progress(5000, 100));
    atTime(video, 4.7); fireEvent.playing(video);
    atTime(video, 5); fireEvent.ended(video);
    await waitFor(() => expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 4700, 5000, 5000));
    expect(screen.getByRole('progressbar', { name: 'Progresso do curso' })).toHaveAttribute('aria-valuenow', '100');
  });

  it('stops an expired playback session and requests an explicit retry', async () => {
    const { video } = await playableCourse();
    startPlayback.mockResolvedValue({
      url: 'https://media.example.test/expired.mp4', sessionId: 'expired', expiresAt: '2000-01-01T00:00:00Z',
    });
    fireEvent.error(video);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    const expired = document.querySelector('video')!;
    fireEvent.playing(expired);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão de vídeo expirou');
    expect(document.querySelector('video')).not.toBeInTheDocument();
    expect(recordRange).not.toHaveBeenCalled();
  });
  it('retries a failed media download with a fresh playback session', async () => {
    const user = userEvent.setup();
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValue({ track: trackCard, lessons: [lesson] });
    startPlayback.mockResolvedValue({
      url: 'https://media.example.test/first.mp4', sessionId: 'session-1', isDevelopmentDemo: false,
    });
    const { container } = renderAt('/learning/tracks/track-1');
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.example.test/first.mp4'));
    fireEvent.error(container.querySelector('video')!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o vídeo.');
    expect(container.querySelector('video')).not.toBeInTheDocument();
    startPlayback.mockResolvedValue({
      url: 'https://media.example.test/renewed.mp4', sessionId: 'session-2', isDevelopmentDemo: false,
    });
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.example.test/renewed.mp4'));
    expect(startPlayback).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filters assigned courses by status and search and restores the full catalog', async () => {
    const user = userEvent.setup();
    listAssignedTracks.mockResolvedValue([
      trackCard,
      { ...trackCard, id: 'track-2', title: 'Ergonomia', lessonCount: 3, completedLessonCount: 1, progressPercentage: 50 },
      { ...trackCard, id: 'track-3', title: 'Primeiros socorros', completedLessonCount: 1, progressPercentage: 100 },
    ]);
    renderAt('/learning');
    expect(await screen.findByRole('progressbar', { name: 'Progresso geral da formação' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('1 de 3 cursos concluídos', { exact: false })).toBeVisible();
    expect(screen.getByRole('link', { name: /Continuar aprendendo/ })).toHaveAttribute('href', '/learning/tracks/ergonomia');
    await user.click(screen.getByRole('button', { name: 'Em andamento' }));
    expect(screen.getByRole('link', { name: 'Continuar curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Começar curso Segurança no trabalho' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar curso' }), 'ausente');
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum curso corresponde');
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar curso' }));
    await user.click(screen.getByRole('button', { name: 'Concluídos' }));
    expect(screen.getByRole('link', { name: 'Rever curso Primeiros socorros' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Continuar curso Ergonomia' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(startPlayback).not.toHaveBeenCalled();
  });

  it('shows a loading state then a retryable failure without presenting an empty catalog', async () => {
    const user = userEvent.setup();
    listAssignedTracks.mockRejectedValueOnce(new Error('Cursos indisponíveis.')).mockResolvedValueOnce([trackCard]);
    renderAt('/learning');
    expect(screen.getByText('Carregando suas trilhas...')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cursos indisponíveis.');
    expect(screen.queryByText('Você ainda não tem uma trilha atribuída')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('link', { name: 'Começar curso Segurança no trabalho' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows assigned courses and verified progress without automatically starting playback', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValue({ track: trackCard, lessons: [lesson] });
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    renderAt('/learning');

    expect(await screen.findByRole('link', { name: 'Começar curso Segurança no trabalho' })).toHaveAttribute('href', '/learning/tracks/seguranca-no-trabalho');
    expect(screen.getByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).toBeVisible();
    expect(getAssignedTrack).not.toHaveBeenCalled();
    expect(startPlayback).not.toHaveBeenCalled();
    expect(screen.getByRole('progressbar', { name: 'Progresso geral da formação' }))
      .toHaveAttribute('aria-valuenow', '0');
  });

  it('uses a readable track slug and resolves it only against assigned tracks', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValue({ track: trackCard, lessons: [lesson] });
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    renderAt('/learning/tracks/seguranca-no-trabalho');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(getAssignedTrack).toHaveBeenCalledWith('track-1');
    expect(await screen.findByRole('heading', { name: 'Vídeo indisponível' })).toBeVisible();
    expect(startPlayback).toHaveBeenCalledWith('track-1', 'lesson-1');
  });

  it('returns to the course catalog to switch courses without a global journey in playback', async () => {
    const secondTrack = {
      ...trackCard,
      id: 'track-2',
      title: 'Ergonomia',
      lessonCount: 2,
      progressPercentage: 25,
    };
    const secondLesson = {
      ...lesson,
      id: 'lesson-2',
      title: 'Postura no computador',
    };
    const completedTrack = {
      ...trackCard,
      id: 'track-3',
      title: 'Primeiros socorros',
      completedLessonCount: 1,
      progressPercentage: 100,
    };
    listAssignedTracks.mockResolvedValue([trackCard, secondTrack, completedTrack]);
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve(
      trackId === secondTrack.id
        ? { track: secondTrack, lessons: [secondLesson] }
        : { track: trackCard, lessons: [lesson] },
    ));
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));
    const user = userEvent.setup();

    renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Trilhas da SIPAT' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ergonomia')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progresso do curso' })).toHaveAttribute('aria-valuenow', '0');
    await user.click(screen.getByRole('link', { name: '← Meus cursos' }));
    await user.click(await screen.findByRole('link', { name: 'Continuar curso Ergonomia' }));

    expect(await screen.findByRole('heading', { name: 'Postura no computador' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso do curso' })).toHaveAttribute('aria-valuenow', '25');
    expect(getAssignedTrack).toHaveBeenLastCalledWith('track-2');
  });

  it('uses subject artwork in the catalog and marks completed courses', async () => {
    const tracks = [
      { ...trackCard, title: 'Ergonomia e atividade física' },
      { ...trackCard, id: 'track-2', title: 'Alimentação para uma vida saudável', progressPercentage: 25 },
      { ...trackCard, id: 'track-3', title: 'Comportamento seguro', completedLessonCount: 1, progressPercentage: 100 },
      { ...trackCard, id: 'track-4', title: 'Primeiros socorros' },
      { ...trackCard, id: 'track-5', title: 'Demonstração técnica — vídeo e progresso' },
    ];
    listAssignedTracks.mockResolvedValue(tracks);
    getAssignedTrack.mockResolvedValue({ track: tracks[0], lessons: [lesson] });
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    const { container } = renderAt('/learning');

    await screen.findByRole('heading', { name: 'Meus cursos 5' });
    const artworkByTrack = [
      ['Ergonomia e atividade física', 'ergonomics'],
      ['Alimentação para uma vida saudável', 'nutrition'],
      ['Comportamento seguro', 'safety'],
      ['Primeiros socorros', 'first-aid'],
      ['Demonstração técnica — vídeo e progresso', 'practice'],
    ] as const;

    for (const [label, artwork] of artworkByTrack) {
      const card = screen.getByRole('heading', { name: label }).closest('article')!;
      expect(card.querySelector('.learning-catalog-artwork')).toHaveAttribute('data-artwork', artwork);
      expect(card.querySelector('img')).toHaveAttribute('alt', '');
      expect(card.querySelector('img')).toHaveAttribute('loading', 'lazy');
      expect(card.querySelector('img')?.getAttribute('src')).toMatch(/^\/course-covers\/.+\.jpg$/);
    }

    expect(screen.getByRole('link', { name: 'Rever curso Comportamento seguro' })).toBeVisible();
    expect(container.querySelectorAll('.learning-catalog-course')).toHaveLength(5);
  });

  it('renders the native player and playback speed selector from a real session response', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValueOnce({
      track: trackCard,
      lessons: [lesson],
    });
    startPlayback.mockResolvedValueOnce({
      url: 'https://media.example.test/session/video.mp4',
      contentType: 'video/mp4',
      expiresAt: '2099-01-01T00:00:00Z',
      sessionId: 'session-1',
      isDevelopmentDemo: true,
    });
    const user = userEvent.setup();

    const { container } = renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(await screen.findByText(/não comprova participação oficial/i)).toBeVisible();
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.example.test/session/video.mp4');

    await user.selectOptions(screen.getByLabelText('Velocidade de reprodução'), '1.5');
    expect(screen.getByLabelText('Velocidade de reprodução')).toHaveValue('1.5');
    expect(startPlayback).toHaveBeenCalledWith('track-1', 'lesson-1');
  });

  it('clamps the final playback range to the configured duration', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValueOnce({ track: trackCard, lessons: [lesson] });
    startPlayback.mockResolvedValueOnce({
      url: 'https://media.example.test/session/video.mp4',
      contentType: 'video/mp4',
      expiresAt: '2099-01-01T00:00:00Z',
      sessionId: 'session-1',
      isDevelopmentDemo: true,
    });
    recordRange.mockResolvedValueOnce({
      lessonId: 'lesson-1',
      lastPlaybackPositionMilliseconds: 5000,
      durationMilliseconds: 5000,
      watchedPercentage: 100,
      isCompleted: true,
      firstStartedAt: '2026-11-02T13:00:00Z',
      lastAccessedAt: '2026-11-02T13:01:00Z',
      completedAt: '2026-11-02T13:01:00Z',
    });

    const { container } = renderAt('/learning/tracks/track-1');
    await screen.findByText(/não comprova participação oficial/i);
    const video = container.querySelector('video');
    if (!video) {
      throw new Error('The playback session did not render a video element.');
    }

    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    fireEvent.playing(video);
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 5.055 });
    fireEvent.ended(video);

    await waitFor(() => expect(recordRange).toHaveBeenCalledWith(
      'track-1',
      'lesson-1',
      'session-1',
      0,
      5000,
      5000,
    ));
    expect(screen.getByRole('progressbar', { name: 'Progresso do curso' }))
      .toHaveAttribute('aria-valuenow', '100');
  });

  it('shows a real empty state when no learning track is assigned', async () => {
    listAssignedTracks.mockResolvedValueOnce([]);

    renderAt('/learning');

    expect(await screen.findByRole('heading', {
      name: 'Você ainda não tem uma trilha atribuída',
    })).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('does not present a player when the provider cannot create a session', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValueOnce({ track: trackCard, lessons: [lesson] });
    startPlayback.mockRejectedValueOnce(new Error('A reprodução não está configurada.'));

    const { container } = renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { name: 'Vídeo indisponível' })).toBeVisible();
    expect(container.querySelector('video')).not.toBeInTheDocument();
    expect(screen.getByText('A reprodução não está configurada.')).toBeVisible();
  });
});
