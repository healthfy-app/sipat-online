import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import PlaybackQualityComparisonPage from './PlaybackQualityComparisonPage';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getPlaybackQualityComparison: vi.fn() }));

const indicator = (value: number | null, level: api.QualityLevel | null) => ({ value, level });

function indicators(overrides: Partial<api.QualityIndicators> = {}): api.QualityIndicators {
  return {
    sessions: 10, startedSessions: 9, neverStartedPercent: indicator(10, 'Attention'), stalledSessionsPercent: indicator(20, 'Attention'),
    averageStartupMilliseconds: indicator(2000, 'Attention'), stalledTimePercent: indicator(1, 'Good'), ...overrides,
  };
}

const noData = indicators({
  sessions: 0, startedSessions: 0, neverStartedPercent: indicator(null, null), stalledSessionsPercent: indicator(null, null),
  averageStartupMilliseconds: indicator(null, null), stalledTimePercent: indicator(null, null),
});

function comparison(overrides: Partial<api.PlaybackQualityComparison> = {}): api.PlaybackQualityComparison {
  return {
    from: '2026-11-01', to: '2026-11-15',
    companies: [
      { companyId: 'c1', name: 'Acme', indicators: indicators({ stalledSessionsPercent: indicator(5, 'Good'), stalledTimePercent: indicator(0.5, 'Good') }) },
      { companyId: 'c2', name: 'Beta', indicators: indicators({ stalledSessionsPercent: indicator(60, 'Poor'), stalledTimePercent: indicator(12, 'Poor') }) },
      { companyId: 'c3', name: 'Gama', indicators: noData },
      { companyId: 'c4', name: 'Delta', indicators: indicators({ stalledSessionsPercent: indicator(30, 'Attention'), stalledTimePercent: indicator(4, 'Attention') }) },
    ],
    ...overrides,
  };
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/platform/qualidade']}>
      <Routes>
        <Route element={<PlaybackQualityComparisonPage />} path="/platform/qualidade" />
        <Route element={<Where />} path="/platform/companies/:companyId/qualidade" />
      </Routes>
    </MemoryRouter>,
  );
}

const companyNames = () => screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent);

afterEach(cleanup);
beforeEach(() => vi.mocked(api.getPlaybackQualityComparison).mockReset().mockResolvedValue(comparison()));

describe('playback quality comparison page', () => {
  it('lists one row per company with the four indicators', async () => {
    renderPage();
    const beta = within((await screen.findByRole('link', { name: 'Beta' })).closest('tr')!);
    expect(beta.getByText('10,0%')).toBeVisible(); // never started
    expect(beta.getByText('60,0%')).toBeVisible();
    expect(beta.getByText('2,0 s')).toBeVisible();
    expect(beta.getByText('12,0%')).toBeVisible();
    expect(beta.getAllByText('Ruim').length).toBe(2);
    expect(beta.getByText('9')).toBeVisible(); // watched videos
    const gama = within(screen.getByRole('link', { name: 'Gama' }).closest('tr')!);
    expect(gama.getAllByText('Sem dados').length).toBe(4);
    expect(screen.getByLabelText('De')).toHaveValue('2026-11-01');
    expect(screen.getByLabelText('Até')).toHaveValue('2026-11-15');
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  it('starts sorted by stalled time, worst first, with companies without data last', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    expect(companyNames()).toEqual(['Beta', 'Delta', 'Acme', 'Gama']);
    expect(screen.getByRole('columnheader', { name: /% tempo travado/ })).toHaveAttribute('aria-sort', 'descending');
  });

  it('sorts by an indicator when its header is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    await user.click(screen.getByRole('button', { name: /% sessões com travamento/ }));
    expect(screen.getByRole('columnheader', { name: /% sessões com travamento/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /% tempo travado/ })).toHaveAttribute('aria-sort', 'none');
    expect(companyNames()).toEqual(['Beta', 'Delta', 'Acme', 'Gama']);
    await user.click(screen.getByRole('button', { name: /% sessões com travamento/ }));
    expect(screen.getByRole('columnheader', { name: /% sessões com travamento/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(companyNames()).toEqual(['Acme', 'Delta', 'Beta', 'Gama']);
  });

  it('opens the company when its row is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click((await screen.findByText('Beta')).closest('tr')!);
    expect(screen.getByTestId('where')).toHaveTextContent('/platform/companies/c2/qualidade');
  });

  it('reloads for another period', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    expect(api.getPlaybackQualityComparison).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-12-01' } });
    await waitFor(() => expect(api.getPlaybackQualityComparison).toHaveBeenLastCalledWith({ from: '2026-12-01', to: '2026-11-15' }));
  });

  it('says when no company had a SIPAT in the period', async () => {
    vi.mocked(api.getPlaybackQualityComparison).mockResolvedValue(comparison({ companies: [] }));
    renderPage();
    expect(await screen.findByText('Nenhuma empresa teve SIPAT neste período')).toBeVisible();
  });
});
