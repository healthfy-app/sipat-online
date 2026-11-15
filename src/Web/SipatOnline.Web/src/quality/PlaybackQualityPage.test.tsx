import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import PlaybackQualityPage from './PlaybackQualityPage';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getCompanyPlaybackQuality: vi.fn() }));

const indicator = (value: number | null, level: api.QualityLevel | null) => ({ value, level });
const none = indicator(null, null);

function indicators(overrides: Partial<api.QualityIndicators> = {}): api.QualityIndicators {
  return {
    sessions: 4, startedSessions: 3, neverStartedPercent: indicator(25, 'Poor'), stalledSessionsPercent: indicator(66.666, 'Poor'),
    averageStartupMilliseconds: indicator(2000, 'Attention'), stalledTimePercent: indicator(0.5, 'Good'), ...overrides,
  };
}

function quality(overrides: Partial<api.CompanyPlaybackQuality> = {}): api.CompanyPlaybackQuality {
  return {
    companyId: 'c1', companyName: 'Acme', companyKey: 'acme',
    sipats: [{ id: 's1', title: 'SIPAT 2026', startsAt: '2026-11-10T00:00:00Z' }, { id: 's2', title: 'SIPAT 2025', startsAt: '2025-11-10T00:00:00Z' }],
    sipatId: 's1', day: null, days: [1, 2], indicators: indicators(),
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, stalledSessions: 0 })),
    byConnection: [{ key: '4g', indicators: indicators() }], byDevice: [{ key: 'phone', indicators: indicators() }],
    byQuality: [{ key: 'single', indicators: indicators() }], byDay: [{ key: '1', indicators: indicators() }],
    videos: [{ videoId: 'v1', title: 'Uso de EPI', indicators: indicators() }],
    people: [{ participantId: 'p1', displayName: 'João Silva', loginIdentifier: 'joao.silva', sessions: 3, neverStarted: 2, stalledTimePercent: 0 }],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/platform/companies/c1/qualidade']}>
      <Routes><Route element={<PlaybackQualityPage />} path="/platform/companies/:companyId/qualidade" /></Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);
beforeEach(() => vi.mocked(api.getCompanyPlaybackQuality).mockReset().mockResolvedValue(quality()));

describe('playback quality page', () => {
  it('shows the four indicators with their traffic lights', async () => {
    renderPage();
    const stalled = within(await screen.findByRole('group', { name: 'Sessões com travamento' }));
    expect(stalled.getByText('66,7%')).toBeVisible();
    expect(stalled.getByText('Ruim')).toBeVisible();
    const startup = within(screen.getByRole('group', { name: 'Tempo médio para começar' }));
    expect(startup.getByText('2,0 s')).toBeVisible();
    expect(startup.getByText('Atenção')).toBeVisible();
    const watched = within(screen.getByRole('group', { name: 'Vídeos assistidos' }));
    expect(watched.getByText('3')).toBeVisible();
    expect(watched.getByText('25,0% não começaram')).toBeVisible();
    expect(within(screen.getByRole('group', { name: 'Tempo travado' })).getByText('Bom')).toBeVisible();
  });

  it('explains what will appear when the SIPAT has no data yet', async () => {
    vi.mocked(api.getCompanyPlaybackQuality).mockResolvedValue(quality({
      indicators: indicators({ sessions: 0, startedSessions: 0, neverStartedPercent: none, stalledSessionsPercent: none, averageStartupMilliseconds: none, stalledTimePercent: none }),
    }));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Ainda não há dados de vídeo' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'SIPAT' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Dia' })).toBeVisible();
  });

  it('reloads for the chosen SIPAT and day', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'SIPAT' }), 's2');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Dia' }), '2');

    await waitFor(() => expect(api.getCompanyPlaybackQuality).toHaveBeenLastCalledWith('c1', { sipatId: 's2', day: 2 }));
  });

  it('offers the one-page summary as the main action', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Baixar resumo' }))
      .toHaveAttribute('href', '/api/platform/companies/c1/playback-quality/summary.pdf?sipatId=s1');
  });

  it('links each person with a problem to their progress', async () => {
    renderPage();
    expect(await screen.findByText('2 não começaram')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver progresso' })).toHaveAttribute('href', '/platform/companies/c1/participantes?busca=joao.silva');
  });
});
