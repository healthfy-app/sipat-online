import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import VideoLibraryPage from './VideoLibraryPage';
import * as api from '@/api';
import { enqueueUploads } from '@/videoUploads/uploadQueue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/api')>();
  return {
    ...original,
    listPlatformLibraryVideos: vi.fn(), deletePlatformVideo: vi.fn(),
    listSubjects: vi.fn(), listVideoSubjects: vi.fn(), listPlatformCompanies: vi.fn(), listVideoCompanies: vi.fn(),
    listCompanyVideos: vi.fn(), acceptCompanyVideoTerms: vi.fn(), renameCompanyVideo: vi.fn(), deleteCompanyVideo: vi.fn(),
  };
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

function show(company = false) {
  return render(<MemoryRouter initialEntries={[company ? '/admin/videos' : '/platform/videos']}><VideoLibraryPage company={company} /></MemoryRouter>);
}

const card = (title: string) => screen.getByRole('button', { name: `Assistir ${title}` }).closest('article') as HTMLElement;

beforeEach(() => {
  vi.mocked(api.listPlatformLibraryVideos).mockReset().mockResolvedValue([
    { video: opening, courseCount: 1 },
    { video: closing, courseCount: 0 },
  ]);
  vi.mocked(api.deletePlatformVideo).mockReset();
  vi.mocked(api.listSubjects).mockReset().mockResolvedValue([{ id: 's-1', name: 'Ergonomia' }]);
  vi.mocked(api.listVideoSubjects).mockReset().mockResolvedValue([{ videoId: 'v-1', subjectIds: ['s-1'] }]);
  vi.mocked(api.listPlatformCompanies).mockReset().mockResolvedValue([{ id: 'c-1', name: 'Damare' }] as never);
  vi.mocked(api.listVideoCompanies).mockReset().mockResolvedValue([{ videoId: 'v-2', companyIds: ['c-1'] }]);
  vi.mocked(api.listCompanyVideos).mockReset().mockResolvedValue({
    videos: [{ video: opening, trainings: ['SIPAT 2026'] }], usedBytes: 1024 * 1024 * 1024, quotaBytes: 20 * 1024 * 1024 * 1024, termsAccepted: true, canSend: true,
  });
  vi.mocked(api.acceptCompanyVideoTerms).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.renameCompanyVideo).mockReset().mockResolvedValue(undefined);
  vi.mocked(api.deleteCompanyVideo).mockReset().mockResolvedValue(undefined);
  vi.mocked(enqueueUploads).mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Video library page (the operation)', () => {
  it('lists the videos as cards, with where each is used, its assuntos and who it is private to', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Biblioteca de vídeos', level: 1 })).toBeVisible();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    expect(screen.getByText(/2 vídeos/)).toBeVisible();
    expect(screen.getByTitle('Soma do tamanho de todos os vídeos da biblioteca')).toHaveTextContent('0 MB no total');
    await waitFor(() => expect(within(card('Abertura')).getByText(/Em 1 treinamento · Ergonomia/)).toBeVisible());
    expect(within(card('Encerramento')).getByText('Ainda em nenhum treinamento')).toBeVisible();
    expect(await within(card('Encerramento')).findByText('Privado: Damare')).toBeVisible();
  });

  it('filters by name', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    await user.type(screen.getByRole('searchbox', { name: 'Buscar vídeo' }), 'encerra');
    expect(screen.queryByRole('button', { name: 'Assistir Abertura' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assistir Encerramento' })).toBeVisible();
    expect(screen.getByText(/1 de 2/)).toBeVisible();
  });

  it('sends what is picked straight away, named after the files, and leaves out what cannot be sent', async () => {
    const user = userEvent.setup({ applyAccept: false });
    show();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    await user.upload(screen.getByLabelText('Enviar vídeos'), [
      new File(['a'], 'notas.pdf', { type: 'application/pdf' }),
      new File(['b'], 'boas_vindas.mp4', { type: 'video/mp4' }),
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent('notas.pdf: Formato não aceito. Envie MP4 ou WebM.');
    const [entries] = vi.mocked(enqueueUploads).mock.calls[0];
    expect(entries).toHaveLength(1);
    expect(entries[0].file.name).toBe('boas_vindas.mp4');
    expect(entries[0].title).not.toBe('');
  });

  it('deletes a video from its menu after asking, and shows why when it is still in use', async () => {
    const user = userEvent.setup();
    vi.mocked(api.deletePlatformVideo).mockRejectedValueOnce(new Error('Este vídeo ainda está em uso (1 treinamento).')).mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    await user.click(screen.getByRole('button', { name: 'Mais opções de Abertura' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda está em uso');
    await user.click(screen.getByRole('button', { name: 'Mais opções de Abertura' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    await waitFor(() => expect(api.deletePlatformVideo).toHaveBeenCalledTimes(2));
  });

  it('picks several videos and offers what can be done with them', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Abertura' }));
    const bar = screen.getByRole('toolbar');
    expect(within(bar).getByText('1 selecionado')).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Assuntos e empresas' })).toBeEnabled();
    expect(within(bar).getByRole('button', { name: 'Excluir' })).toBeEnabled();
  });

  it('shows a video being prepared without a way to watch it, and why a conversion failed', async () => {
    const converting = { ...makeVideo('v-3', 'Treinamento novo'), status: 'Processing' as const, hasSd480: false };
    const broken = { ...makeVideo('v-4', 'Arquivo quebrado'), status: 'Failed' as const, processingError: 'Arquivo de vídeo inválido.' };
    vi.mocked(api.listPlatformLibraryVideos).mockResolvedValue([{ video: converting, courseCount: 0 }, { video: broken, courseCount: 0 }]);
    show();
    expect(await screen.findByText('Preparando o vídeo…')).toBeVisible();
    expect(screen.getByText('Arquivo de vídeo inválido.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Assistir / })).not.toBeInTheDocument();
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

describe('Video library page (a company)', () => {
  it('is the same page with the company\'s own videos, the room it has and the name changed in place', async () => {
    const user = userEvent.setup();
    show(true);
    expect(await screen.findByRole('heading', { name: 'Vídeos da empresa', level: 1 })).toBeVisible();
    await screen.findByRole('button', { name: 'Assistir Abertura' });
    expect(within(card('Abertura')).getByText('Em SIPAT 2026')).toBeVisible();
    expect(within(screen.getByRole('contentinfo', { name: 'Espaço usado' })).getByText('1 GB de 20 GB')).toBeVisible();
    // what is only the operation's to decide is not there
    expect(screen.queryByLabelText('Filtrar por assunto')).not.toBeInTheDocument();
    expect(api.listSubjects).not.toHaveBeenCalled();

    const name = screen.getByRole('textbox', { name: 'Nome do vídeo Abertura' });
    await user.clear(name);
    await user.type(name, 'Fala do diretor{Enter}');
    await waitFor(() => expect(api.renameCompanyVideo).toHaveBeenCalledWith('v-1', 'Fala do diretor'));
  });

  it('asks for the terms once, before the first video', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listCompanyVideos).mockResolvedValue({ videos: [], usedBytes: 0, quotaBytes: 20 * 1024 * 1024 * 1024, termsAccepted: false, canSend: true });
    show(true);
    expect(await screen.findByText(/Os vídeos que você enviar são da sua empresa/)).toBeVisible();
    expect(screen.queryByLabelText('Enviar vídeos')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concordo, quero enviar' }));
    await waitFor(() => expect(api.acceptCompanyVideoTerms).toHaveBeenCalledTimes(1));
  });

  it('says the plan does not send videos, without a place to drop them', async () => {
    vi.mocked(api.listCompanyVideos).mockResolvedValue({ videos: [], usedBytes: 0, quotaBytes: 20 * 1024 * 1024 * 1024, termsAccepted: false, canSend: false });
    show(true);
    expect(await screen.findByText('Disponível no plano Diamante')).toBeVisible();
    expect(screen.queryByLabelText('Enviar vídeos')).not.toBeInTheDocument();
  });
});
