import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import CollaboratorsPage from './CollaboratorsPage';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  listAllParticipants: vi.fn(), listLearningParticipation: vi.fn(), changeUserStatus: vi.fn(), renameUser: vi.fn(),
  changeEmployeeLogin: vi.fn(), resetEmployeePassword: vi.fn(), createParticipant: vi.fn(),
  listSipatEvents: vi.fn(), listSipatPlans: vi.fn(),
  listParticipantProfiles: vi.fn(), getCompanyRegistry: vi.fn(), saveParticipantProfile: vi.fn(), changePlacement: vi.fn(), importParticipants: vi.fn(),
}));

const people = [
  { id: 'p-1', loginIdentifier: 'maria.jose', displayName: 'Maria José Oliveira', isActive: true },
  { id: 'p-2', loginIdentifier: 'jose.maria', displayName: 'José Maria Santos', isActive: true },
  { id: 'p-3', loginIdentifier: 'ana.lima', displayName: 'Ana Lima', isActive: false },
];
const row = (participantId: string, completed: number) => ({
  participantId, loginIdentifier: '', displayName: '', trackId: `t-${participantId}`, trackTitle: 'Dia 1', assignedAt: '2026-11-09T00:00:00Z',
  lessonCount: 2, completedLessonCount: completed, progressPercentage: completed * 50, isCompleted: completed === 2,
});

const item = (id: string, name: string, isActive = true) => ({ id, name, isActive, peopleCount: 0 });
const noRules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const registry = (rules = noRules) => ({ units: [item('u-1', 'Matriz')], sectors: [item('s-1', 'Produção'), item('s-2', 'Manutenção'), item('s-3', 'Antigo', false)], rules });
const profile = (id: string, unitId: string | null, sectorId: string | null) =>
  ({ id, registrationNumber: null, email: null, phone: null, unitId, sectorId });

beforeEach(() => {
  vi.mocked(api.listParticipantProfiles).mockResolvedValue([]);
  vi.mocked(api.getCompanyRegistry).mockResolvedValue({ units: [], sectors: [], rules: noRules });
  vi.mocked(api.listAllParticipants).mockResolvedValue(people);
  vi.mocked(api.listLearningParticipation).mockResolvedValue([row('p-1', 2), row('p-2', 1)]);
  vi.mocked(api.listSipatEvents).mockResolvedValue({ offset: 0, limit: 100, totalCount: 0, items: [] });
  vi.mocked(api.listSipatPlans).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const renderPage = (readOnly = false) => render(<MemoryRouter><CollaboratorsPage readOnly={readOnly} /></MemoryRouter>);

describe('collaborators', () => {
  it('counts the situation of each person in the training chosen, not across trainings', async () => {
    const user = userEvent.setup();
    const training = (id: string, title: string, startsAt: string) =>
      ({ id, tenantId: 't', title, description: null, startsAt, endsAt: '2099-01-01T00:00:00Z', status: 'Published' as const, createdAt: startsAt });
    vi.mocked(api.listSipatEvents).mockResolvedValue({ offset: 0, limit: 100, totalCount: 2,
      items: [training('sipat', 'SIPAT 2026', '2026-11-09T00:00:00Z'), training('fogo', 'Treinamento contra incêndios', '2026-11-20T00:00:00Z')] });
    vi.mocked(api.listSipatPlans).mockResolvedValue([{ sipatEventId: 'sipat', days: 1, videos: 2 }, { sipatEventId: 'fogo', days: 1, videos: 2 }]);
    vi.mocked(api.listLearningParticipation).mockResolvedValue([
      { ...row('p-1', 2), sipatEventId: 'sipat', sipatTitle: 'SIPAT 2026', sipatStartsAt: '2026-11-09T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' },
      { ...row('p-1', 0), trackId: 't-fogo', sipatEventId: 'fogo', sipatTitle: 'Treinamento contra incêndios', sipatStartsAt: '2026-11-20T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' },
    ]);
    renderPage();
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });

    // opens on the training that started first: Maria finished it
    const picker = await screen.findByRole('combobox', { name: 'Treinamento' });
    expect(picker).toHaveValue('sipat');
    expect(within(table).getByRole('progressbar', { name: '100% concluído' })).toBeVisible();

    await user.selectOptions(picker, 'fogo');
    expect(within(table).queryByRole('progressbar', { name: '100% concluído' })).not.toBeInTheDocument();
  });

  it('shows no training picker when the company has a single training', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(screen.queryByRole('combobox', { name: 'Treinamento' })).not.toBeInTheDocument();
  });

  it('lists everyone with where they got to, and filters by name and situation', async () => {
    const user = userEvent.setup();
    renderPage();
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByRole('progressbar', { name: '100% concluído' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Resumo dos colaboradores' })).toHaveTextContent('3');

    await user.type(screen.getByRole('searchbox'), 'ana');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Ana Lima')).toBeVisible();
    await user.clear(screen.getByRole('searchbox'));
    await user.selectOptions(screen.getByLabelText('Situação'), 'completed');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Maria José Oliveira')).toBeVisible();
  });

  it('edits name, registration and password of a collaborator, sending only what changed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.renameUser).mockResolvedValue(people[1]);
    vi.mocked(api.changeEmployeeLogin).mockResolvedValue({ loginIdentifier: 'jose.santos' });
    vi.mocked(api.resetEmployeePassword).mockResolvedValue(undefined);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar José Maria Santos' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar colaborador' });
    expect(within(dialog).getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText('Nome'));
    await user.type(within(dialog).getByLabelText('Nome'), 'José Santos');
    await user.clear(within(dialog).getByLabelText('Login'));
    await user.type(within(dialog).getByLabelText('Login'), 'jose.santos');
    await user.type(within(dialog).getByLabelText('Nova senha (opcional)'), 'SenhaNova123');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    expect(api.renameUser).toHaveBeenCalledWith('p-2', 'José Santos');
    expect(api.changeEmployeeLogin).toHaveBeenCalledWith('p-2', 'jose.santos');
    expect(api.resetEmployeePassword).toHaveBeenCalledWith('p-2', 'SenhaNova123');
    expect(api.changeUserStatus).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent('Dados de José Santos atualizados (nome, login, senha).');
  });

  it('says what was already saved when a later change fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.renameUser).mockResolvedValue(people[0]);
    vi.mocked(api.changeEmployeeLogin).mockRejectedValue(new Error('Já existe uma conta com esse login nesta empresa.'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar Maria José Oliveira' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar colaborador' });
    await user.type(within(dialog).getByLabelText('Nome'), ' Silva');
    await user.clear(within(dialog).getByLabelText('Login'));
    await user.type(within(dialog).getByLabelText('Login'), 'jose.maria');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe uma conta com esse login nesta empresa. Já foi salvo: nome.');
  });

  it('deactivates the chosen collaborators after asking', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changeUserStatus).mockResolvedValue(people[0]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Maria José Oliveira' }));
    await user.click(screen.getByRole('button', { name: 'Inativar' }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(api.changeUserStatus).toHaveBeenCalledWith('p-1', false));
    expect(await screen.findByRole('status')).toHaveTextContent('1 colaborador inativado.');
    confirm.mockRestore();
  });

  it('only shows progress to someone who cannot manage', async () => {
    renderPage(true);
    await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar colaboradores' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Selecionar / })).not.toBeInTheDocument();
  });

  it('filters by sector and shows the unit and sector columns', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry());
    vi.mocked(api.listParticipantProfiles).mockResolvedValue([profile('p-1', 'u-1', 's-1'), profile('p-2', null, 's-2')]);
    renderPage();
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(within(table).getByRole('columnheader', { name: 'Unidade' })).toBeVisible();
    expect(within(table).getByRole('columnheader', { name: 'Setor' })).toBeVisible();
    expect(within(table).getAllByRole('row')).toHaveLength(4);

    await user.selectOptions(screen.getByLabelText('Filtrar por setor'), 's-1');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Maria José Oliveira')).toBeVisible();
    expect(within(table).getByText('Matriz')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Filtrar por setor'), 'none');
    expect(within(table).getByText('Ana Lima')).toBeVisible();
    expect(within(table).queryByText('Maria José Oliveira')).not.toBeInTheDocument();
  });

  it('keeps the unit filter in its place when the company has no units, saying there are none', async () => {
    vi.mocked(api.getCompanyRegistry).mockResolvedValue({ ...registry(), units: [] });
    renderPage();
    await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(screen.getByLabelText('Filtrar por setor')).toBeVisible();
    expect(within(screen.getByLabelText('Filtrar por unidade')).getByRole('option', { name: 'Nenhuma unidade cadastrada' })).toBeDisabled();
  });

  it('moves two selected people to a sector with changePlacement', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry());
    vi.mocked(api.changePlacement).mockResolvedValue({ changed: 2 });
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Maria José Oliveira' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar José Maria Santos' }));
    await user.click(screen.getByRole('button', { name: 'Mudar setor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mudar setor' });
    expect(within(dialog).queryByRole('option', { name: 'Antigo' })).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Setor'), 's-1');
    await user.click(within(dialog).getByRole('button', { name: 'Mudar setor' }));

    await waitFor(() => expect(api.changePlacement).toHaveBeenCalledWith(['p-1', 'p-2'], 'sector', 's-1'));
    expect(await screen.findByRole('status')).toHaveTextContent('2 colaboradores passaram para Produção.');
  });

  it('takes the sector away from the selected people', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry());
    vi.mocked(api.changePlacement).mockResolvedValue({ changed: 1 });
    renderPage();
    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Maria José Oliveira' }));
    await user.click(screen.getByRole('button', { name: 'Mudar setor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mudar setor' });
    await user.selectOptions(within(dialog).getByLabelText('Setor'), 'none');
    await user.click(within(dialog).getByRole('button', { name: 'Mudar setor' }));
    await waitFor(() => expect(api.changePlacement).toHaveBeenCalledWith(['p-1'], 'sector', null));
    expect(await screen.findByRole('status')).toHaveTextContent('1 colaborador ficou sem setor.');
  });

  it('warns "1 pessoa sem setor" when the rule is on, counting only active people, and the button filters them', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry({ ...noRules, requireSector: true }));
    vi.mocked(api.listParticipantProfiles).mockResolvedValue([profile('p-1', null, 's-1')]);
    renderPage();
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(await screen.findByText('1 pessoa sem setor')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mostrar quem está sem setor' }));
    expect(screen.getByLabelText('Filtrar por setor')).toHaveValue('none');
    expect(within(table).getByText('José Maria Santos')).toBeVisible();
  });

  it('does not warn when the rule is off', async () => {
    renderPage();
    await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(screen.queryByText(/sem setor/)).not.toBeInTheDocument();
  });

  it('edits registration and sector of a collaborator with a single save, typing the sector name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry());
    vi.mocked(api.listParticipantProfiles).mockResolvedValue([profile('p-3', null, 's-3')]);
    vi.mocked(api.saveParticipantProfile).mockResolvedValue(profile('p-3', null, 's-1'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Editar Ana Lima' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar colaborador' });
    expect(within(dialog).getByLabelText('Setor')).toHaveValue('Antigo');
    await user.type(within(dialog).getByLabelText('Matrícula'), '123');
    await user.clear(within(dialog).getByLabelText('Setor'));
    await user.type(within(dialog).getByLabelText('Setor'), 'produção');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(api.saveParticipantProfile).toHaveBeenCalledTimes(1));
    expect(api.saveParticipantProfile).toHaveBeenCalledWith('p-3', { registrationNumber: '123', email: null, phone: null, unitId: null, sectorId: 's-1' });
    expect(await screen.findByRole('status')).toHaveTextContent('Dados de Ana Lima atualizados (cadastro).');
  });

  it('marks the fields the company made required in the edit dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry({ ...noRules, requireEmail: true }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Editar Ana Lima' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar colaborador' });
    expect(within(dialog).getByText('E-mail (obrigatório nesta empresa)')).toBeVisible();
    expect(within(dialog).getByText('Telefone')).toBeVisible();
  });

  it('keeps the page usable without the new columns when the profiles fail to load', async () => {
    vi.mocked(api.listParticipantProfiles).mockRejectedValue(new Error('Falha ao carregar os cadastros.'));
    renderPage();
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar os cadastros.');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).queryByRole('columnheader', { name: 'Setor' })).not.toBeInTheDocument();
  });

  it('shows the columns but no batch buttons to someone who cannot manage', async () => {
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry());
    renderPage(true);
    const table = await screen.findByRole('table', { name: 'Colaboradores da empresa' });
    expect(within(table).getByRole('columnheader', { name: 'Setor' })).toBeVisible();
    expect(screen.getByLabelText('Filtrar por setor')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Mudar setor' })).not.toBeInTheDocument();
  });

  it('a carga usa a planilha do RH: a senha vem da planilha e a linha sem senha é recusada com o motivo', async () => {
    const user = userEvent.setup();
    const downloads: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:x'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.mocked(api.importParticipants).mockImplementation(async (_dryRun, rows) => ({
      created: 1, updated: 0, unchanged: 0,
      rejected: [{ row: 3, login: 'bia', message: 'Setor "Marketing" não está na lista da empresa.' }],
      credentials: [{ row: rows[0].row, name: 'Ana Costa', login: 'ana.costa' }],
    }));
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar colaboradores' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar colaboradores' });
    await user.click(within(dialog).getByRole('button', { name: 'Importar planilha' }));
    await user.upload(within(dialog).getByLabelText('Planilha'), new File([
      'Login;Senha;Nome completo;*setor\nana.costa;Ana@2026x;Ana Costa;Produção\nbia;Bia@2026x;Bia;Marketing\ncarla;;Carla;Produção\n',
    ], 'carga.csv', { type: 'text/csv' }));

    expect(await within(dialog).findByText(/serão criados/)).toHaveTextContent('1 serão criados · 0 atualizados · 0 sem mudança · 2 recusados');
    expect(within(dialog).getByText('Linha 3 · bia: Setor "Marketing" não está na lista da empresa.')).toBeVisible();
    expect(within(dialog).getByText('Linha 4 · carla: Falta senha.')).toBeVisible();
    expect(within(dialog).getByText('Colunas reconhecidas: Login, Senha, Nome completo, Setor')).toBeVisible();
    const [dryRun, previewRows] = vi.mocked(api.importParticipants).mock.calls[0];
    expect(dryRun).toBe(true);
    // the line without a password never reaches the server; the others carry the password of the sheet
    expect(previewRows.map(row => [row.row, row.password])).toEqual([[2, 'Ana@2026x'], [3, 'Bia@2026x']]);

    await user.click(within(dialog).getByRole('button', { name: 'Confirmar carga' }));
    await waitFor(() => expect(api.importParticipants).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.importParticipants).mock.calls[1][0]).toBe(false);
    expect(vi.mocked(api.importParticipants).mock.calls[1][1]).toEqual(previewRows);

    await user.click(within(dialog).getByRole('button', { name: 'Baixar o arquivo de acessos' }));
    const csv = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(downloads[downloads.length - 1]); });
    expect(csv).toContain('"Ana Costa";"ana.costa";"Ana@2026x"');
    // the passwords are in the sheet the company already has: closing does not ask for the file
    await user.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar colaboradores' })).not.toBeInTheDocument());
  });

  it('a carga grava em partes de 100 e, quando uma parte falha, tenta de novo só as que faltam', async () => {
    const user = userEvent.setup();
    const created = (rows: api.ImportRow[]) => ({
      created: rows.length, updated: 0, unchanged: 0, rejected: [],
      credentials: rows.map(row => ({ row: row.row, name: row.name ?? '', login: row.login ?? '' })),
    });
    let failSecond: (error: Error) => void = () => undefined;
    let saves = 0;
    vi.mocked(api.importParticipants).mockImplementation((dryRun, rows) => {
      if (dryRun) return Promise.resolve(created(rows));
      saves++;
      return saves === 2 ? new Promise((_, reject) => { failSecond = reject; }) : Promise.resolve(created(rows));
    });
    const sheet = ['Login;Senha;Nome completo', ...Array.from({ length: 250 }, (_, index) => `p${index};Senha@${index}x;Pessoa ${index}`)].join('\n');
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar colaboradores' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar colaboradores' });
    await user.click(within(dialog).getByRole('button', { name: 'Importar planilha' }));
    await user.upload(within(dialog).getByLabelText('Planilha'), new File([sheet], 'carga.csv', { type: 'text/csv' }));

    expect(await within(dialog).findByText(/serão criados/)).toHaveTextContent('250 serão criados');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar carga' }));
    expect(await within(dialog).findByText('Gravando… 100 de 250')).toBeVisible();
    failSecond(new Error('A requisição demorou demais.'));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'A carga parou na linha 102. As pessoas já gravadas estão no arquivo de acessos. Tente de novo para gravar o restante.');
    expect(within(dialog).getByText(/100 criados/)).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Tentar de novo' }));
    expect(await within(dialog).findByText(/250 criados/)).toBeVisible();
    const calls = vi.mocked(api.importParticipants).mock.calls;
    expect(calls.filter(([dryRun]) => dryRun).map(([, rows]) => rows.length)).toEqual([250]);
    const saved = calls.filter(([dryRun]) => !dryRun).map(([, rows]) => [rows[0].row, rows.length]);
    expect(saved).toEqual([[2, 100], [102, 100], [102, 100], [202, 50]]);
    expect(within(dialog).queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument();
  });

  it('o cadastro de um colaborador só cria: recusa quem já existe e mostra o login de quem foi criado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.importParticipants)
      .mockResolvedValueOnce({ created: 0, updated: 0, unchanged: 0, rejected: [{ row: 1, login: 'ana', message: 'Já existe um colaborador com esse login ou matrícula.' }], credentials: [] })
      .mockResolvedValueOnce({ created: 1, updated: 0, unchanged: 0, rejected: [], credentials: [{ row: 1, name: 'Ana Costa', login: 'ana.costa' }] });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar colaboradores' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar colaboradores' });
    await user.type(within(dialog).getByLabelText('Nome'), 'Ana Costa');
    await user.type(within(dialog).getByLabelText('Login (opcional)'), 'ana');
    await user.type(within(dialog).getByLabelText('Senha inicial'), 'Senha12345');
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar colaborador' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Já existe um colaborador com esse login ou matrícula.');
    expect(api.importParticipants).toHaveBeenCalledWith(false, [{ row: 1, name: 'Ana Costa', login: 'ana', password: 'Senha12345' }], { createOnly: true });

    await user.clear(within(dialog).getByLabelText('Login (opcional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar colaborador' }));
    expect(await within(dialog).findByText('Ana Costa foi adicionada. Login: ana.costa.')).toBeVisible();
    expect(vi.mocked(api.importParticipants).mock.calls[1][2]).toEqual({ createOnly: true });
  });
});
