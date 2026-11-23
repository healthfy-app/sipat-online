import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import VideoLibraryPage from './VideoLibraryPage';
import * as api from '@/api';
import { enqueueUploads } from '@/videoUploads/uploadQueue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api')>();
  return { ...original, listPlatformLibraryVideos: vi.fn(), deletePlatformVideo: vi.fn() };
});

vi.mock('@/videoUploads/uploadQueue', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/videoUploads/uploadQueue')>();
  return { ...original, enqueueUploads: vi.fn(() => 2) };
});

function makeVideo(id: string, title: string): api.PlatformCourseVideo {
  return {
    id, title, contentType: 'video/mp4', sizeBytes: 1024, durationMilliseconds: 90000,
    createdAt: '2026-11-10T12:00:00Z', fileUrl: `/videos/${id}`, checkpoints: [], status: 'Ready',
    processingError: null, hasSd480: true,
  };
}

const opening = makeVideo('v-1', 'Abertura');
const closing = makeVideo('v-2', 'Encerramento');

function show() {
  return render(<MemoryRouter initialEntries={['/platform/videos']}><VideoLibraryPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.mocked(api.listPlatformLibraryVideos).mockReset().mockResolvedValue([
    { video: opening, courseCount: 1 },
    { video: closing, courseCount: 0 },
  ]);
  vi.mocked(api.deletePlatformVideo).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Video library page', () => {
  it('lists the standalone videos with how many there are and which are not used yet', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Biblioteca de vídeos', level: 1 })).toBeVisible();
    expect(await screen.findByText('Abertura')).toBeVisible();
    expect(screen.getByText('Encerramento')).toBeVisible();
    expect(screen.getByText(/2 vídeos · 2 KB|2 vídeos · 0 MB/)).toBeVisible();
    // the sum of every video's size, shown next to the count on the search row
    expect(screen.getByTitle('Soma do tamanho de todos os vídeos da biblioteca')).toHaveTextContent('0 MB no total');
    expect(screen.getByText(/1 sem assunto/)).toBeVisible();
  });

  it('filters by name', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Abertura');
    await user.type(screen.getByLabelText('Buscar vídeo'), 'Enc');
    expect(screen.queryByText('Abertura')).not.toBeInTheDocument();
    expect(screen.getByText('1 de 2')).toBeVisible();
  });

  it('picks many videos, suggests titles from the file names and hands them to the background queue', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: 'Enviar vídeos' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar vídeos' });
    await user.upload(within(dialog).getByLabelText(/Arraste os vídeos|Toque para escolher/), [
      new File(['a'], 'uso_de-epi.mp4', { type: 'video/mp4' }),
      new File(['b'], 'ergonomia.webm', { type: 'video/webm' }),
    ]);

    expect(within(dialog).getByLabelText('Título de uso_de-epi.mp4')).toHaveValue('Uso de epi');
    await user.clear(within(dialog).getByLabelText('Título de ergonomia.webm'));
    await user.type(within(dialog).getByLabelText('Título de ergonomia.webm'), 'Postura no trabalho');
    await user.click(within(dialog).getByRole('button', { name: /Enviar 2 vídeos/ }));

    expect(enqueueUploads).toHaveBeenCalledWith([
      { file: expect.any(File), title: 'Uso de epi' },
      { file: expect.any(File), title: 'Postura no trabalho' },
    ], undefined);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 vídeos entraram na fila de envio');
  });

  it('opens the upload with the files dropped anywhere on the page', async () => {
    show();
    await screen.findByText('Abertura');
    const file = new File(['a'], 'treinamento.mp4', { type: 'video/mp4' });
    const page = screen.getByRole('heading', { name: 'Biblioteca de vídeos' }).closest('header')!.parentElement!;
    fireEvent.drop(page, { dataTransfer: { files: [file], types: ['Files'] } });

    const dialog = await screen.findByRole('dialog', { name: 'Enviar vídeos' });
    expect(within(dialog).getByLabelText('Título de treinamento.mp4')).toHaveValue('Treinamento');
  });

  it('marks what cannot be sent and leaves it out', async () => {
    const user = userEvent.setup({ applyAccept: false });
    show();
    await user.click(await screen.findByRole('button', { name: 'Enviar vídeos' }));
    const dialog = screen.getByRole('dialog', { name: 'Enviar vídeos' });
    await user.upload(within(dialog).getByLabelText(/Arraste os vídeos|Toque para escolher/), [
      new File(['a'], 'notas.pdf', { type: 'application/pdf' }),
      new File(['b'], 'ok.mp4', { type: 'video/mp4' }),
    ]);
    expect(within(dialog).getByText('Formato não aceito. Envie MP4 ou WebM.')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Enviar vídeo' })).toBeEnabled();
  });

  it('deletes a video after asking and shows why when it is still in use', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deletePlatformVideo).mockRejectedValueOnce(new Error('Este vídeo ainda está em uso (1 assunto).')).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();
    await user.click((await screen.findAllByRole('button', { name: /^Excluir vídeo / }))[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda está em uso');
    await user.click(screen.getAllByRole('button', { name: /^Excluir vídeo / })[0]);
    await waitFor(() => expect(api.deletePlatformVideo).toHaveBeenCalledTimes(2));
  });

  it('shows a converting video without a preview and why a conversion failed', async () => {
    const converting = { ...makeVideo('v-3', 'Treinamento novo'), status: 'Processing' as const, hasSd480: false };
    const broken = { ...makeVideo('v-4', 'Arquivo quebrado'), status: 'Failed' as const, processingError: 'Arquivo de vídeo inválido.' };
    vi.mocked(api.listPlatformLibraryVideos).mockResolvedValue([{ video: converting, courseCount: 0 }, { video: broken, courseCount: 0 }]);
    show();
    const card = (await screen.findByRole('heading', { name: 'Treinamento novo' })).closest('article') as HTMLElement;
    expect(within(card).getByText('Processando')).toBeVisible();
    expect(card.querySelector('video')).toBeNull();
    const failed = screen.getByRole('heading', { name: 'Arquivo quebrado' }).closest('article') as HTMLElement;
    expect(within(failed).getByText('Arquivo de vídeo inválido.')).toBeVisible();
  });

  it('refreshes while a video is converting and stops when all are ready or on leaving', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const converting = { ...makeVideo('v-3', 'Treinamento novo'), status: 'Processing' as const };
      vi.mocked(api.listPlatformLibraryVideos)
        .mockReset()
        .mockResolvedValueOnce([{ video: converting, courseCount: 0 }])
        .mockResolvedValue([{ video: { ...converting, status: 'Ready' as const }, courseCount: 0 }]);
      const view = show();
      await waitFor(() => expect(api.listPlatformLibraryVideos).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(15_000);
      await waitFor(() => expect(api.listPlatformLibraryVideos).toHaveBeenCalledTimes(2));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(api.listPlatformLibraryVideos).toHaveBeenCalledTimes(2);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
