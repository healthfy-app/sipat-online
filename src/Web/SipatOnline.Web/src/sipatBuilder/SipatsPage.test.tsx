import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import { UnitScopeProvider } from '@/trainings/unitScope';
import SipatsPage from './SipatsPage';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), listSipatEvents: vi.fn(), listSipatPlans: vi.fn(), reactivateSipatEvent: vi.fn(), getCompanyRegistry: vi.fn().mockRejectedValue(new Error('sem cadastro')) }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const event = (id: string, title: string, startsAt: string, status: 'Draft' | 'Published' | 'Cancelled') =>
  ({ id, tenantId: 't', title, description: null, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 5 * 86_400_000).toISOString(), status, createdAt: startsAt });
/** A day inside the week of the trainings that start on 2026-11-09: they are in progress, which is what the list opens on. */
const duringTheWeek = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T12:00:00Z')); };

describe('SIPATs of a company', () => {
  it('lists them by year, newest first, with status and the days built', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 3,
      items: [
        event('a', 'SIPAT 2025', '2025-11-10T00:00:00Z', 'Cancelled'),
        event('b', 'SIPAT 2026', '2026-11-09T00:00:00Z', 'Published'),
        event('c', 'SIPAT 2027', '2027-03-01T00:00:00Z', 'Draft'),
      ],
    });
    vi.mocked(api.listSipatPlans).mockResolvedValue([{ sipatEventId: 'b', days: 5, videos: 18 }]);
    render(<MemoryRouter><SipatsPage basePath="/admin/sipats" /></MemoryRouter>);

    // the list opens on all of them, so a new draft shows up right away
    expect(await screen.findByRole('link', { name: 'Abrir SIPAT 2026' })).toBeVisible();

    const first = await screen.findByRole('region', { name: 'Treinamentos de 2027' });
    const second = screen.getByRole('region', { name: 'Treinamentos de 2026' });
    const third = screen.getByRole('region', { name: 'Treinamentos de 2025' });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(second).getByText('Em andamento')).toBeVisible();
    expect(within(second).getByText('5 dias · 18 vídeos')).toBeVisible();
    expect(within(first).getByText('Rascunho')).toBeVisible();
    expect(within(first).getByText('Dias ainda não montados')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir SIPAT 2026' })).toHaveAttribute('href', '/admin/sipats/b');
    expect(screen.getByRole('link', { name: 'Novo treinamento' })).toHaveAttribute('href', '/admin/sipats/nova');
  });

  it('says on the card who the training is for, when it is not the whole company', async () => {
    duringTheWeek();
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 2,
      items: [event('a', 'LGPD', '2026-11-09T00:00:00Z', 'Published'), event('b', 'SIPAT geral', '2026-11-09T00:00:00Z', 'Published')],
    });
    vi.mocked(api.listSipatPlans).mockResolvedValue([
      { sipatEventId: 'a', days: 1, videos: 2, targets: [{ unitId: 'minas', sectorId: 'hr' }, { unitId: 'sp', sectorId: 'it' }] },
      { sipatEventId: 'b', days: 1, videos: 2, targets: [] },
    ]);
    vi.mocked(api.getCompanyRegistry).mockResolvedValue({
      units: [{ id: 'minas', name: 'Minas Gerais', isActive: true, peopleCount: 3 }, { id: 'sp', name: 'São Paulo', isActive: true, peopleCount: 2 }],
      sectors: [{ id: 'hr', name: 'RH', isActive: true, peopleCount: 1 }, { id: 'it', name: 'TI', isActive: true, peopleCount: 1 }],
      rules: { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false },
    });
    render(<MemoryRouter><SipatsPage basePath="/admin/treinamentos" /></MemoryRouter>);

    expect(await screen.findByText('Minas Gerais › RH · São Paulo › TI')).toBeVisible();
    expect(screen.queryByText('Toda a empresa')).not.toBeInTheDocument();
  });

  it('with a unit chosen at the top, shows its trainings and the ones of the whole company', async () => {
    duringTheWeek();
    localStorage.setItem('sipat:unit:acme', 'sp');
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 3,
      items: [event('a', 'SIPAT Minas', '2026-11-09T00:00:00Z', 'Published'), event('b', 'SIPAT geral', '2026-11-09T00:00:00Z', 'Published'), event('c', 'SIPAT São Paulo', '2026-11-09T00:00:00Z', 'Published')],
    });
    vi.mocked(api.listSipatPlans).mockResolvedValue([
      { sipatEventId: 'a', days: 1, videos: 2, targets: [{ unitId: 'minas', sectorId: null }] },
      { sipatEventId: 'b', days: 1, videos: 2, targets: [] },
      { sipatEventId: 'c', days: 1, videos: 2, targets: [{ unitId: 'sp', sectorId: 'it' }] },
    ]);
    vi.mocked(api.getCompanyRegistry).mockResolvedValue({
      units: [{ id: 'minas', name: 'Minas Gerais', isActive: true, peopleCount: 3 }, { id: 'sp', name: 'São Paulo', isActive: true, peopleCount: 2 }],
      sectors: [{ id: 'it', name: 'TI', isActive: true, peopleCount: 1 }],
      rules: { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false },
    });
    render(<MemoryRouter><UnitScopeProvider enabled scopeKey="acme"><SipatsPage basePath="/admin/treinamentos" /></UnitScopeProvider></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Abrir SIPAT geral' })).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Abrir SIPAT Minas' })).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Abrir SIPAT São Paulo' })).toBeVisible();
    localStorage.clear();
  });

  it('shows a cancelled SIPAT disabled, with a way to bring it back as a draft', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 1, items: [event('a', 'SIPAT 2026', '2026-11-09T00:00:00Z', 'Cancelled')],
    });
    vi.mocked(api.listSipatPlans).mockResolvedValue([]);
    vi.mocked(api.reactivateSipatEvent).mockResolvedValue(event('a', 'SIPAT 2026', '2026-11-09T00:00:00Z', 'Draft'));
    render(<MemoryRouter><SipatsPage basePath="/admin/sipats" /></MemoryRouter>);

    // the list opens on every training: an ended one is there, with its actions
    expect(await screen.findByRole('link', { name: 'Abrir SIPAT 2026' })).toHaveAttribute('href', '/admin/sipats/a');

    await user.click(screen.getByRole('button', { name: 'Mais ações de SIPAT 2026' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reativar' }));
    expect(api.reactivateSipatEvent).toHaveBeenCalledWith('a');
    expect(await screen.findByRole('status')).toHaveTextContent('voltou como rascunho');
  });
});
