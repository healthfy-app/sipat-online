import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformCoursesPage from './PlatformCoursesPage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    createPlatformCourse: vi.fn(),
    duplicatePlatformCourse: vi.fn(),
    listGameModules: vi.fn(),
    listPlatformCourses: vi.fn(),
    listPlatformLibraryVideos: vi.fn(),
    setPlatformCourseVideos: vi.fn(),
    updatePlatformCourse: vi.fn(),
    uploadPlatformVideo: vi.fn(),
  };
});

function makeVideo(id: string, title: string): api.PlatformCourseVideo {
  return {
    id,
    title,
    contentType: 'video/mp4',
    sizeBytes: 1024,
    durationMilliseconds: 90000,
    createdAt: '2026-11-10T12:00:00Z',
    fileUrl: `/videos/${id}`,
    checkpoints: [],
  };
}

const opening = makeVideo('v-1', 'Abertura');
const closing = makeVideo('v-2', 'Encerramento');

const ergonomics: api.PlatformCourse = {
  id: 'c-1',
  title: 'Ergonomia',
  description: 'Postura',
  createdAt: '2026-11-02T12:00:00Z',
  status: 'Published',
  gamificationEnabled: true,
  gameType: 'Quiz',
  videos: [opening, closing],
  modules: [],
};

const fire: api.PlatformCourse = {
  id: 'c-2',
  title: 'Combate a incêndio',
  description: null,
  createdAt: '2026-11-03T12:00:00Z',
  status: 'Draft',
  gamificationEnabled: false,
  gameType: 'Quiz',
  videos: [],
  modules: [],
};

beforeEach(() => {
  vi.mocked(api.listGameModules).mockReset().mockResolvedValue([]);
  vi.mocked(api.listPlatformCourses).mockReset().mockResolvedValue([ergonomics, fire]);
  vi.mocked(api.listPlatformLibraryVideos).mockReset().mockResolvedValue([
    { video: opening, courseCount: 1 },
    { video: closing, courseCount: 1 },
  ]);
  vi.mocked(api.uploadPlatformVideo).mockReset();
  vi.mocked(api.duplicatePlatformCourse).mockReset();
  vi.mocked(api.setPlatformCourseVideos).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Platform course catalog', () => {
  it('uploads a library video, clears the form and refreshes without errors', async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPlatformVideo).mockResolvedValue(makeVideo('v-3', 'Boas-vindas'));
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('tab', { name: /Biblioteca de vídeos/ }));
    await user.type(screen.getByLabelText('Título do vídeo'), 'Boas-vindas');
    await user.type(screen.getByLabelText('Duração (segundos)'), '90');
    await user.upload(
      screen.getByLabelText('Arquivo de vídeo'),
      new File(['video'], 'boas-vindas.mp4', { type: 'video/mp4' }),
    );
    const submit = screen.getByRole('button', { name: 'Enviar vídeo' });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest('form')!);

    expect(await screen.findByRole('status')).toHaveTextContent('O vídeo "Boas-vindas" foi enviado ao catálogo.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Título do vídeo')).toHaveValue('');
    expect(api.uploadPlatformVideo).toHaveBeenCalledWith('Boas-vindas', 90000, expect.any(File), undefined);
    await waitFor(() => expect(api.listPlatformCourses).toHaveBeenCalledTimes(2));
  });

  it('filters courses by name and status', async () => {
    const user = userEvent.setup();
    render(<PlatformCoursesPage />);

    await screen.findByText('Ergonomia');
    await user.type(screen.getByLabelText('Buscar curso'), 'incêndio');
    expect(screen.queryByText('Ergonomia')).not.toBeInTheDocument();
    expect(screen.getByText('Combate a incêndio')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar curso'));
    await user.selectOptions(screen.getByLabelText('Status'), 'Published');
    expect(screen.getByText('Ergonomia')).toBeInTheDocument();
    expect(screen.queryByText('Combate a incêndio')).not.toBeInTheDocument();
  });

  it('duplicates a course and opens the copy', async () => {
    const user = userEvent.setup();
    const copy = { ...ergonomics, id: 'c-3', title: 'Ergonomia (cópia)', status: 'Draft' as const };
    vi.mocked(api.duplicatePlatformCourse).mockResolvedValue(copy);
    vi.mocked(api.listPlatformCourses)
      .mockResolvedValueOnce([ergonomics, fire])
      .mockResolvedValueOnce([ergonomics, fire, copy]);
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Duplicar curso Ergonomia' }));

    expect(api.duplicatePlatformCourse).toHaveBeenCalledWith('c-1');
    expect(await screen.findByRole('heading', { name: 'Ergonomia (cópia)' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('foi criado como rascunho');
  });

  it('reorders the videos of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setPlatformCourseVideos).mockResolvedValue({
      ...ergonomics,
      videos: [closing, opening],
    });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Abrir curso Ergonomia' }));
    await user.click(screen.getByRole('button', { name: 'Mover Abertura para baixo' }));

    expect(api.setPlatformCourseVideos).toHaveBeenCalledWith('c-1', ['v-2', 'v-1']);
    expect(screen.getByRole('button', { name: 'Mover Abertura para cima' })).toBeDisabled();
  });

  it('saves gamification and status changes of a course', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updatePlatformCourse).mockResolvedValue({ ...fire, gamificationEnabled: true });
    render(<PlatformCoursesPage />);

    await user.click(await screen.findByRole('button', { name: 'Abrir curso Combate a incêndio' }));
    await user.click(screen.getByLabelText(/Gamificação após os vídeos/));
    await user.click(screen.getByLabelText(/Quebra-cabeça/));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(api.updatePlatformCourse).toHaveBeenCalledWith('c-2', {
      title: 'Combate a incêndio',
      description: null,
      status: 'Draft',
      gamificationEnabled: true,
      gameType: 'Puzzle',
    });
  });
});
