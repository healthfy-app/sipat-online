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
    listPlatformCourses: vi.fn(),
    uploadPlatformCourseVideo: vi.fn(),
  };
});

const course: api.PlatformCourse = {
  id: '5c2b8b1e-3f35-4a3a-8f3d-2a6f0f0e7a11',
  title: 'Aloha',
  description: null,
  createdAt: '2026-11-02T12:00:00Z',
  videos: [],
};

const uploadedVideo: api.PlatformCourseVideo = {
  id: 'a1b1a8d4-6a3b-4f3a-9d3b-6a0a2b5c1d22',
  title: 'Boas-vindas',
  contentType: 'video/mp4',
  sizeBytes: 1024,
  durationMilliseconds: 90000,
  createdAt: '2026-11-10T12:00:00Z',
  fileUrl: '/videos/a1b1a8d4',
};

beforeEach(() => {
  vi.mocked(api.listPlatformCourses).mockReset();
  vi.mocked(api.uploadPlatformCourseVideo).mockReset();
  vi.mocked(api.listPlatformCourses)
    .mockResolvedValueOnce([course])
    .mockResolvedValueOnce([{ ...course, videos: [uploadedVideo] }]);
});

afterEach(() => {
  cleanup();
});

describe('Platform course catalog', () => {
  it('uploads a video, clears the form and refreshes the catalog without errors', async () => {
    const user = userEvent.setup();
    vi.mocked(api.uploadPlatformCourseVideo).mockResolvedValue(uploadedVideo);
    render(<PlatformCoursesPage />);

    await screen.findByLabelText('Título do vídeo');
    await user.type(screen.getByLabelText('Título do vídeo'), 'Boas-vindas');
    await user.type(screen.getByLabelText('Duração (segundos)'), '90');
    await user.upload(
      screen.getByLabelText('Arquivo de vídeo'),
      new File(['video'], 'boas-vindas.mp4', { type: 'video/mp4' }),
    );
    const submit = screen.getByRole('button', { name: 'Enviar vídeo' });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest('form')!);

    await waitFor(() => expect(api.uploadPlatformCourseVideo).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('status')).toHaveTextContent('O vídeo "Boas-vindas" foi enviado ao catálogo.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Título do vídeo')).toHaveValue('');
    await waitFor(() => expect(api.listPlatformCourses).toHaveBeenCalledTimes(2));
    expect(api.uploadPlatformCourseVideo).toHaveBeenCalledWith(
      course.id,
      'Boas-vindas',
      90000,
      expect.any(File),
    );
  });
});
