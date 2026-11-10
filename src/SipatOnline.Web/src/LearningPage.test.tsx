import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LearningPage from './LearningPage';

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
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<LearningPage />} path="/learning" />
        <Route element={<LearningPage />} path="/learning/tracks/:trackId" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('learning experience', () => {
  it('opens the current assigned track and displays its verified progress', async () => {
    listAssignedTracks.mockResolvedValue([trackCard]);
    getAssignedTrack.mockResolvedValue({ track: trackCard, lessons: [lesson] });
    startPlayback.mockRejectedValue(new Error('A reprodução não está configurada.'));

    renderAt('/learning');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Trilhas da SIPAT' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Segurança no trabalho: Não iniciada' }))
      .toHaveAttribute('aria-current', 'step');
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

  it('switches tracks from the learning journey', async () => {
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

    const { container } = renderAt('/learning/tracks/track-1');

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    const journey = screen.getByRole('navigation', { name: 'Trilhas da SIPAT' });
    expect(within(journey).getByRole('button', { name: 'Segurança no trabalho: Não iniciada' }))
      .toHaveAttribute('aria-current', 'step');
    expect(within(journey).getByRole('button', { name: 'Primeiros socorros: Concluída' }))
      .toHaveTextContent('✓');
    expect(container.querySelectorAll('.learning-journey-connector')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Ergonomia: Em andamento' }));

    expect(await screen.findByRole('heading', { name: 'Postura no computador' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ergonomia: Em andamento' }))
      .toHaveAttribute('aria-current', 'step');
    expect(getAssignedTrack).toHaveBeenLastCalledWith('track-2');
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
      expiresAt: '2026-11-02T15:00:00Z',
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
      expiresAt: '2026-11-02T15:00:00Z',
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
    expect(screen.getByRole('progressbar', { name: 'Progresso geral da formação' }))
      .toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: 'Segurança no trabalho: Concluída' }))
      .toHaveTextContent('✓');
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
