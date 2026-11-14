import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  sessionStorage.clear();
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

async function playableCourse(lessons: Array<typeof lesson & { sectionTitle?: string }> = [lesson]) {
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Formação concluída. Parabéns!' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso de Segurança no trabalho' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('Passo 1 de 1')).toBeVisible();
    expect(screen.getByRole('progressbar', {
      name: 'Progresso da formação: 1 de 1 cursos concluídos',
    })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('region', { name: 'Formação concluída' })
      .querySelector('.learning-completion-illustration')).not.toHaveClass('is-in-progress');
    expect(screen.queryByRole('link', { name: 'Ver certificados' })).not.toBeInTheDocument();
    expect(screen.queryByText('Formação concluída. Parabéns por chegar até aqui!')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sua trilha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Progresso da SIPAT' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver certificado de Segurança no trabalho' }))
      .toHaveAttribute('href', '/learning/certificates');
    // o resumo é enviado por um efeito: sob carga ele pode chegar depois do cabeçalho
    await waitFor(() => expect(onSummary).toHaveBeenLastCalledWith({ percentage: 100, completed: 1, total: 1 }));
    expect(screen.queryByRole('tab', { name: /Em andamento/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Concluídos/ }));
    expect(screen.getByRole('link', { name: 'Ver certificado de Segurança no trabalho' })).toBeVisible();
  });

  it('continues an unfinished course instead of a completed course with 99 percent raw coverage', async () => {
    const user = userEvent.setup();
    const unfinishedTrack = { ...trackCard, id: 'track-2', title: 'Ergonomia', lessonCount: 5, progressPercentage: 40 };
    listAssignedTracks.mockResolvedValue([
      { ...trackCard, lessonCount: 5, completedLessonCount: 5, progressPercentage: 99 },
      unfinishedTrack,
    ]);
    getAssignedTrack.mockResolvedValue({
      track: unfinishedTrack,
      lessons: [{ ...lesson, lastPlaybackPositionMilliseconds: 1500, watchedPercentage: 30 }],
    });
    renderAt('/learning');
    expect(await screen.findByRole('link', { name: /Continuar vídeo/ }))
      .toBeVisible();
    const hero = screen.getByRole('region', { name: 'Formação em andamento' });
    // the greeting lives inside the green card, with the course to continue shown as a cover
    expect(within(hero).getByRole('heading', { level: 1, name: 'Bom te ver de volta.' })).toBeVisible();
    expect(hero.querySelector('.learning-hero-cover')).toBeInTheDocument();
    expect(hero.querySelector('.learning-completion-illustration')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await waitFor(() => expect(screen.getByRole('link', { name: /Continuar vídeo/ }))
      .toHaveAttribute('href', '/learning/tracks/ergonomia?lesson=lesson-1'));
    expect(screen.getByText('Passo 2 de 2 · 70% da formação')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso da SIPAT' })).toHaveAttribute('aria-valuenow', '70');
    await user.click(screen.getByRole('tab', { name: /Em andamento/ }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Continuar curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Segurança no trabalho' })).not.toBeInTheDocument();
  });

  it('groups the lesson list by course section only when there is more than one', async () => {
    const second = { ...lesson, id: 'lesson-2', position: 2, title: 'Postura' };
    await playableCourse([
      { ...lesson, sectionTitle: 'Introdução' },
      { ...second, sectionTitle: 'Prática' },
    ]);
    expect(await screen.findByText('Introdução')).toBeVisible();
    expect(screen.getByText('Prática')).toBeVisible();
  });

  it('hides the section heading for a course with a single section', async () => {
    await playableCourse([{ ...lesson, sectionTitle: 'Aula 1' }]);
    await screen.findByText('Vídeos do dia');
    expect(screen.queryByText('Aula 1')).not.toBeInTheDocument();
  });

  it('says once, under the video, that a watched video is done', async () => {
    const completedLesson = { ...lesson, isCompleted: true, watchedPercentage: 100 };
    const { container } = await playableCourse([completedLesson]);

    expect(container.querySelector('.day-controls .day-status')).toHaveTextContent('Concluído');
    expect(container.querySelectorAll('.day-status')).toHaveLength(1);
  });

  it('shows what the video is about on the stage, without a window or empty tabs', async () => {
    await playableCourse();

    expect(screen.getByRole('region', { name: 'Sobre o vídeo' })).toHaveTextContent(lesson.description);
    expect(screen.queryByRole('button', { name: 'Ver detalhes do vídeo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Minhas anotações' })).not.toBeInTheDocument();
    expect(screen.queryByText('Quiz final')).not.toBeInTheDocument();
  });

  it('keeps the way forward under the video and the videos of the day on the side', async () => {
    const { container } = await playableCourse();

    expect(container.querySelector('.day-stage .learning-player-frame + .day-controls')).toBeInTheDocument();
    expect(container.querySelector('.day-rail .day-playlist')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Conteúdo do dia' })).toBeVisible();
  });

  it.each([
    { label: 'unfinished', lessonCount: 1, raw: 100, expected: 99 },
    { label: 'empty', lessonCount: 0, raw: 100, expected: 0 },
  ])('does not mark an $label course complete from its percentage alone', async ({ lessonCount, raw, expected }) => {
    listAssignedTracks.mockResolvedValue([{ ...trackCard, lessonCount, progressPercentage: raw }]);
    getAssignedTrack.mockResolvedValue({ track: trackCard, lessons: [lesson] });
    renderAt('/learning');
    expect(await screen.findByRole('article')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso de Segurança no trabalho' })).toHaveAttribute('aria-valuenow', String(expected));
    expect(screen.queryByRole('link', { name: 'Ver certificado de Segurança no trabalho' })).not.toBeInTheDocument();
  });

  it('shows 100 course completion at the accepted threshold without changing watched coverage', async () => {
    const { video } = await playableCourse();
    recordRange.mockResolvedValue(progress(4500, 90));
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 4.5); fireEvent.pause(video);
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Progresso do dia' })).toHaveAttribute('aria-valuenow', '100'));
    // done at the accepted threshold: the screen says it is done instead of a raw percentage
    expect(screen.getByText('Concluído', { selector: '.day-status' })).toBeVisible();
    expect(screen.getByText('1 de 1 vídeos · 100%')).toBeVisible();
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 4500, 4500);
  });

  it('advances to the next lesson only after the backend confirms completion', async () => {
    const secondLesson = { ...lesson, id: 'lesson-2', title: 'Próximos passos', position: 2 };
    const { video, container } = await playableCourse([lesson, secondLesson]);
    recordRange.mockResolvedValue(progress(5000, 90));
    atTime(video, 0);
    fireEvent.playing(video);
    atTime(video, 5);
    fireEvent.ended(video);

    await waitFor(() => expect(container.querySelector('video'))
      .toHaveAttribute('src', 'https://media.example.test/lesson-2.mp4'));
    expect(screen.getByRole('heading', { name: 'Próximos passos' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Marcar como concluída/ })).not.toBeInTheDocument();
  });

  it('restores the saved position and keeps the player locked at normal speed', async () => {
    const { video } = await playableCourse([{ ...lesson, lastPlaybackPositionMilliseconds: 2400 }]);
    Object.defineProperty(video, 'duration', { configurable: true, value: 5 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(2.4);
    // our own bar replaces the browser controls, so no native speed menu or seek bar is offered
    expect(video).not.toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
    expect(screen.queryByLabelText('Velocidade de reprodução')).not.toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Posição do vídeo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeInTheDocument();
    video.playbackRate = 2;
    fireEvent.rateChange(video);
    expect(video.playbackRate).toBe(1);
    expect(recordRange).not.toHaveBeenCalled();
  });

  it('only lets the timeline go as far as what was already watched', async () => {
    const { video } = await playableCourse([{ ...lesson, lastPlaybackPositionMilliseconds: 12000 }]);
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    const timeline = screen.getByRole('slider', { name: 'Posição do vídeo' });
    expect(timeline).toHaveAttribute('aria-valuetext', '0:12 de 1:00');
    fireEvent.keyDown(timeline, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(12);
    expect(screen.getByText(/não é possível avançar além do que você já viu/)).toBeVisible();
    fireEvent.keyDown(timeline, { key: 'ArrowLeft' });
    expect(video.currentTime).toBe(7);
    fireEvent.keyDown(timeline, { key: 'End' });
    expect(video.currentTime).toBe(12);
  });

  it('sends the viewer back when they try to skip ahead of what was watched', async () => {
    const { video } = await playableCourse([{ ...lesson, lastPlaybackPositionMilliseconds: 2400 }]);
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 40;
    fireEvent.seeking(video);
    expect(video.currentTime).toBe(2.4);
    expect(await screen.findByText(/não é possível avançar/i)).toBeVisible();

    video.currentTime = 1;
    fireEvent.seeking(video);
    expect(video.currentTime).toBe(1);
  });

  it('lets a finished lesson be reviewed freely', async () => {
    const { video } = await playableCourse([{ ...lesson, isCompleted: true, lastPlaybackPositionMilliseconds: 0 }]);
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 });
    fireEvent.loadedMetadata(video);
    video.currentTime = 40;
    fireEvent.seeking(video);
    expect(video.currentTime).toBe(40);
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

  it('saves watched coverage before rewinding and resumes from the new position', async () => {
    const { video } = await playableCourse();
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 4); fireEvent.timeUpdate(video);
    atTime(video, 1); fireEvent.seeking(video); fireEvent.seeked(video);
    await waitFor(() => expect(savePosition).toHaveBeenCalledWith('track-1', 'lesson-1', 1000));
    expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 0, 4000, 4000);
  });

  it('keeps the course open on save failure and retries before returning to the catalog', async () => {
    const user = userEvent.setup();
    const { video } = await playableCourse();
    recordRange.mockRejectedValue(new Error('Não foi possível salvar. Tente novamente.'));
    atTime(video, 0); fireEvent.playing(video);
    atTime(video, 2);
    await user.click(screen.getByRole('link', { name: /Sua SIPAT/ }));
    expect(await screen.findByText('Não foi possível salvar. Tente novamente.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).not.toBeInTheDocument();
    recordRange.mockResolvedValue(progress(2000));
    await user.click(screen.getByRole('button', { name: 'Tentar salvar progresso' }));
    expect(await screen.findByText('Progresso salvo')).toBeVisible();
    await user.click(screen.getByRole('link', { name: /Sua SIPAT/ }));
    expect(await screen.findByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).toBeVisible();
  });

  it('persists the final subsecond range rather than losing the end of a lesson', async () => {
    const { video } = await playableCourse();
    recordRange.mockResolvedValue(progress(5000, 100));
    atTime(video, 4.7); fireEvent.playing(video);
    atTime(video, 5); fireEvent.ended(video);
    await waitFor(() => expect(recordRange).toHaveBeenCalledWith('track-1', 'lesson-1', 'session-lesson-1', 4700, 5000, 5000));
    expect(screen.getByRole('progressbar', { name: 'Progresso do dia' })).toHaveAttribute('aria-valuenow', '100');
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
    const activeTrack = { ...trackCard, id: 'track-2', title: 'Ergonomia', lessonCount: 3, completedLessonCount: 1, progressPercentage: 50 };
    listAssignedTracks.mockResolvedValue([
      trackCard,
      activeTrack,
      { ...trackCard, id: 'track-3', title: 'Primeiros socorros', completedLessonCount: 1, progressPercentage: 100 },
    ]);
    getAssignedTrack.mockResolvedValue({
      track: activeTrack,
      lessons: [{ ...lesson, lastPlaybackPositionMilliseconds: 1500, watchedPercentage: 30 }],
    });
    renderAt('/learning');
    expect(await screen.findByRole('progressbar', { name: 'Progresso da SIPAT' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Passo 2 de 3 · 50% da formação')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('link', { name: /Continuar vídeo/ }))
      .toHaveAttribute('href', '/learning/tracks/ergonomia?lesson=lesson-1'));
    await user.click(screen.getByRole('tab', { name: /Em andamento/ }));
    expect(screen.getByRole('link', { name: 'Continuar curso Ergonomia' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Começar curso Segurança no trabalho' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Buscar curso' }), 'ausente');
    expect(screen.getByText('Nenhum curso corresponde à sua busca ou filtro.')).toBeVisible();
    await user.clear(screen.getByRole('searchbox', { name: 'Buscar curso' }));
    await user.click(screen.getByRole('tab', { name: /Concluídos/ }));
    expect(screen.getByRole('link', { name: 'Ver certificado de Primeiros socorros' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Continuar curso Ergonomia' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Todos/ }));
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(startPlayback).not.toHaveBeenCalled();
  });

  it('combines status, category, and search filters and supports keyboard tabs', async () => {
    const user = userEvent.setup();
    const nutritionTrack = {
      ...trackCard,
      id: 'track-2',
      title: 'Alimentação saudável',
      progressPercentage: 25,
    };
    listAssignedTracks.mockResolvedValue([
      { ...trackCard, progressPercentage: 40 },
      nutritionTrack,
    ]);
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve({
      track: trackId === nutritionTrack.id ? nutritionTrack : trackCard,
      lessons: [{ ...lesson, lastPlaybackPositionMilliseconds: 1500, watchedPercentage: 30 }],
    }));

    renderAt('/learning');
    const allTab = await screen.findByRole('tab', { name: /Todos/ });
    allTab.focus();
    fireEvent.keyDown(allTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Em andamento/ })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: 'Segurança' }));
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Segurança no trabalho' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Alimentação saudável' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Buscar curso' }), 'ausente');
    expect(screen.getByText('Nenhum curso corresponde à sua busca ou filtro.')).toBeVisible();
  });

  it('shows a loading state then a retryable failure without presenting an empty catalog', async () => {
    const user = userEvent.setup();
    listAssignedTracks.mockRejectedValueOnce(new Error('Cursos indisponíveis.')).mockResolvedValueOnce([trackCard]);
    renderAt('/learning');
    expect(screen.getByText('Carregando a sua SIPAT...')).toBeVisible();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cursos indisponíveis.');
    expect(screen.queryByText('Você ainda não tem uma SIPAT disponível')).not.toBeInTheDocument();
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
    expect(screen.getByRole('progressbar', { name: 'Progresso da formação: 0% concluído' }))
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
    expect(screen.getByRole('progressbar', { name: 'Progresso do dia' })).toHaveAttribute('aria-valuenow', '0');
    await user.click(screen.getByRole('link', { name: /Sua SIPAT/ }));
    await user.click(await screen.findByRole('link', { name: 'Continuar curso Ergonomia' }));

    expect(await screen.findByRole('heading', { name: 'Postura no computador' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progresso do dia' })).toHaveAttribute('aria-valuenow', '25');
    expect(getAssignedTrack).toHaveBeenLastCalledWith('track-2');
  });

  it('uses subject artwork in the catalog and marks completed courses', async () => {
    const tracks = [
      { ...trackCard, title: 'Ergonomia e atividade física' },
      { ...trackCard, id: 'track-2', title: 'Alimentação para uma vida saudável', progressPercentage: 25 },
      { ...trackCard, id: 'track-3', title: 'Comportamento seguro', completedLessonCount: 1, progressPercentage: 100 },
      { ...trackCard, id: 'track-4', title: 'Primeiros socorros' },
      { ...trackCard, id: 'track-5', title: 'Demonstração técnica — vídeo e progresso' },
      { ...trackCard, id: 'track-6', title: 'Hábitos de vida' },
      { ...trackCard, id: 'track-7', title: 'Higiene Mental' },
    ];
    listAssignedTracks.mockResolvedValue(tracks);
    getAssignedTrack.mockResolvedValue({ track: tracks[0], lessons: [lesson] });
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    const { container } = renderAt('/learning');

    await screen.findByRole('heading', { name: 'Meus cursos 7' });
    const artworkByTrack = [
      ['Ergonomia e atividade física', 'ergonomics'],
      ['Alimentação para uma vida saudável', 'nutrition'],
      ['Comportamento seguro', 'safety'],
      ['Primeiros socorros', 'first-aid'],
      ['Demonstração técnica — vídeo e progresso', 'practice'],
      ['Hábitos de vida', 'habits'],
      ['Higiene Mental', 'wellbeing'],
    ] as const;

    for (const [label, artwork] of artworkByTrack) {
      const card = Array.from(container.querySelectorAll<HTMLElement>('.learning-catalog-course'))
        .find(article => article.querySelector('h3')?.textContent === label)!;
      expect(card.querySelector('.learning-catalog-artwork')).toHaveAttribute('data-artwork', artwork);
      expect(card.querySelector('img')).toHaveAttribute('alt', '');
      expect(card.querySelector('img')).toHaveAttribute('loading', 'lazy');
      expect(card.querySelector('img')?.getAttribute('src')).toMatch(/^\/course-covers\/.+\.jpg$/);
      expect(card.querySelector('.learning-catalog-course-category')).toBeInTheDocument();
      expect(card.querySelector('.learning-catalog-video-count')).toBeInTheDocument();
      expect(card.querySelector('.learning-catalog-description')).not.toBeInTheDocument();
    }

    const categorylessCards = Array.from(container.querySelectorAll<HTMLElement>('.learning-catalog-course'))
      .filter(card => ['Hábitos de vida', 'Higiene Mental'].includes(card.querySelector('h3')?.textContent ?? ''));
    expect(categorylessCards).toHaveLength(2);
    for (const card of categorylessCards) {
      expect(card.querySelector('.learning-catalog-course-category')).toHaveAttribute('aria-hidden', 'true');
      expect(card.querySelector('.learning-catalog-course-category')).toHaveClass('is-empty');
    }

    expect(screen.getByRole('link', { name: 'Ver certificado de Comportamento seguro' })).toBeVisible();
    expect(container.querySelectorAll('.learning-catalog-course')).toHaveLength(7);
  });

  it('hides internal option prefixes and gives adjacent wellness courses distinct covers', async () => {
    const habitsTrack = { ...trackCard, id: 'track-4', title: 'Opção 1 · Hábitos de vida' };
    const mentalHealthTrack = { ...trackCard, id: 'track-5', title: 'Opção 1 · Higiene Mental' };
    listAssignedTracks.mockResolvedValue([habitsTrack, mentalHealthTrack]);
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    const { container } = renderAt('/learning');

    await screen.findByRole('heading', { name: 'Meus cursos 2' });
    const cardFor = (title: string) => Array.from(
      container.querySelectorAll<HTMLElement>('.learning-catalog-course'),
    ).find(card => card.querySelector('h3 a')?.textContent === title)!;
    const habitsCard = cardFor('Hábitos de vida');
    const mentalHealthCard = cardFor('Higiene Mental');

    expect(habitsCard).not.toHaveTextContent('Opção 1');
    expect(mentalHealthCard).not.toHaveTextContent('Opção 1');
    expect(habitsCard.querySelector('h3 a')).toHaveTextContent('Hábitos de vida');
    expect(mentalHealthCard.querySelector('h3 a')).toHaveTextContent('Higiene Mental');
    expect(habitsCard.querySelector('img')).toHaveAttribute('src', '/course-covers/workplace.jpg');
    expect(mentalHealthCard.querySelector('img')).toHaveAttribute('src', '/course-covers/wellbeing.jpg');
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

    const { container } = renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(await screen.findByText(/não comprova participação oficial/i)).toBeVisible();
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://media.example.test/session/video.mp4');

    expect(screen.queryByLabelText('Velocidade de reprodução')).not.toBeInTheDocument();
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
    expect(screen.getByRole('progressbar', { name: 'Progresso do dia' }))
      .toHaveAttribute('aria-valuenow', '100');
  });

  it('shows a real empty state when no learning track is assigned', async () => {
    listAssignedTracks.mockResolvedValueOnce([]);

    renderAt('/learning');

    expect(await screen.findByRole('heading', {
      name: 'Você ainda não tem uma SIPAT disponível',
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

  it('lists the videos of the week day by day, in program order, with the date and the progress of each day', async () => {
    const day1 = { ...trackCard, id: 'a', title: 'Opção 1 · Ergonomia', lessonCount: 2, completedLessonCount: 1, progressPercentage: 50, dayTitle: 'Boa postura e movimento', dayPosition: 1, coursePosition: 1, dayDate: '2026-11-09' };
    const day2 = { ...trackCard, id: 'b', title: 'Opção 1 · Higiene Mental', dayTitle: 'Mente tranquila', dayPosition: 2, coursePosition: 1 };
    listAssignedTracks.mockResolvedValue([day2, day1]);
    const watched = { ...lesson, id: 'v-1', title: 'Ginástica laboral', isCompleted: true, watchedPercentage: 100 };
    const next = { ...lesson, id: 'v-2', title: 'Trabalho sentado', position: 2 };
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve(
      trackId === 'a' ? { track: day1, lessons: [watched, next] } : { track: day2, lessons: [{ ...lesson, id: 'v-3', title: 'Respiração' }] }));
    renderAt('/learning');

    expect(await screen.findByRole('heading', { name: 'Vídeos da semana' })).toBeVisible();
    const first = await screen.findByRole('region', { name: 'Dia 1 · Boa postura e movimento' });
    const second = screen.getByRole('region', { name: 'Dia 2 · Mente tranquila' });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(first).getByText(/segunda-feira, 09\/11 · 1 de 2 vídeos assistidos/i)).toBeVisible();
    // each video opens the day at that video, and the next one to watch is marked
    expect(await within(first).findByRole('link', { name: /Vídeo 1.*Ginástica laboral.*Assistido/ })).toHaveAttribute('href', '/learning/tracks/opcao-1-ergonomia?video=v-1');
    expect(within(first).getByRole('link', { name: /Vídeo 2.*Trabalho sentado.*Próximo/ })).toHaveAttribute('href', '/learning/tracks/opcao-1-ergonomia?video=v-2');
    expect(await within(second).findByRole('link', { name: /Respiração/ })).toBeVisible();
    // the course list with search and categories gives way to the week
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('keeps the trail in front from the first visit, and a day on it filters the videos below', async () => {
    const user = userEvent.setup();
    const day1 = { ...trackCard, id: 'a', title: 'Uso de EPI', lessonCount: 2, completedLessonCount: 2, progressPercentage: 100, dayTitle: 'Segurança', dayPosition: 1, coursePosition: 1 };
    const day2 = { ...trackCard, id: 'b', title: 'Alongamento', dayTitle: 'Saúde', dayPosition: 2, coursePosition: 1 };
    listAssignedTracks.mockResolvedValue([day2, day1]);
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve({ track: trackId === 'a' ? day1 : day2, lessons: [lesson] }));
    renderAt('/learning');

    const trail = await screen.findByRole('list', { name: 'Dias da trilha' });
    const days = within(trail).getAllByRole('button');
    expect(days.map(day => day.textContent)).toEqual(['Segurança2 de 2 vídeos', '2Saúde0 de 1 vídeo']);
    // every day is open; the first one with something left is the current one; none is chosen yet
    expect(days.every(day => !(day as HTMLButtonElement).disabled)).toBe(true);
    expect(days[1]).toHaveAttribute('aria-current', 'step');
    expect(days.every(day => day.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(screen.getByRole('region', { name: 'Dia 1 · Segurança' })).toBeVisible();

    await user.click(days[1]);
    expect(days[1]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Saúde', level: 2 })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Dia 1 · Segurança' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Dia 2 · Saúde' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Ver a semana toda' }));
    expect(screen.getByRole('region', { name: 'Dia 1 · Segurança' })).toBeVisible();
    expect(days[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the plain course list, with its search, when no course belongs to a day', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    const plain = renderAt('/learning');
    await waitFor(() => expect(plain.container.querySelector('.learning-catalog-course')).not.toBeNull());
    expect(screen.getByRole('searchbox')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Vídeos da semana' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Dias da trilha' })).not.toBeInTheDocument();
  });

  it('shows the week of the published SIPAT and keeps the earlier years one tap away', async () => {
    const user = userEvent.setup();
    const now = { ...trackCard, id: 'n', sipatEventId: 'sipat-2026', title: 'Opção 1 · Ergonomia', dayTitle: 'Boa postura', dayPosition: 1, coursePosition: 1, sipatTitle: 'SIPAT 2026', sipatStartsAt: '2026-11-09T00:00:00Z', sipatEndsAt: '2099-11-15T00:00:00Z', sipatStatus: 'Published' as const };
    const before = { ...trackCard, id: 'o', sipatEventId: 'sipat-2025', title: 'Opção 1 · Higiene Mental', dayTitle: 'Mente tranquila', dayPosition: 1, coursePosition: 1, lessonCount: 1, completedLessonCount: 1, progressPercentage: 100, sipatTitle: 'SIPAT 2025', sipatStartsAt: '2025-11-10T00:00:00Z', sipatEndsAt: '2025-11-15T00:00:00Z', sipatStatus: 'Published' as const };
    listAssignedTracks.mockResolvedValue([before, now]);
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve({ track: trackId === 'n' ? now : before, lessons: [{ ...lesson, title: trackId === 'n' ? 'Ginástica laboral' : 'Respiração' }] }));
    renderAt('/learning');

    const years = await screen.findByRole('navigation', { name: 'SIPATs' });
    expect(within(years).getByRole('button', { name: /2026.*Em andamento/ })).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByRole('region', { name: 'Dia 1 · Boa postura' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Dia 1 · Mente tranquila' })).not.toBeInTheDocument();

    await user.click(within(years).getByRole('button', { name: /2025.*Concluída/ }));
    expect(await screen.findByRole('region', { name: 'Dia 1 · Mente tranquila' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Dia 1 · Boa postura' })).not.toBeInTheDocument();
  });

  it('opens on the SIPAT built by days when an older SIPAT of the same year is also published', async () => {
    const byDays = { ...trackCard, id: 'd', sipatEventId: 'sipat-b', title: 'Opção 1 · Ergonomia', dayTitle: 'Boa postura', dayPosition: 1, coursePosition: 1, sipatTitle: 'SIPAT de demonstração 2026', sipatStartsAt: '2026-11-10T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' as const };
    const legacy = { ...trackCard, id: 'l', sipatEventId: 'sipat-a', title: 'Teste Novembro', sipatTitle: 'SIPAT Novembro 2026', sipatStartsAt: '2026-11-11T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' as const };
    listAssignedTracks.mockResolvedValue([legacy, byDays]);
    getAssignedTrack.mockImplementation((trackId: string) => Promise.resolve({ track: trackId === 'd' ? byDays : legacy, lessons: [lesson] }));
    renderAt('/learning');

    // the week by days wins over the legacy one, even though the legacy one starts later
    expect(await screen.findByRole('region', { name: 'Dia 1 · Boa postura' })).toBeVisible();
    // two SIPATs of the same year are told apart by their names, not by the year
    const years = screen.getByRole('navigation', { name: 'SIPATs' });
    expect(within(years).getByRole('button', { name: /SIPAT de demonstração 2026/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(years).getByRole('button', { name: /SIPAT Novembro 2026/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not show the days of a cancelled SIPAT', async () => {
    const live = { ...trackCard, id: 'a', sipatEventId: 'sipat-live', title: 'Opção 1 · Ergonomia', dayTitle: 'Boa postura', dayPosition: 1, coursePosition: 1, sipatTitle: 'SIPAT 2026', sipatStartsAt: '2026-11-09T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' as const };
    const gone = { ...trackCard, id: 'b', sipatEventId: 'sipat-old', title: 'Teste antigo', sipatTitle: 'SIPAT de teste', sipatStartsAt: '2026-11-11T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Cancelled' as const };
    listAssignedTracks.mockResolvedValue([gone, live]);
    getAssignedTrack.mockResolvedValue({ track: live, lessons: [lesson] });
    renderAt('/learning');

    expect(await screen.findByRole('region', { name: 'Dia 1 · Boa postura' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'SIPATs' })).not.toBeInTheDocument();
    expect(screen.queryByText('Teste antigo')).not.toBeInTheDocument();
  });

  it('names the day, its date and subject, and offers the next day once every video is watched', async () => {
    const day1 = { ...trackCard, id: 'track-1', title: 'Opção 1 · Ergonomia', dayTitle: 'Boa postura e movimento', dayPosition: 1, coursePosition: 1, dayDate: '2026-11-09', lessonCount: 1, completedLessonCount: 1, progressPercentage: 100 };
    const day2 = { ...trackCard, id: 'track-2', title: 'Opção 1 · Higiene Mental', dayTitle: 'Mente tranquila', dayPosition: 2, coursePosition: 1 };
    listAssignedTracks.mockResolvedValue([day1, day2]);
    getAssignedTrack.mockResolvedValue({ track: day1, lessons: [{ ...lesson, isCompleted: true, watchedPercentage: 100 }] });
    startPlayback.mockReset().mockResolvedValue({ url: 'https://media.example.test/lesson-1.mp4', sessionId: 's', expiresAt: '2099-01-01T00:00:00Z', isDevelopmentDemo: false });
    renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Boa postura e movimento' })).toBeVisible();
    expect(screen.getByText('Dia 1')).toBeVisible();
    expect(screen.getByText(/segunda-feira, 09\/11/i)).toBeVisible();
    expect(screen.getByText('Ergonomia')).toBeVisible();
    expect(screen.getByText('Vídeo 1 de 1')).toBeVisible();

    const done = screen.getByRole('status', { name: 'Dia concluído' });
    expect(done).toHaveTextContent('Dia 1 concluído!');
    expect(within(done).getByRole('link', { name: /Ir para o Dia 2/ })).toHaveAttribute('href', '/learning/tracks/opcao-1-higiene-mental');
  });

  it('does not celebrate a day that still has a video to watch', async () => {
    await playableCourse([lesson, { ...lesson, id: 'lesson-2', title: 'Próximos passos', position: 2 }]);
    expect(screen.queryByRole('status', { name: 'Dia concluído' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Próximo vídeo/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Vídeo anterior/ })).toBeDisabled();
  });
});
