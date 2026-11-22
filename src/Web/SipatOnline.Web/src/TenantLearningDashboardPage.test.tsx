import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TenantLearningDashboardPage from './TenantLearningDashboardPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tenant learning dashboard', () => {
  it('shows company-wide participant distribution and progress by track', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/admin/users/participants?offset=0&limit=100') {
        return Response.json({
          offset: 0,
          limit: 100,
          totalCount: 3,
          items: [
            { id: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', isActive: true },
            { id: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002', isActive: true },
            { id: 'p3', displayName: 'Carla Nunes', loginIdentifier: 'MAT-003', isActive: false },
          ],
        });
      }
      if (url === '/api/admin/learning/participation') {
        return Response.json([
          {
            participantId: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001',
            trackId: 't1', trackTitle: 'Ergonomia', assignedAt: '2026-01-01T00:00:00Z',
            lessonCount: 2, completedLessonCount: 2, progressPercentage: 100, isCompleted: true,
          },
          {
            participantId: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002',
            trackId: 't1', trackTitle: 'Ergonomia', assignedAt: '2026-01-02T00:00:00Z',
            lessonCount: 2, completedLessonCount: 1, progressPercentage: 40, isCompleted: false,
          },
        ]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('img', { name: /^Distribuição do progresso de 3 participantes/ })).toBeVisible();
    expect(screen.getByText('Participantes ativos')).toBeVisible();
    expect(screen.queryByText(/contas no total/)).not.toBeInTheDocument();
    expect(screen.getByText('Concluíram tudo')).toBeVisible();
    expect(screen.getByRole('img', { name: /Distribuição do progresso de/ })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Engajamento' })).toBeVisible();
    // the people come last: the picture of the company first
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings.at(-1)).toMatch(/^Colaboradores da /);
    const legend = within(screen.getByRole('list', { name: 'Legenda do progresso' }));
    expect(legend.getByText('Concluíram todos os dias')).toBeVisible();
    expect(legend.getByText('Em andamento')).toBeVisible();
    expect(legend.getByText('Participantes inativos')).toBeVisible();
    const table = within(screen.getByRole('table', { name: 'Colaboradores da empresa' }));
    expect(table.getByText('Ana Costa')).toBeVisible();
    expect(table.getByText('1 de 1')).toBeVisible();
    expect(table.getByText('Inativo')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Ergonomia: 70% de progresso médio' })).toHaveValue(70);
    expect(screen.getByText('1/2 concluíram · 70%')).toBeVisible();
  });

  it('replaces a single-slice donut with a useful summary and a filtered next step', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/admin/users/participants?offset=0&limit=100') {
        return Response.json({
          offset: 0,
          limit: 100,
          totalCount: 2,
          items: [
            { id: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', isActive: true },
            { id: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002', isActive: true },
          ],
        });
      }
      if (url === '/api/admin/learning/participation') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByText('Participantes ativos')).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Legenda do progresso' }))
      .getByText('Sem dias')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Escolher participantes' }))
      .toHaveAttribute('href', '/admin/learning?status=no-tracks');
  });

  it('offers the participant filter for people who have not started their assigned track', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/admin/users/participants?offset=0&limit=100') {
        return Response.json({
          offset: 0,
          limit: 100,
          totalCount: 1,
          items: [{ id: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', isActive: true }],
        });
      }
      if (url === '/api/admin/learning/participation') {
        return Response.json([{
          participantId: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001',
          trackId: 't1', trackTitle: 'Ergonomia', assignedAt: '2026-01-01T00:00:00Z',
          lessonCount: 2, completedLessonCount: 0, progressPercentage: 0, isCompleted: false,
        }]);
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Acompanhar progresso' }))
      .toHaveAttribute('href', '/admin/learning?status=not-started');
  });

  it('shows an explicit empty state without a zero-valued chart for a company with no participants', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/admin/users/participants?offset=0&limit=100') {
        return Response.json({ offset: 0, limit: 100, totalCount: 0, items: [] });
      }
      if (url === '/api/admin/learning/participation') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Ainda não há participantes' })).toBeVisible();
    expect(screen.queryByRole('img', { name: /Distribuição do progresso/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Colaboradores da empresa' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nenhum dia entregue' })).toBeVisible();
  });

  it('pages through the company participants and filters them by name', async () => {
    const people = Array.from({ length: 11 }, (_, index) => ({
      id: `p${index}`, displayName: `Pessoa ${String(index + 1).padStart(2, '0')}`, loginIdentifier: `MAT-${index}`, isActive: true,
    }));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/admin/users/participants?offset=0&limit=100') {
        return Response.json({ offset: 0, limit: 100, totalCount: people.length, items: people });
      }
      if (url === '/api/admin/learning/participation') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));
    const user = userEvent.setup();

    render(<MemoryRouter><TenantLearningDashboardPage companyName="Acme" /></MemoryRouter>);

    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(screen.getByRole('heading', { name: 'Colaboradores da Acme' })).toBeVisible();
    expect(within(table).getAllByRole('row')).toHaveLength(9);
    expect(screen.getByText('Mostrando 1–8 de 11')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText('Mostrando 9–11 de 11')).toBeVisible();
    expect(within(table).getByText('Pessoa 11')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Buscar por nome ou login'), 'pessoa 03');
    expect(screen.getByText('Mostrando 1–1 de 1')).toBeVisible();
    expect(within(table).getByText('Pessoa 03')).toBeVisible();
  });

  it('reports load failures instead of rendering a successful-looking empty dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Serviço indisponível')));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível');
    expect(screen.queryByRole('img', { name: /Distribuição do progresso/ })).not.toBeInTheDocument();
  });
});
