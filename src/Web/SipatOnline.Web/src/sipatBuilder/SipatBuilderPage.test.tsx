import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import SipatBuilderPage, { findIssues } from './SipatBuilderPage';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  getSipatCatalog: vi.fn(), listSipatEvents: vi.fn(), listSipatPlans: vi.fn(), getSipatPlan: vi.fn(), saveSipatPlan: vi.fn(), cancelSipatEvent: vi.fn(),
}));
afterEach(cleanup);

beforeEach(() => {
  vi.mocked(api.getSipatCatalog).mockResolvedValue({ courses: [], videos: [], games: [] });
  vi.mocked(api.listSipatEvents).mockResolvedValue({
    offset: 0, limit: 100, totalCount: 1,
    items: [{ id: 's1', tenantId: 't', title: 'SIPAT 2026', description: null, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-11T00:00:00Z', status: 'Draft', createdAt: '2026-10-01T00:00:00Z' }],
  });
  vi.mocked(api.listSipatPlans).mockResolvedValue([]);
  vi.mocked(api.getSipatPlan).mockResolvedValue([
    { id: 'd1', title: 'Abertura', date: '2026-11-09', subject: null, videoIds: ['v1'], gameIds: [] },
    { id: 'd2', title: '', date: '2026-11-10', subject: null, videoIds: [], gameIds: [] },
  ]);
  vi.mocked(api.saveSipatPlan).mockClear();
});

function renderBuilder() {
  render(<MemoryRouter initialEntries={['/admin/sipats/s1']}>
    <Routes>
      <Route element={<SipatBuilderPage basePath="/admin/sipats" />} path="/admin/sipats/:sipatId" />
      <Route element={<p>Lista de SIPATs</p>} path="/admin/sipats" />
    </Routes>
  </MemoryRouter>);
}

describe('SIPAT builder', () => {
  it('lists what is missing on each day, by position', () => {
    const issues = findIssues('', [
      { key: 'a', title: 'Abertura', date: '2026-11-09', subject: '', videos: ['v1'], games: [] },
      { key: 'b', title: ' ', date: '', subject: '', videos: [null], games: [] },
    ]);
    expect(issues.name).toBe('Dê um nome à formação.');
    expect(issues.days).toEqual({ 1: ['Falta o slogan do dia.', 'Falta um assunto com vídeos.'] });
  });

  it('marks the incomplete day on the grid instead of saving', async () => {
    renderBuilder();
    await userEvent.click(await screen.findByRole('button', { name: /Publicar/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('1 dia precisa de ajuste antes de salvar.');
    expect(screen.getByText('Falta o slogan do dia.')).toBeVisible();
    expect(screen.getByText('Falta um assunto com vídeos.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Título do dia 2' })).toHaveAttribute('aria-invalid', 'true');
    expect(api.saveSipatPlan).not.toHaveBeenCalled();
  });

  it('puts a removed day back with undo', async () => {
    renderBuilder();
    await userEvent.click(await screen.findByRole('button', { name: 'Remover o dia 1' }));
    expect(screen.queryByDisplayValue('Abertura')).not.toBeInTheDocument();

    const bar = screen.getAllByRole('status').find(item => item.textContent?.includes('"Abertura" removido.'));
    if (!bar) throw new Error('the undo bar is missing');
    await userEvent.click(within(bar).getByRole('button', { name: /Desfazer/ }));

    expect(screen.getByRole('textbox', { name: 'Título do dia 1' })).toHaveValue('Abertura');
  });

  it('keeps only save and publish in view; ending the SIPAT is in the menu and asks first', async () => {
    vi.mocked(api.cancelSipatEvent).mockResolvedValue({
      id: 's1', tenantId: 't', title: 'SIPAT 2026', description: null, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-11T00:00:00Z', status: 'Cancelled', createdAt: '2026-10-01T00:00:00Z',
    });
    renderBuilder();
    expect(await screen.findByRole('button', { name: /Salvar rascunho/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Importar CSV/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Mais/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Encerrar esta formação/ }));
    expect(await screen.findByRole('dialog', { name: 'Encerrar "SIPAT 2026"?' })).toBeVisible();
    expect(api.cancelSipatEvent).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Encerrar formação/ }));
    expect(api.cancelSipatEvent).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Formação encerrada.')).toBeVisible();
  });

  it('calls the parts Módulo when no day has a date', async () => {
    vi.mocked(api.getSipatPlan).mockResolvedValue([{ id: 'd1', title: 'Abertura', date: null, subject: null, videoIds: ['v1'], gameIds: [] }]);
    renderBuilder();
    expect(await screen.findByRole('textbox', { name: 'Título do módulo 1' })).toBeVisible();
  });

  it('publishes beside another published training without warning', async () => {
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 2,
      items: [
        { id: 's1', tenantId: 't', title: 'SIPAT 2026', description: null, startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-11T00:00:00Z', status: 'Draft', createdAt: '2026-10-01T00:00:00Z' },
        { id: 's0', tenantId: 't', title: 'SIPAT 2025', description: null, startsAt: '2025-11-10T00:00:00Z', endsAt: '2025-11-15T00:00:00Z', status: 'Published', createdAt: '2025-10-01T00:00:00Z' },
      ],
    });
    vi.mocked(api.getSipatPlan).mockResolvedValue([{ id: 'd1', title: 'Abertura', date: '2026-11-09', subject: null, videoIds: ['v1'], gameIds: [] }]);
    renderBuilder();
    await userEvent.click(await screen.findByRole('button', { name: /Publicar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Publicar a formação?' });
    expect(dialog).toHaveTextContent('Ao publicar, cada dia é entregue aos participantes ativos da empresa.');
    expect(dialog).not.toHaveTextContent('deixa de aparecer');
  });

  it('asks before leaving through a link with unsaved changes', async () => {
    renderBuilder();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título do dia 2' }), 'Mãos seguras');
    await userEvent.click(screen.getByRole('link', { name: /Todas as formações/ }));

    expect(await screen.findByRole('dialog', { name: 'Sair sem salvar?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.queryByText('Lista de SIPATs')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /Todas as formações/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sair sem salvar' }));
    expect(await screen.findByText('Lista de SIPATs')).toBeVisible();
  });

  describe('extras', () => {
    const house = (id: string, ms = 60000) => ({
      courseCount: 1,
      video: {
        id, title: `Vídeo ${id}`, contentType: 'video/mp4', sizeBytes: 1, durationMilliseconds: ms, createdAt: '2026-11-10T12:00:00Z',
        fileUrl: `/videos/${id}`, checkpoints: [], status: 'Ready' as const, processingError: null, hasSd480: true,
      },
    });
    const extra = {
      courseCount: 1,
      video: { ...house('x1').video, title: 'Dicas do canal', provider: 'YouTube' as const, externalId: 'dQw4w9WgXcQ', fileUrl: '', durationMilliseconds: 0 },
    };

    it('keeps a day with 5 house videos and 1 extra valid and saves all 6 ids in order', async () => {
      const library = [house('a'), house('b'), house('c'), house('d'), house('e'), extra];
      vi.mocked(api.getSipatCatalog).mockResolvedValue({ courses: [], videos: library, games: [] });
      const ids = ['a', 'b', 'c', 'd', 'e', 'x1'];
      const plan = [{ id: 'd1', title: 'Abertura', date: '2026-11-09', subject: null, videoIds: ids, gameIds: [] }];
      vi.mocked(api.getSipatPlan).mockResolvedValue(plan);
      vi.mocked(api.saveSipatPlan).mockResolvedValue(plan);
      renderBuilder();

      const content = await screen.findByRole('group', { name: 'Conteúdo do dia 1' });
      expect(within(content).getAllByText('Extra')).toHaveLength(1);
      expect(within(content).getByText('YouTube')).toBeVisible();
      expect(screen.getByText('5 vídeos + 1 extra')).toBeVisible();
      expect(screen.getByText('0:05:00')).toBeVisible();

      await userEvent.type(screen.getByRole('textbox', { name: 'Título do dia 1' }), '!');
      await userEvent.click(screen.getByRole('button', { name: /Salvar rascunho/ }));
      await waitFor(() => expect(api.saveSipatPlan).toHaveBeenCalledWith('s1', [expect.objectContaining({ videoIds: ids })]));
    });
  });
});
