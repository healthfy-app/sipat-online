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

function renderHome(path = '/platform') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlatformHomePage />
    </MemoryRouter>,
  );
}

describe('Platform home', () => {
  it('lists companies independently of the course catalog and links to participant details', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 0, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    renderHome();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    const companyRow = screen.getByRole('row', { name: /Acme/ });
    const companyLink = within(companyRow).getByRole('link', { name: 'Ver participantes de Acme' });
    const administerLink = within(companyRow).getByRole('link', { name: 'Administrar empresa Acme' });
    expect(companyRow).toHaveTextContent(/Acme.*acme.*10.*1.*Ativa/);
    expect(companyLink).toHaveAttribute('href', '/platform/companies/t1');
    expect(administerLink).toHaveAttribute('href', '/admin/dashboard?companyId=t1');
    expect(screen.getByRole('status')).toHaveTextContent('1 empresa sem administrador');
    expect(screen.queryByText('Sem admin')).not.toBeInTheDocument();
    expect(screen.queryByText('2 exibidas')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ Nova empresa' }))
      .toHaveAttribute('href', '/platform/companies');
    expect(api.listPlatformCourses).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver quais' }));
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('1 de 2 exibidas')).toBeInTheDocument();
  });

  it('combines company search and status filters', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 1, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    const user = userEvent.setup();
    renderHome();

    await screen.findByText('Beta');
    await user.type(screen.getByLabelText('Buscar empresa'), 'a');
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('opens directly with only companies missing an administrator', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 0, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    renderHome('/platform?sem-admin=1');

    expect(await screen.findByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    expect(screen.getByText('1 de 2 exibidas')).toBeInTheDocument();
  });

  it('sorts the company directory and paginates results', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `t${index + 1}`,
        key: `empresa-${index + 1}`,
        name: `Empresa ${index + 1}`,
        isActive: true,
        employeeCount: 12 - index,
        administratorCount: 1,
        totalUserCount: 13 - index,
      })) as api.PlatformCompanyOverview[],
    );
    const user = userEvent.setup();
    renderHome();

    const table = await screen.findByRole('table', { name: 'Diretório de empresas' });
    await user.click(screen.getByRole('button', { name: 'Ordenar por participantes' }));
    expect(screen.getByRole('columnheader', { name: 'Participantes' }))
      .toHaveAttribute('aria-sort', 'ascending');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Empresa 12');
    expect(screen.getByText('Exibindo 1–10 de 12 empresas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Empresa 2');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });
});
