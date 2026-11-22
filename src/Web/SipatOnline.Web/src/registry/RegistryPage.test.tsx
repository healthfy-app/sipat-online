import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import RegistryPage from './RegistryPage';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  getCompanyRegistry: vi.fn(), addRegistryItems: vi.fn(), updateRegistryItem: vi.fn(), saveProfileRules: vi.fn(),
}));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const registry = {
  units: [{ id: 'u-1', name: 'Matriz', isActive: true, peopleCount: 3 }],
  sectors: [{ id: 's-1', name: 'Produção', isActive: true, peopleCount: 1 }],
  rules,
};

beforeEach(() => { vi.mocked(api.getCompanyRegistry).mockResolvedValue(registry); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('registry page', () => {
  it('pasting three lines adds the three names, without the empty lines', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addRegistryItems).mockResolvedValue(registry);
    render(<RegistryPage />);
    const units = await screen.findByRole('region', { name: 'Unidades' });
    await user.click(within(units).getByRole('textbox', { name: 'Cole um nome por linha' }));
    await user.paste('Filial Norte\n\n  Filial Sul \n\nFilial Leste\n');
    await user.click(within(units).getByRole('button', { name: 'Adicionar' }));
    expect(api.addRegistryItems).toHaveBeenCalledWith('units', ['Filial Norte', 'Filial Sul', 'Filial Leste']);
  });

  it('deactivating calls the API with isActive false and shows "Desativado"', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateRegistryItem).mockResolvedValue({ ...registry.sectors[0], isActive: false });
    render(<RegistryPage />);
    const sectors = await screen.findByRole('region', { name: 'Setores' });
    await user.click(within(sectors).getByRole('button', { name: 'Ações de Produção' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    expect(api.updateRegistryItem).toHaveBeenCalledWith('sectors', 's-1', { isActive: false });
    expect(await within(sectors).findByText('Desativado')).toBeVisible();
  });

  it('renaming is inline and saves the new name', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateRegistryItem).mockResolvedValue({ ...registry.units[0], name: 'Sede' });
    render(<RegistryPage />);
    const units = await screen.findByRole('region', { name: 'Unidades' });
    await user.click(within(units).getByRole('button', { name: 'Ações de Matriz' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const input = within(units).getByRole('textbox', { name: 'Novo nome' });
    await user.clear(input);
    await user.type(input, 'Sede');
    await user.click(within(units).getByRole('button', { name: 'Salvar' }));
    expect(api.updateRegistryItem).toHaveBeenCalledWith('units', 'u-1', { name: 'Sede' });
    expect(await within(units).findByText('Sede')).toBeVisible();
  });

  it('checking Setor saves the rules with requireSector true', async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveProfileRules).mockResolvedValue({ ...rules, requireSector: true });
    render(<RegistryPage />);
    await user.click(await screen.findByRole('checkbox', { name: 'Setor' }));
    expect(api.saveProfileRules).toHaveBeenCalledWith({ ...rules, requireSector: true });
    expect(await screen.findByText('Salvo.')).toBeVisible();
  });
});
