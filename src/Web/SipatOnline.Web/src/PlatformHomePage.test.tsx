import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlatformHomePage from './PlatformHomePage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  createPlatformCompany: vi.fn(),
  createPlatformUser: vi.fn(),
  getPlatformDashboard: vi.fn(),
  listPlatformCourses: vi.fn(),
}));

afterEach(cleanup);

const acme = { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 };
const beta = { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 0, totalUserCount: 4 };

beforeEach(() => {
  vi.mocked(api.getPlatformDashboard).mockReset().mockResolvedValue([acme, beta] as api.PlatformCompanyOverview[]);
  vi.mocked(api.createPlatformUser).mockReset();
  vi.mocked(api.createPlatformCompany).mockReset();
});

function renderHome(path = '/platform') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlatformHomePage />
    </MemoryRouter>,
  );
}

describe('Platform companies', () => {
  it('lists companies with their administration state instead of a misplaced action', async () => {
    renderHome();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    const acmeRow = screen.getByRole('row', { name: /Acme/ });
    expect(acmeRow).toHaveTextContent(/Acme.*acme.*10.*Ativa/);
    expect(within(acmeRow).getByRole('link', { name: 'Abrir empresa Acme' })).toHaveAttribute('href', '/platform/companies/t1');
    expect(screen.queryByText(/sem administrador/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Atribuir administrador' })).not.toBeInTheDocument();
    expect(screen.getByText('2 empresas na plataforma')).toBeInTheDocument();
    expect(api.listPlatformCourses).not.toHaveBeenCalled();
  });

  it('combines company search and status filters', async () => {
    const user = userEvent.setup();
    renderHome();

    await screen.findByText('Beta');
    await user.type(screen.getByLabelText('Buscar empresa'), 'a');
    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('adds an administrator from the company row menu without leaving the page', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformUser).mockResolvedValue({
      id: 'u1', tenantId: 't2', tenantKey: 'beta', tenantName: 'Beta', loginIdentifier: 'ana.admin',
      displayName: 'Ana Souza', roles: ['ClientAdmin'], isActive: true, createdAt: '2026-11-12T00:00:00Z',
    });
    renderHome();

    await user.click(await screen.findByRole('button', { name: 'Ações da empresa Beta' }));
    expect(screen.getByRole('menuitem', { name: /Entrar no painel da empresa/ })).toHaveAttribute('href', '/admin/dashboard?companyId=t2');
    await user.click(screen.getByRole('menuitem', { name: /Adicionar administrador/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar administrador' });
    await user.type(within(dialog).getByLabelText('Nome'), 'Ana Souza');
    await user.type(within(dialog).getByLabelText('Login'), 'ana.admin');
    await user.type(within(dialog).getByLabelText('Senha inicial temporária'), 'SenhaSegura123!');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar administrador' }));

    expect(api.createPlatformUser).toHaveBeenCalledWith({
      tenantId: 't2', displayName: 'Ana Souza', loginIdentifier: 'ana.admin', initialPassword: 'SenhaSegura123!', role: 'ClientAdmin',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ana Souza agora administra a Beta.');
  });

  it('creates a company with its first administrator in a dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPlatformCompany).mockResolvedValue({ id: 't3', key: 'gama-ltda', name: 'Gama Ltda', createdAt: '', isActive: true });
    renderHome();

    await user.click(await screen.findByRole('button', { name: 'Nova empresa' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova empresa' });
    await user.type(within(dialog).getByLabelText('Nome da empresa'), 'Gama Ltda');
    expect(within(dialog).getByLabelText('Identificador do portal')).toHaveValue('gama-ltda');
    await user.type(within(dialog).getByLabelText('Nome do administrador'), 'Bruno');
    await user.type(within(dialog).getByLabelText('Login do administrador'), 'bruno');
    await user.type(within(dialog).getByLabelText('Senha inicial temporária'), 'SenhaSegura123!');
    // the plan starts on the smallest one and is picked from a list with each plan's medal and what it adds
    expect(within(dialog).getByRole('combobox', { name: /Plano: Bronze/ })).toBeVisible();
    await user.click(within(dialog).getByRole('combobox', { name: /Plano: Bronze/ }));
    await user.click(await screen.findByRole('option', { name: /Ouro.*logo, cores e certificado personalizados/ }));
    expect(within(dialog).getByRole('combobox', { name: /Plano: Ouro/ })).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar empresa' }));

    expect(api.createPlatformCompany).toHaveBeenCalledWith({
      key: 'gama-ltda', name: 'Gama Ltda', adminLoginIdentifier: 'bruno', adminDisplayName: 'Bruno', adminPassword: 'SenhaSegura123!', plan: 'Ouro',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Gama Ltda foi cadastrada');
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
    expect(screen.getByRole('columnheader', { name: /Participantes/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Empresa 12');
    expect(screen.getByText('Exibindo 1–10 de 12 empresas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Empresa 2');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
  });
});
