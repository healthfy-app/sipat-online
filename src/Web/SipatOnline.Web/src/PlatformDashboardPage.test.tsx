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
  it('shows compact participant cards with actionable administrator status', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'adobe-demo', name: 'Adobe', createdAt: '2026-10-21T12:00:00Z', isActive: true, employeeCount: 2, administratorCount: 0, totalUserCount: 2 },
      { id: 't2', key: 'microsoft-demo', name: 'Microsoft', createdAt: '2026-10-21T12:00:00Z', isActive: false, employeeCount: 2, administratorCount: 1, totalUserCount: 3 },
    ]);

    render(<MemoryRouter><PlatformDashboardPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    const adobe = screen.getByRole('link', { name: 'Ver participantes de Adobe' });
    expect(adobe).toHaveAttribute('href', '/platform/users?tenant=t1&role=Participant');
    expect(adobe).toHaveTextContent('Adobe');
    expect(adobe).toHaveTextContent('adobe-demo');
    expect(within(adobe).getByText('2')).toBeVisible();
    expect(within(adobe).getByText('participantes')).toBeVisible();
    expect(adobe).toHaveTextContent('Sem administrador');
    expect(adobe).not.toHaveTextContent('2 contas');
    expect(adobe).not.toHaveTextContent('#1');

    const microsoft = screen.getByRole('link', { name: 'Ver participantes de Microsoft' });
    expect(microsoft).toHaveTextContent('1 administrador');
    expect(within(microsoft).getByText('Inativa')).toBeVisible();
    expect(within(microsoft).queryByText('Ativa')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Empresas sem administrador/ }))
      .toHaveAttribute('href', '/platform?sem-admin=1');
  });
});
