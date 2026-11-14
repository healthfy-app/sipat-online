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
}));

/** the company opens on its SIPAT builder; these tests are about the participants */
async function openParticipants() {
  await userEvent.click(await screen.findByRole('tab', { name: /Participantes/ }));
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
    expect(await screen.findByRole('status')).toHaveTextContent('1 participante inativado.');
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
    expect(screen.getByText('Identificador · acme')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Resumo da empresa' })).getByText('Administradores')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Administradores/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver histórico' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Atividades e certificados' })).toBeInTheDocument();
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

    await user.type(screen.getByLabelText('Buscar por nome ou login'), 'MAT-002');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Nenhum participante encontrado. Tente outro nome ou identificador.')).toBeInTheDocument();
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
});
