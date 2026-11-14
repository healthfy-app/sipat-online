import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import SipatsPage from './SipatsPage';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), listSipatEvents: vi.fn(), listSipatPlans: vi.fn(), reactivateSipatEvent: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); });

const event = (id: string, title: string, startsAt: string, status: 'Draft' | 'Published' | 'Cancelled') =>
  ({ id, tenantId: 't', title, description: null, startsAt, endsAt: new Date(new Date(startsAt).getTime() + 5 * 86_400_000).toISOString(), status, createdAt: startsAt });

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

    const first = await screen.findByRole('region', { name: 'SIPATs de 2027' });
    const second = screen.getByRole('region', { name: 'SIPATs de 2026' });
    const third = screen.getByRole('region', { name: 'SIPATs de 2025' });
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(second).getByText('Em andamento')).toBeVisible();
    expect(within(second).getByText('5 dias · 18 vídeos')).toBeVisible();
    expect(within(first).getByText('Rascunho')).toBeVisible();
    expect(within(first).getByText('Dias ainda não montados')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir SIPAT 2026' })).toHaveAttribute('href', '/admin/sipats/b');
    expect(screen.getByRole('link', { name: 'Nova SIPAT' })).toHaveAttribute('href', '/admin/sipats/nova');
  });

  it('shows a cancelled SIPAT disabled, with a way to bring it back as a draft', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listSipatEvents).mockResolvedValue({
      offset: 0, limit: 100, totalCount: 1, items: [event('a', 'SIPAT 2026', '2026-11-09T00:00:00Z', 'Cancelled')],
    });
    vi.mocked(api.listSipatPlans).mockResolvedValue([]);
    vi.mocked(api.reactivateSipatEvent).mockResolvedValue(event('a', 'SIPAT 2026', '2026-11-09T00:00:00Z', 'Draft'));
    render(<MemoryRouter><SipatsPage basePath="/admin/sipats" /></MemoryRouter>);

    expect(await screen.findByRole('group', { name: 'SIPAT 2026 (cancelada)' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: 'Abrir SIPAT 2026' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reativar' }));
    expect(api.reactivateSipatEvent).toHaveBeenCalledWith('a');
    expect(await screen.findByRole('link', { name: 'Abrir SIPAT 2026' })).toHaveAttribute('href', '/admin/sipats/a');
    expect(screen.getByRole('status')).toHaveTextContent('voltou como rascunho');
  });
});
