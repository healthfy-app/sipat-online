import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformDashboardPage from './PlatformDashboardPage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getPlatformDashboard: vi.fn(),
}));

afterEach(cleanup);

describe('platform dashboard', () => {
  it('shows platform indicators and keeps company management in its own directory', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'adobe-demo', name: 'Adobe', createdAt: '2026-10-21T12:00:00Z', isActive: true, employeeCount: 2, administratorCount: 0, totalUserCount: 2 },
      { id: 't2', key: 'microsoft-demo', name: 'Microsoft', createdAt: '2026-10-21T12:00:00Z', isActive: false, employeeCount: 2, administratorCount: 1, totalUserCount: 3 },
    ]);

    render(<MemoryRouter><PlatformDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    const indicators = screen.getByRole('region', { name: 'Indicadores da plataforma' });
    expect(within(indicators).getByText('Empresas cadastradas')).toBeVisible();
    expect(within(indicators).getByText('Participantes')).toBeVisible();
    expect(screen.queryByText(/sem administrador/i)).not.toBeInTheDocument();
    expect(within(indicators).getByText('1 ativas')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Gerenciar empresas Buscar, filtrar e administrar clientes' }))
      .toHaveAttribute('href', '/platform');
    expect(screen.getByRole('heading', { name: 'Acessos rápidos' })).toBeVisible();
    expect(screen.queryByText('Adobe')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver participantes de Adobe' })).not.toBeInTheDocument();
  });

  it('does not present a failed load as an empty platform', async () => {
    vi.mocked(api.getPlatformDashboard).mockRejectedValue(new Error('Serviço indisponível.'));
    render(<MemoryRouter><PlatformDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço indisponível.');
    const indicators = screen.getByRole('region', { name: 'Indicadores da plataforma' });
    expect(within(indicators).getAllByText('—')).toHaveLength(2);
    expect(screen.getByText('Não foi possível verificar os dados. Atualize o painel para tentar novamente.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Cadastrar empresa' })).not.toBeInTheDocument();
  });
});
