import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import { MemoryRouter } from 'react-router-dom';
import { UnitBar, UnitScopeProvider, UnitSwitcher, inUnit, trainingInUnit, useUnitScope } from './unitScope';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getCompanyRegistry: vi.fn() }));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const unit = (id: string, name: string, isActive = true) => ({ id, name, isActive, peopleCount: 1 });
const company = (...units: ReturnType<typeof unit>[]): api.CompanyRegistry => ({ units, sectors: [], rules });

function Probe() {
  const scope = useUnitScope();
  return <p data-testid="scope">{scope.unit?.name ?? 'todas'}</p>;
}
const mount = (scopeKey = 'acme') => render(<UnitScopeProvider enabled scopeKey={scopeKey}><UnitSwitcher /><Probe /></UnitScopeProvider>);

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('the unit chosen at the top', () => {
  it('is always there for a company: with one unit, and with none, where it leads to making the first', async () => {
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('old', 'Antiga', false)));
    render(<MemoryRouter><UnitScopeProvider enabled scopeKey="acme"><UnitBar manageHref="/admin/cadastro" /><Probe /></UnitScopeProvider></MemoryRouter>);
    expect(await screen.findByRole('radio', { name: 'Todas' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'São Paulo' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Antiga' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Unidades e setores' })).toHaveAttribute('href', '/admin/cadastro');
    cleanup();

    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company());
    render(<MemoryRouter><UnitScopeProvider enabled scopeKey="acme"><UnitBar manageHref="/admin/cadastro" /><Probe /></UnitScopeProvider></MemoryRouter>);
    expect(await screen.findByRole('radio', { name: 'Todas' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Criar unidades' })).toHaveAttribute('href', '/admin/cadastro');
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
  });

  it('starts on "Todas", which shows everything, and switches at a tap', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais')));
    mount();
    expect(await screen.findByRole('radio', { name: 'Todas' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Minas Gerais' }));
    expect(screen.getByRole('radio', { name: 'Minas Gerais' })).toBeChecked();
    expect(screen.getByTestId('scope')).toHaveTextContent('Minas Gerais');
    expect(localStorage.getItem('sipat:unit:acme')).toBe('minas');
    await user.click(screen.getByRole('radio', { name: 'Todas' }));
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    expect(localStorage.getItem('sipat:unit:acme')).toBeNull();
  });

  it('remembers the unit of each company apart', async () => {
    localStorage.setItem('sipat:unit:acme', 'sp');
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais')));
    mount('acme');
    expect(await screen.findByRole('radio', { name: 'São Paulo' })).toBeChecked();
    cleanup();
    mount('other');
    expect(await screen.findByRole('radio', { name: 'Todas' })).toBeChecked();
  });

  it('goes back to "Todas" when the unit remembered is gone or put away', async () => {
    localStorage.setItem('sipat:unit:acme', 'old');
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais'), unit('old', 'Antiga', false)));
    mount();
    expect(await screen.findByRole('radio', { name: 'Todas' })).toBeChecked();
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    await waitFor(() => expect(localStorage.getItem('sipat:unit:acme')).toBeNull());
  });

  it('becomes one button that opens the list when the units are many', async () => {
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(...['A', 'B', 'C', 'D', 'E', 'F'].map(name => unit(name, `Unidade ${name}`))));
    mount();
    expect(await screen.findByRole('button', { name: 'Unidade: Todas as unidades' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Unidade A' })).not.toBeInTheDocument();
  });

  it('is everything, with nothing to show, where no company is being looked at', () => {
    render(<><UnitSwitcher /><Probe /></>);
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});

describe('what belongs to a unit', () => {
  it('a training of the whole company or of every unit shows in any unit; one of another unit does not', () => {
    expect(trainingInUnit({ targets: [] }, 'sp')).toBe(true);
    expect(trainingInUnit(undefined, 'sp')).toBe(true);
    expect(trainingInUnit({ targets: [{ unitId: 'minas', sectorId: null }] }, 'sp')).toBe(false);
    expect(trainingInUnit({ targets: [{ unitId: 'minas', sectorId: 'hr' }, { unitId: 'sp', sectorId: 'it' }] }, 'sp')).toBe(true);
    expect(trainingInUnit({ targets: [{ unitId: null, sectorId: 'hr' }] }, 'sp')).toBe(true);
    expect(trainingInUnit({ targets: [{ unitId: 'minas', sectorId: null }] }, null)).toBe(true);
  });

  it('a person is of the unit chosen, and everyone is of "Todas"', () => {
    const profiles = new Map([['lucia', { unitId: 'minas' }], ['paula', { unitId: 'sp' }], ['caio', { unitId: null }]]);
    expect(['lucia', 'paula', 'caio', 'unknown'].filter(inUnit(profiles, 'minas'))).toEqual(['lucia']);
    expect(['lucia', 'paula', 'caio', 'unknown'].filter(inUnit(profiles, null))).toEqual(['lucia', 'paula', 'caio', 'unknown']);
  });
});
