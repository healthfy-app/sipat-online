import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import { MemoryRouter } from 'react-router-dom';
import { UnitMenu, UnitScopeProvider, inUnit, trainingInUnit, useUnitScope } from './unitScope';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getCompanyRegistry: vi.fn() }));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const unit = (id: string, name: string, isActive = true) => ({ id, name, isActive, peopleCount: 1 });
const company = (...units: ReturnType<typeof unit>[]): api.CompanyRegistry => ({ units, sectors: [], rules });

function Probe() {
  const scope = useUnitScope();
  return <p data-testid="scope">{scope.unit?.name ?? 'todas'}</p>;
}
const mount = (scopeKey = 'acme', manageHref?: string) =>
  render(<MemoryRouter><UnitScopeProvider enabled scopeKey={scopeKey}><UnitMenu manageHref={manageHref} /><Probe /></UnitScopeProvider></MemoryRouter>);
const open = async (user: ReturnType<typeof userEvent.setup>, name = 'Unidade: Todas as unidades') => user.click(await screen.findByRole('button', { name }));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('the unit chosen in the side bar', () => {
  it('starts on every unit, which shows everything, and switches from the list', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais'), unit('old', 'Antiga', false)));
    mount();
    await open(user);
    expect(screen.queryByRole('menuitem', { name: 'Antiga' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Minas Gerais' }));
    expect(screen.getByTestId('scope')).toHaveTextContent('Minas Gerais');
    expect(localStorage.getItem('sipat:unit:acme')).toBe('minas');
    await open(user, 'Unidade: Minas Gerais');
    await user.click(screen.getByRole('menuitem', { name: 'Todas as unidades' }));
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    expect(localStorage.getItem('sipat:unit:acme')).toBeNull();
  });

  it('is there for a company with one unit, and with none, where it leads to making the first', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo')));
    mount('acme', '/admin/cadastro');
    await open(user);
    expect(screen.getByRole('menuitem', { name: 'São Paulo' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Unidades e setores' })).toHaveAttribute('href', '/admin/cadastro');
    cleanup();

    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company());
    mount('acme', '/admin/cadastro');
    await open(user);
    expect(screen.getByText('A empresa ainda não tem unidades.')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Criar unidades' })).toHaveAttribute('href', '/admin/cadastro');
  });

  it('keeps a very long name whole for whoever needs to read it', async () => {
    const user = userEvent.setup();
    const long = 'Centro de Distribuição e Logística Integrada do Triângulo Mineiro e Alto Paranaíba';
    localStorage.setItem('sipat:unit:acme', 'cd');
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('cd', long), unit('sp', 'São Paulo')));
    mount();
    // cut in the narrow button, but its name and its tooltip say it whole
    const button = await screen.findByRole('button', { name: `Unidade: ${long}` });
    expect(button).toHaveAttribute('title', long);
    await user.click(button);
    expect(screen.getByRole('menuitem', { name: long })).toBeInTheDocument();
  });

  it('brings a field to search when the units are many', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(...['Belo Horizonte', 'Betim', 'Campinas', 'Contagem', 'Curitiba', 'Recife', 'Santos', 'Uberlândia'].map(name => unit(name, name))));
    mount();
    await open(user);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar unidade' }), 'be');
    expect(screen.getByRole('menuitem', { name: 'Belo Horizonte' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Betim' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Uberlândia' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Recife' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Betim' }));
    expect(screen.getByTestId('scope')).toHaveTextContent('Betim');
  });

  it('has no search for a handful of units', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais')));
    mount();
    await open(user);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('remembers the unit of each company apart', async () => {
    localStorage.setItem('sipat:unit:acme', 'sp');
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais')));
    mount('acme');
    expect(await screen.findByRole('button', { name: 'Unidade: São Paulo' })).toBeVisible();
    cleanup();
    mount('other');
    expect(await screen.findByRole('button', { name: 'Unidade: Todas as unidades' })).toBeVisible();
  });

  it('goes back to every unit when the one remembered is gone or put away', async () => {
    localStorage.setItem('sipat:unit:acme', 'old');
    vi.mocked(api.getCompanyRegistry).mockResolvedValue(company(unit('sp', 'São Paulo'), unit('minas', 'Minas Gerais'), unit('old', 'Antiga', false)));
    mount();
    expect(await screen.findByRole('button', { name: 'Unidade: Todas as unidades' })).toBeVisible();
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    await waitFor(() => expect(localStorage.getItem('sipat:unit:acme')).toBeNull());
  });

  it('is everything, with nothing to show, where no company is being looked at', () => {
    render(<MemoryRouter><UnitMenu /><Probe /></MemoryRouter>);
    expect(screen.getByTestId('scope')).toHaveTextContent('todas');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
