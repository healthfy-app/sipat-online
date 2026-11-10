import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlatformHomePage from './PlatformHomePage';
import * as api from './api';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getPlatformDashboard: vi.fn(),
  listPlatformCourses: vi.fn(),
}));

afterEach(cleanup);

describe('Platform home', () => {
  it('lists companies and trainings and filters both by the search term', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([
      { id: 't1', key: 'acme', name: 'Acme', isActive: true, employeeCount: 10, administratorCount: 1, totalUserCount: 11 },
      { id: 't2', key: 'beta', name: 'Beta', isActive: false, employeeCount: 3, administratorCount: 1, totalUserCount: 4 },
    ] as api.PlatformCompanyOverview[]);
    vi.mocked(api.listPlatformCourses).mockResolvedValue([
      { id: 'c1', title: 'SIPAT Acme 2026', description: null, createdAt: '', status: 'Published', gamificationEnabled: true, videos: [] },
      { id: 'c2', title: 'SIPAT Beta 2026', description: null, createdAt: '', status: 'Draft', gamificationEnabled: false, videos: [] },
    ]);
    const user = userEvent.setup();
    render(<MemoryRouter><PlatformHomePage /></MemoryRouter>);

    expect(await screen.findByText('SIPAT Beta 2026')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Buscar empresa ou treinamento'), 'acme');

    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('SIPAT Beta 2026')).not.toBeInTheDocument();
    expect(screen.getByText('SIPAT Acme 2026')).toBeInTheDocument();
  });
});
