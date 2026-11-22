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

beforeEach(() => {
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
});
