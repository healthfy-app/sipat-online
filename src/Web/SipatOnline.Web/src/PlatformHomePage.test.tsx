import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
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
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 0, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    render(<MemoryRouter><PlatformHomePage /></MemoryRouter>);

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    const companyRow = screen.getByRole('row', { name: /Acme/ });
    const companyLink = within(companyRow).getByRole('link', { name: 'Ver colaboradores' });
    expect(companyRow).toHaveTextContent(/Acme.*acme.*10.*1.*Ativa/);
    expect(companyLink).toHaveAttribute('href', '/platform/companies/t1');
    expect(screen.getByText('Sem admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Nova empresa' }))
      .toHaveAttribute('href', '/platform/companies');
    expect(screen.queryByRole('link', { name: /Administrar/ })).not.toBeInTheDocument();
    expect(api.listPlatformCourses).not.toHaveBeenCalled();
  });

  it('combines company search and status filters', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 1, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    const user = userEvent.setup();
    render(<MemoryRouter><PlatformHomePage /></MemoryRouter>);

    await screen.findByText('Beta');
    await user.type(screen.getByLabelText('Buscar empresa'), 'a');
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });
});
