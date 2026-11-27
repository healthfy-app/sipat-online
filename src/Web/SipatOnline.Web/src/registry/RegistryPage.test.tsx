import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import RegistryPage from './RegistryPage';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  getCompanyRegistry: vi.fn(), addRegistryItems: vi.fn(), updateRegistryItem: vi.fn(), saveProfileRules: vi.fn(),
  addUnitSectors: vi.fn(), removeUnitSector: vi.fn(),
}));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const registry: api.CompanyRegistry = {
  units: [{ id: 'u-1', name: 'Minas Gerais', isActive: true, peopleCount: 3 }, { id: 'u-2', name: 'São Paulo', isActive: true, peopleCount: 0 }],
  sectors: [{ id: 's-1', name: 'RH', isActive: true, peopleCount: 2 }, { id: 's-2', name: 'TI', isActive: true, peopleCount: 0 }],
  rules,
  unitSectors: [{ unitId: 'u-1', sectorId: 's-1', peopleCount: 2 }, { unitId: 'u-1', sectorId: 's-2', peopleCount: 0 }],
};

beforeEach(() => { vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('registry page', () => {
  it('shows each unit with its own sectors inside, and how many people each has', async () => {
    render(<RegistryPage />);
    const minas = within(await screen.findByRole('list', { name: 'Setores de Minas Gerais' }));
    expect(minas.getByText('RH')).toBeVisible();
    expect(minas.getByText('TI')).toBeVisible();
    expect(within(screen.getByRole('list', { name: 'Setores de São Paulo' })).getByText('Sem setores ainda.')).toBeVisible();
    expect(within(screen.getByRole('listitem', { name: 'Minas Gerais' })).getByText('3 pessoas')).toBeVisible();
  });

  it('makes a unit by typing its name and pressing Enter', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addRegistryItems).mockResolvedValue(registry);
    render(<RegistryPage />);
    await user.type(await screen.findByRole('textbox', { name: 'Nova unidade' }), 'Rio de Janeiro{Enter}');
    expect(api.addRegistryItems).toHaveBeenCalledWith('units', ['Rio de Janeiro']);
  });

  it('makes sectors inside a unit, several at once when pasted from a sheet', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addUnitSectors).mockResolvedValue(registry);
    render(<RegistryPage />);
    // the field offers the company's sector names as it is typed in, so it is a combobox
    await user.click(await screen.findByLabelText('Novo setor em São Paulo'));
    await user.paste('RH\nProdução\n\n Manutenção \n');
    await user.keyboard('{Enter}');
    expect(api.addUnitSectors).toHaveBeenCalledWith('u-2', ['RH', 'Produção', 'Manutenção']);
  });

  it('takes a sector out of a unit only when nobody of the unit is in it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.removeUnitSector).mockResolvedValue({ ...registry, unitSectors: [registry.unitSectors![0]] });
    render(<RegistryPage />);
    expect(await screen.findByRole('button', { name: 'Tirar RH de Minas Gerais' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Tirar TI de Minas Gerais' }));
    expect(api.removeUnitSector).toHaveBeenCalledWith('u-1', 's-2');
    expect(screen.queryByRole('button', { name: 'Tirar TI de Minas Gerais' })).not.toBeInTheDocument();
  });

  it('renaming a unit is inline and saves the new name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateRegistryItem).mockResolvedValue({ ...registry.units[0], name: 'Sede' });
    render(<RegistryPage />);
    await user.click(await screen.findByRole('button', { name: 'Ações de Minas Gerais' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const input = screen.getByRole('textbox', { name: 'Novo nome' });
    await user.clear(input);
    await user.type(input, 'Sede');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.updateRegistryItem).toHaveBeenCalledWith('units', 'u-1', { name: 'Sede' });
    expect(await screen.findByRole('heading', { name: 'Sede' })).toBeVisible();
  });

  it('a sector name is one for the whole company: deactivating it calls the API and shows "Desativado"', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateRegistryItem).mockResolvedValue({ ...registry.sectors[0], isActive: false });
    render(<RegistryPage />);
    const names = await screen.findByRole('region', { name: 'Nomes dos setores' });
    expect(within(names).queryByRole('textbox', { name: 'Cole um nome por linha' })).not.toBeInTheDocument();
    await user.click(within(names).getByRole('button', { name: 'Ações de RH' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    expect(api.updateRegistryItem).toHaveBeenCalledWith('sectors', 's-1', { isActive: false });
    expect(await within(names).findByText('Desativado')).toBeVisible();
  });

  it('asks for no required fields: a person is never held back for a missing one', async () => {
    render(<RegistryPage />);
    await screen.findByRole('heading', { name: 'Cadastro' });
    expect(screen.queryByText('Campos obrigatórios')).not.toBeInTheDocument();
  });
});
