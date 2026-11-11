import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlatformHomePage from './PlatformHomePage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getPlatformDashboard: vi.fn(),
  listPlatformCourses: vi.fn(),
}));

afterEach(cleanup);

describe('Platform home', () => {
  it('lists companies independently of the course catalog and links to employee details', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 1, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    render(<MemoryRouter><PlatformHomePage /></MemoryRouter>);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    const companyLink = screen.getByRole('link', { name: 'Ver colaboradores de Acme' });
    expect(companyLink.closest('li')).toHaveTextContent('10 colaboradores ativos');
    expect(companyLink)
      .toHaveAttribute('href', '/platform/companies/t1');
    expect(screen.getByRole('link', { name: 'Administrar Acme' }))
      .toHaveAttribute('href', '/admin/dashboard?companyId=t1');
    expect(screen.queryByRole('link', { name: 'Administrar Beta' })).not.toBeInTheDocument();
    expect(api.listPlatformCourses).not.toHaveBeenCalled();
  });

  it('filters companies by name or identifier', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 1, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    const user = userEvent.setup();
    render(<MemoryRouter><PlatformHomePage /></MemoryRouter>);

    await screen.findByText('Beta');
    await user.type(screen.getByLabelText('Buscar empresa'), 'acme');
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
});
