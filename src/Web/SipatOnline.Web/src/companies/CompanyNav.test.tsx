import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import CompanyNav from './CompanyNav';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getPlatformDashboard: vi.fn() }));
afterEach(cleanup);

describe('company sidebar', () => {
  it('shows only what belongs to the company and a way back to all companies', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([{ id: 'c-1', name: 'Acme', key: 'acme', isActive: true, employeeCount: 1, administratorCount: 1, totalUserCount: 2 }] as never);
    render(<MemoryRouter initialEntries={['/platform/companies/c-1/treinamentos/nova']}><CompanyNav companyId="c-1" /></MemoryRouter>);

    expect(await screen.findByText('Acme')).toBeVisible();
    expect(screen.getByRole('link', { name: /Todas as empresas/ })).toHaveAttribute('href', '/platform');
    expect(screen.getByRole('link', { name: 'Treinamentos' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Participantes' })).toHaveAttribute('href', '/platform/companies/c-1/participantes');
    expect(screen.getByRole('link', { name: 'Administradores' })).toHaveAttribute('href', '/platform/companies/c-1/administradores');
  });

  it('breaks a long company name at its dash, in lines of even length, and keeps it whole in the tooltip', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([{ id: 'c-1', name: 'Damare - Laticínios Resende', key: 'damare', isActive: true, employeeCount: 1, administratorCount: 1, totalUserCount: 2 }] as never);
    render(<MemoryRouter initialEntries={['/platform/companies/c-1/treinamentos']}><CompanyNav companyId="c-1" /></MemoryRouter>);

    const name = await screen.findByTitle('Damare - Laticínios Resende');
    // the dash stays with the word before it, so the line can only break after it: "Damare -" / "Laticínios Resende"
    expect(name.textContent).toBe('Damare - Laticínios Resende');
    expect(name).toHaveClass('text-balance');
  });

  it('links to the video quality of the company', async () => {
    vi.mocked(api.getPlatformDashboard).mockResolvedValue([] as never);
    render(<MemoryRouter initialEntries={['/platform/companies/c1/treinamentos']}><CompanyNav companyId="c1" /></MemoryRouter>);

    expect(await screen.findByRole('link', { name: 'Monitor de Desempenho' })).toHaveAttribute('href', '/platform/companies/c1/qualidade');
  });
});
