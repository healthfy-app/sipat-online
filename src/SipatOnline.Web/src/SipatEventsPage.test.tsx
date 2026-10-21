import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SipatEventsPage from './SipatEventsPage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>();
  return {
    ...original,
    cancelSipatEvent: vi.fn(),
    createSipatEvent: vi.fn(),
    listSipatEvents: vi.fn(),
    publishSipatEvent: vi.fn(),
    updateSipatEvent: vi.fn(),
  };
});

const draftEvent: api.SipatEvent = {
  id: 'dcda2088-73ca-4c72-bd4c-03e271466176',
  tenantId: '28a96c9e-f18e-4e94-8b1e-739d7ccdc3a5',
  title: 'SIPAT 2026',
  description: 'Semana de prevenção e cuidado',
  startsAt: '2026-10-21T12:00:00Z',
  endsAt: '2026-10-22T12:00:00Z',
  status: 'Draft',
  createdAt: '2026-09-01T12:00:00Z',
};

function makePage(items: api.SipatEvent[], totalCount = items.length): api.SipatEventPage {
  return { offset: 0, limit: 20, totalCount, items };
}

beforeEach(() => {
  vi.mocked(api.listSipatEvents).mockReset();
  vi.mocked(api.createSipatEvent).mockReset();
  vi.mocked(api.updateSipatEvent).mockReset();
  vi.mocked(api.publishSipatEvent).mockReset();
  vi.mocked(api.cancelSipatEvent).mockReset();
  vi.mocked(api.listSipatEvents).mockResolvedValue(makePage([draftEvent]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SIPAT event administration', () => {
  it('publishes a draft and refreshes its status', async () => {
    const publishedEvent = { ...draftEvent, status: 'Published' as const };
    vi.mocked(api.listSipatEvents)
      .mockResolvedValueOnce(makePage([draftEvent]))
      .mockResolvedValueOnce(makePage([publishedEvent]));
    vi.mocked(api.publishSipatEvent).mockResolvedValue(publishedEvent);
    const user = userEvent.setup();

    render(<SipatEventsPage />);

    expect(await screen.findByText('SIPAT 2026')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    expect(api.publishSipatEvent).toHaveBeenCalledWith(draftEvent.id);
    expect(await screen.findByText('Publicada')).toBeVisible();
  });

  it('creates a SIPAT after validating the period and sends UTC instants', async () => {
    const createdEvent = { ...draftEvent, title: 'Nova SIPAT' };
    vi.mocked(api.listSipatEvents)
      .mockResolvedValueOnce(makePage([]))
      .mockResolvedValueOnce(makePage([createdEvent]));
    vi.mocked(api.createSipatEvent).mockResolvedValue(createdEvent);
    const user = userEvent.setup();

    render(<SipatEventsPage />);

    await user.type(await screen.findByLabelText('Nome do evento'), 'Nova SIPAT');
    await user.type(screen.getByLabelText('Descrição (opcional)'), 'Prevenção e saúde');
    fireEvent.change(screen.getByLabelText('Início'), {
      target: { value: '2026-11-01T09:00' },
    });
    fireEvent.change(screen.getByLabelText('Término'), {
      target: { value: '2026-11-01T10:30' },
    });
    await user.click(screen.getByRole('button', { name: 'Criar rascunho' }));

    await waitFor(() => expect(api.createSipatEvent).toHaveBeenCalledOnce());
    expect(api.createSipatEvent).toHaveBeenCalledWith({
      title: 'Nova SIPAT',
      description: 'Prevenção e saúde',
      startsAt: new Date('2026-11-01T09:00').toISOString(),
      endsAt: new Date('2026-11-01T10:30').toISOString(),
    });
    expect(await screen.findByText('SIPAT criada como rascunho.')).toBeVisible();
  });

  it('edits an existing SIPAT and refreshes the list', async () => {
    const publishedEvent = { ...draftEvent, status: 'Published' as const };
    const updatedEvent = { ...publishedEvent, title: 'SIPAT revisada' };
    vi.mocked(api.listSipatEvents)
      .mockResolvedValueOnce(makePage([publishedEvent]))
      .mockResolvedValueOnce(makePage([updatedEvent]));
    vi.mocked(api.updateSipatEvent).mockResolvedValue(updatedEvent);
    const user = userEvent.setup();

    render(<SipatEventsPage />);

    await user.click(await screen.findByRole('button', { name: 'Editar' }));
    const startInput = screen.getByLabelText('Início') as HTMLInputElement;
    const expectedStartsAt = new Date(startInput.value).toISOString();
    fireEvent.change(screen.getByLabelText('Nome do evento'), {
      target: { value: 'SIPAT revisada' },
    });
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(api.updateSipatEvent).toHaveBeenCalledWith(
      publishedEvent.id,
      expect.objectContaining({
        title: 'SIPAT revisada',
        startsAt: expectedStartsAt,
      }),
    );
    expect(await screen.findByText('SIPAT atualizada com sucesso.')).toBeVisible();
    expect(await screen.findByText('SIPAT revisada')).toBeVisible();
  });

  it('asks for confirmation before cancelling an event', async () => {
    vi.mocked(api.cancelSipatEvent).mockResolvedValue({
      ...draftEvent,
      status: 'Cancelled',
    });
    vi.mocked(api.listSipatEvents)
      .mockResolvedValueOnce(makePage([draftEvent]))
      .mockResolvedValueOnce(makePage([{ ...draftEvent, status: 'Cancelled' }]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<SipatEventsPage />);

    await user.click(await screen.findByRole('button', { name: 'Cancelar SIPAT' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Deseja cancelar a SIPAT "SIPAT 2026"? Essa ação não pode ser desfeita.',
    );
    expect(api.cancelSipatEvent).toHaveBeenCalledWith(draftEvent.id);
    expect(await screen.findByText('Cancelada')).toBeVisible();
  });
});
