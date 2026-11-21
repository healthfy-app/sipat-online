import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useRef } from 'react';
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
  const location = useLocation();
  const visits = useRef(new Set<string>());
  visits.current.add(location.key);
  return <><p data-testid="where">{location.pathname}</p><p data-testid="visits">{visits.current.size}</p></>;
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

  it('opens the company when a non-link cell of its row is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    const row = (await screen.findByRole('link', { name: 'Beta' })).closest('tr')!;
    await user.click(within(row).getAllByRole('cell')[1]);
    expect(screen.getByTestId('where')).toHaveTextContent('/platform/companies/c2/qualidade');
    expect(screen.getByTestId('visits')).toHaveTextContent('1');
  });

  it('navigates exactly once when the company link is clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('link', { name: 'Beta' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/platform/companies/c2/qualidade');
    expect(screen.getByTestId('visits')).toHaveTextContent('1');
  });

  it('reloads for another period', async () => {
    vi.mocked(api.getPlaybackQualityComparison).mockResolvedValue(comparison({ to: '2026-12-31' }));
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    expect(api.getPlaybackQualityComparison).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-12-01' } });
    await waitFor(() => expect(api.getPlaybackQualityComparison).toHaveBeenLastCalledWith({ from: '2026-12-01', to: '2026-12-31' }));
  });

  it('says when no company had a SIPAT in the period', async () => {
    vi.mocked(api.getPlaybackQualityComparison).mockResolvedValue(comparison({ companies: [] }));
    renderPage();
    expect(await screen.findByText('Nenhuma empresa teve treinamento neste período')).toBeVisible();
  });

  it('refuses a start date after the end date without calling the API', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockClear();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-20' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('A data inicial deve ser anterior à final.');
    expect(api.getPlaybackQualityComparison).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-10' } });
    expect(await screen.findByRole('link', { name: 'Beta' })).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a period longer than one year without calling the API', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockClear();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2025-01-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha um período de até um ano.');
    expect(api.getPlaybackQualityComparison).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument();
  });

  it('accepts a period of exactly 366 days, counting both ends, and sends the request', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockClear();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2025-11-15' } });
    await waitFor(() => expect(api.getPlaybackQualityComparison).toHaveBeenCalledWith({ from: '2025-11-15', to: '2026-11-15' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses a period of 367 days', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockClear();
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2025-11-14' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha um período de até um ano.');
    expect(api.getPlaybackQualityComparison).not.toHaveBeenCalled();
  });

  it('does not keep showing the previous period when reloading fails', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockImplementationOnce(() => Promise.reject(new Error('Falha ao carregar.')));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar.');
    expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument();
  });

  it('marks the table as busy while another period loads', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Beta' });
    vi.mocked(api.getPlaybackQualityComparison).mockReturnValueOnce(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } });
    await waitFor(() => expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true'));
  });

  it('shows the error when the first load fails', async () => {
    vi.mocked(api.getPlaybackQualityComparison).mockImplementationOnce(() => Promise.reject(new Error('Sem conexão.')));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
