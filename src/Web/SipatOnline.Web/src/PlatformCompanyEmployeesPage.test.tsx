import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PlatformCompanyEmployeesPage from './PlatformCompanyEmployeesPage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getPlatformCompanyEmployees: vi.fn(),
  getPlatformDashboard: vi.fn(),
  listPlatformUsers: vi.fn(),
  listSipatPrograms: vi.fn(),
  changePlatformCompanyEmployeesStatus: vi.fn(),
  getCompanyRegistry: vi.fn(),
  importParticipants: vi.fn(),
}));

/** the company page opens on its participants (the sidebar picks the section; there are no tabs) */
async function openParticipants() {
  await screen.findByRole('heading', { name: /Participantes/ });
}

afterEach(cleanup);

beforeEach(() => {
  vi.mocked(api.listSipatPrograms).mockResolvedValue([]);
  vi.mocked(api.listPlatformUsers).mockResolvedValue({ offset: 0, limit: 50, totalCount: 0, items: [] });
  vi.mocked(api.getPlatformDashboard).mockResolvedValue([{
    id: 'company-1',
    key: 'acme',
    name: 'Acme',
    createdAt: '2026-10-21T12:00:00Z',
    isActive: true,
    employeeCount: 1,
    administratorCount: 2,
    totalUserCount: 3,
  }]);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/platform/companies/company-1']}>
      <Routes>
        <Route path="/platform/companies/:companyId/:section?" element={<PlatformCompanyEmployeesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function employeePage(overrides: Partial<api.PlatformCompanyEmployeePage> = {}): api.PlatformCompanyEmployeePage {
  return {
    companyId: 'company-1',
    companyKey: 'acme',
    companyName: 'Acme',
    items: [{
      id: 'employee-1',
      loginIdentifier: 'MAT-001',
      displayName: 'Ana Silva',
      isActive: true,
      progressPercentage: 50,
      completedLessonCount: 1,
      lessonCount: 2,
    }],
    offset: 0,
    limit: 50,
    totalCount: 1,
    ...overrides,
  };
}

describe('Platform company employees', () => {
  it('lets the platform operator import the sheet of the company it is looking at', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlatformCompanyEmployees).mockResolvedValue(employeePage());
    vi.mocked(api.getCompanyRegistry).mockResolvedValue({ units: [], sectors: [], rules: { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false } });
    vi.mocked(api.importParticipants).mockImplementation(async (_dryRun, rows) => ({
      created: rows.length, updated: 0, unchanged: 0, rejected: [],
      credentials: rows.map(row => ({ row: row.row, name: row.name ?? '', login: row.login ?? '' })),
    }));
    renderPage();
    await openParticipants();
    await user.click(screen.getByRole('button', { name: 'Importar participantes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar colaboradores' });
    // opens straight on the sheet, for this company
    await user.upload(within(dialog).getByLabelText('Planilha'), new File(['Login;Senha;Nome completo\nbia;Bia@2026x;Bia Souza\n'], 'carga.csv', { type: 'text/csv' }));
    expect(await within(dialog).findByText(/serão criados/)).toHaveTextContent('1 serão criados');
    expect(api.getCompanyRegistry).toHaveBeenCalledWith('company-1');
    expect(vi.mocked(api.importParticipants).mock.calls[0][2]).toEqual({ companyId: 'company-1' });

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar carga' }));
    await waitFor(() => expect(api.importParticipants).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.importParticipants).mock.calls[1][2]).toEqual({ companyId: 'company-1' });
    await user.click(await within(dialog).findByRole('button', { name: 'Concluir' }));
    expect(await screen.findByText('1 colaboradores adicionados, 0 atualizados.')).toBeVisible();
  });

  it('deactivates the chosen participants after asking, and reloads the list', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlatformCompanyEmployees).mockResolvedValue(employeePage());
    vi.mocked(api.changePlatformCompanyEmployeesStatus).mockResolvedValue({ requested: 1, changed: 1 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await openParticipants();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana Silva' }));
    expect(screen.getByText('1 selecionado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    expect(api.changePlatformCompanyEmployeesStatus).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    expect(api.changePlatformCompanyEmployeesStatus).toHaveBeenCalledWith('company-1', ['employee-1'], false);
    expect(await screen.findByText('1 participante inativado.')).toHaveAttribute('role', 'status');
    expect(screen.queryByText('1 selecionado')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('shows employee name, registration, completion and active status', async () => {
    vi.mocked(api.getPlatformCompanyEmployees).mockResolvedValue(employeePage());
    renderPage();
    await openParticipants();

    expect(await screen.findByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Ana Silva' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'MAT-001' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /50% concluído; 1 de 2 aulas/ }))
      .toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    // the company's sign-in address, as a link the operator hands to the client
    expect(screen.getByRole('link', { name: /^acme\./ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/acme\./));
    expect(screen.queryByRole('region', { name: 'Resumo da empresa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Histórico/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Histórico' })).toBeInTheDocument();
    // one page of results: no pagination buttons that would do nothing
    expect(screen.queryByRole('button', { name: 'Próxima' })).not.toBeInTheDocument();
    expect(screen.queryByText('Conclusão média')).not.toBeInTheDocument();
  });

  it('searches by name or registration and requests inactive employees only when opted in', async () => {
    vi.mocked(api.getPlatformCompanyEmployees)
      .mockResolvedValueOnce(employeePage())
      .mockResolvedValueOnce(employeePage({ items: [] }))
      .mockResolvedValueOnce(employeePage({
        items: [{
          id: 'employee-2',
          loginIdentifier: 'MAT-002',
          displayName: 'Bruno Lima',
          isActive: false,
          progressPercentage: 0,
          completedLessonCount: 0,
          lessonCount: 0,
        }],
      }));
    const user = userEvent.setup();
    renderPage();
    await openParticipants();
    await screen.findByText('Ana Silva');

    // it filters as the operator types, without a search button
    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar por nome ou login'), 'MAT-002');
    expect(await screen.findByText('Nenhum participante encontrado. Tente outro nome ou login.')).toBeInTheDocument();
    expect(api.getPlatformCompanyEmployees).toHaveBeenLastCalledWith(
      'company-1',
      { offset: 0, limit: 50, search: 'MAT-002', includeInactive: false },
    );

    await user.click(screen.getByLabelText('Incluir participantes inativos'));
    expect(await screen.findByText('Bruno Lima')).toBeInTheDocument();
    await waitFor(() => expect(api.getPlatformCompanyEmployees).toHaveBeenLastCalledWith(
      'company-1',
      { offset: 0, limit: 50, search: 'MAT-002', includeInactive: true },
    ));
  });

  it('warns, with a way out, when the company has no administrator', async () => {
    vi.mocked(api.getPlatformCompanyEmployees).mockResolvedValue(employeePage());
    renderPage();
    await openParticipants();

    const warning = await screen.findByText(/Esta empresa ainda não tem administrador/);
    expect(warning).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Adicionar administrador/ }));
    expect(await screen.findByRole('dialog')).toBeVisible();
  });

  it('moves between server-paginated employee results', async () => {
    vi.mocked(api.getPlatformCompanyEmployees)
      .mockResolvedValueOnce(employeePage({ totalCount: 51 }))
      .mockResolvedValueOnce(employeePage({
        items: [{
          id: 'employee-51',
          loginIdentifier: 'MAT-051',
          displayName: 'Zoe Costa',
          isActive: true,
          progressPercentage: 0,
          completedLessonCount: 0,
          lessonCount: 1,
        }],
        offset: 50,
        totalCount: 51,
      }));
    const user = userEvent.setup();
    renderPage();
    await openParticipants();
    await screen.findByText('Ana Silva');
    expect(screen.getByText('Página 1 de 2 · 51 resultados')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));

    expect(await screen.findByText('Zoe Costa')).toBeInTheDocument();
    expect(api.getPlatformCompanyEmployees).toHaveBeenLastCalledWith(
      'company-1',
      { offset: 50, limit: 50, search: '', includeInactive: false },
    );
  });

  it('opens with the search sent by the quality page', async () => {
    vi.mocked(api.getPlatformCompanyEmployees).mockResolvedValue(employeePage());
    render(
      <MemoryRouter initialEntries={['/platform/companies/company-1/participantes?busca=joao.silva']}>
        <Routes>
          <Route path="/platform/companies/:companyId/:section?" element={<PlatformCompanyEmployeesPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('searchbox', { name: 'Buscar por nome ou login' })).toHaveValue('joao.silva');
    await waitFor(() => expect(api.getPlatformCompanyEmployees).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({ search: 'joao.silva' }),
    ));
  });
});
