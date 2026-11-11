import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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

    expect(await screen.findByRole('img', { name: 'Distribuição do progresso de 3 participantes' })).toBeVisible();
    expect(screen.getByText('Participantes ativos')).toBeVisible();
    expect(screen.getByText('3 contas no total')).toBeVisible();
    expect(screen.getByText('1 trilha distinta · 1 atribuição concluída')).toBeVisible();
    expect(screen.getByText('Concluíram todas as trilhas')).toBeVisible();
    expect(screen.getByText('Em andamento')).toBeVisible();
    expect(screen.getByText('Contas inativas')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Ergonomia: 70% de progresso médio' })).toHaveValue(70);
    expect(screen.getByText('1/2 concluíram')).toBeVisible();
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

    expect(await screen.findByText('2 contas no total')).toBeVisible();
    expect(screen.queryByRole('img', { name: 'Distribuição do progresso de 2 participantes' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Legenda do progresso' }))
      .getByText('Sem trilhas atribuídas')).toBeVisible();
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
    expect(screen.queryByRole('img', { name: 'Distribuição do progresso de 1 participantes' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('img', { name: 'Distribuição do progresso de 0 participantes' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nenhuma trilha atribuída' })).toBeVisible();
  });

  it('reports load failures instead of rendering a successful-looking empty dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Serviço indisponível')));

    render(<MemoryRouter><TenantLearningDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível');
    expect(screen.queryByRole('img', { name: /Distribuição do progresso/ })).not.toBeInTheDocument();
  });
});
