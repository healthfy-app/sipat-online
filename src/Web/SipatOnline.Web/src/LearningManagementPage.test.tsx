import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import LearningManagementPage from './LearningManagementPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPage(path = '/admin/learning', readOnly = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LearningManagementPage readOnly={readOnly} />
    </MemoryRouter>,
  );
}

function setupApi() {
  const participants = [
    { id: 'participant-1', loginIdentifier: 'MAT-001', displayName: 'Maria José Oliveira', isActive: true },
    { id: 'participant-2', loginIdentifier: 'MAT-002', displayName: 'Carlos Souza', isActive: true },
  ];
  const tracks = [
    { id: 'track-1', sipatEventId: 'sipat-1', title: 'Ergonomia', description: null, revisionNumber: 1, lessonCount: 4, isPublished: true },
    { id: 'track-2', sipatEventId: 'sipat-1', title: 'Segurança', description: null, revisionNumber: 1, lessonCount: 2, isPublished: true },
    { id: 'track-3', sipatEventId: 'sipat-1', title: 'Saúde', description: null, revisionNumber: 1, lessonCount: 3, isPublished: true },
    { id: 'track-draft', sipatEventId: 'sipat-1', title: 'Rascunho', description: null, revisionNumber: 0, lessonCount: 0, isPublished: false },
  ];
  const participation = [
    {
      participantId: 'participant-1', loginIdentifier: 'MAT-001', displayName: 'Maria José Oliveira',
      trackId: 'track-1', trackTitle: 'Ergonomia', assignedAt: '2026-10-21T00:00:00Z',
      lessonCount: 4, completedLessonCount: 2, progressPercentage: 55, isCompleted: false,
    },
    {
      participantId: 'participant-1', loginIdentifier: 'MAT-001', displayName: 'Maria José Oliveira',
      trackId: 'track-2', trackTitle: 'Segurança', assignedAt: '2026-10-22T00:00:00Z',
      lessonCount: 2, completedLessonCount: 0, progressPercentage: 0, isCompleted: false,
    },
  ];
  const createRequests: { data: Record<string, unknown>; status: number }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.startsWith('/api/admin/users/participants?')) {
      return Response.json({
        offset: 0,
        limit: 100,
        totalCount: participants.length,
        items: [...participants],
      });
    }
    if (url === '/api/admin/learning/tracks') return Response.json([...tracks]);
    if (url === '/api/admin/learning/participation') return Response.json([...participation]);
    if (url === '/api/identity/antiforgery') return Response.json({ requestToken: 'csrf-token' });
    if (url === '/api/admin/users' && method === 'POST') {
      const data = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const status = data.loginIdentifier === 'MAT-101' ? 409 : 201;
      createRequests.push({ data, status });
      if (status === 409) {
        return Response.json({ detail: 'Matrícula já cadastrada nesta empresa.' }, { status });
      }
      const participant = {
        id: `participant-${participants.length + 1}`,
        loginIdentifier: String(data.loginIdentifier),
        displayName: String(data.displayName),
        isActive: true,
      };
      participants.push(participant);
      return Response.json(participant, { status });
    }
    if (url.startsWith('/api/admin/learning/tracks/') && url.endsWith('/assignments') && method === 'POST') {
      const trackId = url.split('/')[5];
      const request = JSON.parse(String(init?.body)) as { participantId: string };
      const track = tracks.find((item) => item.id === trackId);
      const participant = participants.find((item) => item.id === request.participantId);
      if (track && participant) {
        participation.push({
          participantId: participant.id,
          loginIdentifier: participant.loginIdentifier,
          displayName: participant.displayName,
          trackId: track.id,
          trackTitle: track.title,
          assignedAt: '2026-10-23T00:00:00Z',
          lessonCount: track.lessonCount,
          completedLessonCount: 0,
          progressPercentage: 0,
          isCompleted: false,
        });
      }
      return Response.json({ id: 'assignment-1', trackId, participantId: request.participantId }, { status: 201 });
    }

    throw new Error(`Unexpected request: ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { participants, participation, createRequests, fetchMock };
}

describe('company participant management', () => {
  it('keeps supervisor drill-down available while hiding participant creation and track assignment', async () => {
    const { fetchMock } = setupApi();
    const user = userEvent.setup();
    renderPage('/admin/learning', true);
    const table = await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Adicionar participantes' })).not.toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Maria José Oliveira/ });
    await user.click(within(row).getByRole('button', { name: /Ver trilhas/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Trilhas de Maria José Oliveira' });
    expect(within(dialog).getByText('Ergonomia')).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Ver histórico' })).toBeVisible();
    expect(within(dialog).queryByRole('button', { name: 'Atribuir trilha' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Liberar outra trilha')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  });

  it('shows one searchable participant row with tracks aggregated and filters by progress', async () => {
    setupApi();
    const user = userEvent.setup();

    renderPage();

    const table = await screen.findByRole('table', { name: 'Participantes da empresa e progresso geral' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('0 de 2')).toBeVisible();
    expect(within(table).getByText('2 de 6 aulas')).toBeVisible();
    expect(within(table).getByRole('progressbar', {
      name: 'Maria José Oliveira: 2 de 6 aulas concluídas (33%)',
    })).toHaveValue(33);

    const search = screen.getByRole('searchbox', { name: 'Buscar por nome ou usuário' });
    await user.type(search, 'jose');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Maria José Oliveira')).toBeVisible();
    expect(within(table).queryByText('Carlos Souza')).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'mat-002');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Carlos Souza')).toBeVisible();

    await user.clear(search);
    await user.selectOptions(screen.getByLabelText('Situação'), 'no-tracks');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Carlos Souza')).toBeVisible();
    expect(within(table).queryByText('Maria José Oliveira')).not.toBeInTheDocument();
  });

  it('applies the progress filter from a dashboard link', async () => {
    setupApi();

    renderPage('/admin/learning?status=not-started');

    expect(await screen.findByLabelText('Situação')).toHaveValue('not-started');
  });

  it('drills into all assigned tracks and keeps assignment scoped to the selected participant', async () => {
    const { fetchMock } = setupApi();
    const user = userEvent.setup();

    renderPage();

    const mariaRow = await screen.findByRole('row', { name: /Maria José Oliveira/ });
    await user.click(within(mariaRow).getByRole('button', { name: 'Ver trilhas' }));

    const detail = await screen.findByRole('dialog', { name: 'Trilhas de Maria José Oliveira' });
    expect(within(detail).getByRole('progressbar', { name: 'Ergonomia: 55% concluído' })).toHaveValue(55);
    expect(within(detail).getByRole('progressbar', { name: 'Segurança: 0% concluído' })).toHaveValue(0);
    expect(within(detail).getByRole('option', { name: /Saúde/ })).toBeVisible();
    expect(within(detail).queryByRole('option', { name: /Ergonomia/ })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('option', { name: /Rascunho/ })).not.toBeInTheDocument();

    await user.selectOptions(within(detail).getByLabelText('Liberar outra trilha'), 'track-3');
    await user.click(within(detail).getByRole('button', { name: 'Atribuir trilha' }));

    expect(await screen.findByText('"Saúde" foi atribuída a Maria José Oliveira.')).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/learning/tracks/track-3/assignments',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('offers single account creation from the upper-right action and opens that participant detail', async () => {
    const { createRequests } = setupApi();
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar participantes' }));

    const dialog = screen.getByRole('dialog', { name: 'Adicionar participantes' });
    await user.type(within(dialog).getByLabelText('Nome completo'), 'João Silva');
    await user.type(within(dialog).getByLabelText('Matrícula'), 'MAT-003');
    await user.type(within(dialog).getByLabelText('Senha inicial'), 'StrongPassword123');
    await user.click(within(dialog).getByRole('button', { name: 'Criar participante' }));

    expect(await screen.findByRole('dialog', { name: 'Trilhas de João Silva' })).toBeVisible();
    expect(createRequests).toHaveLength(1);
    expect(createRequests[0]).toMatchObject({
      status: 201,
      data: {
        loginIdentifier: 'MAT-003',
        displayName: 'João Silva',
        initialPassword: 'StrongPassword123',
        role: 'Participant',
      },
    });
  });

  it('imports valid CSV rows, excludes existing matriculas, reports partial failures, and downloads generated credentials', async () => {
    const { createRequests, participants } = setupApi();
    const createObjectURL = vi.fn(() => 'blob:credentials');
    const revokeObjectURL = vi.fn();
    const clickDownload = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar participantes' }));
    await user.click(screen.getByRole('button', { name: 'Importar CSV' }));
    const csv = new File([
      'nome;matricula\r\nAna Import;MAT-100\r\nPessoa existente;mat-001\r\nBruna Import;MAT-101\r\nCaio Import;MAT-102\r\n',
    ], 'participantes.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Arquivo CSV'), csv);

    expect(await screen.findByText((_, element) =>
      element?.tagName === 'P' && element.textContent?.includes('3 prontos para criar')
      && element.textContent.includes('1 registros precisam de correção'),
    )).toBeVisible();
    expect(screen.getByText(/Matrícula já cadastrada nesta empresa/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Importar 3 participantes' }));

    expect(await screen.findByText('2 criados · 2 não importados.')).toBeVisible();
    expect(screen.getByText(/MAT-101: Matrícula já cadastrada nesta empresa/)).toBeVisible();
    expect(createRequests).toHaveLength(3);
    expect(createRequests.map((request) => request.data.loginIdentifier)).toEqual([
      'MAT-100', 'MAT-101', 'MAT-102',
    ]);
    expect(createRequests.every((request) => String(request.data.initialPassword).length === 20)).toBe(true);
    expect(participants.map((participant) => participant.loginIdentifier)).toContain('MAT-102');
    expect(screen.queryByText(/StrongPassword/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Baixar arquivo de acessos' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clickDownload).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:credentials');
    expect(screen.getByText('Arquivo preparado para distribuição segura.')).toBeVisible();
  });

  it('rejects a CSV with missing required headers without calling account creation', async () => {
    const { createRequests } = setupApi();
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Adicionar participantes' }));
    await user.click(screen.getByRole('button', { name: 'Importar CSV' }));
    const csv = new File(['nome;setor\nAna;Operação\n'], 'invalido.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Arquivo CSV'), csv);

    expect(await screen.findByRole('alert')).toHaveTextContent('Inclua as colunas obrigatórias');
    expect(screen.queryByRole('button', { name: /Importar \d+ participantes/ })).not.toBeInTheDocument();
    expect(createRequests).toEqual([]);
  });
});
