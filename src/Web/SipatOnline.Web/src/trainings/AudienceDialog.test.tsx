import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import AudienceDialog from './AudienceDialog';
import { audienceLabel } from './audienceLabel';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  saveTrainingAudience: vi.fn(), countAudience: vi.fn(), addRegistryItems: vi.fn(),
}));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const registry: api.CompanyRegistry = {
  units: [
    { id: 'minas', name: 'Minas Gerais', isActive: true, peopleCount: 3 },
    { id: 'sp', name: 'São Paulo', isActive: true, peopleCount: 2 },
    { id: 'old', name: 'Filial antiga', isActive: false, peopleCount: 0 },
    { id: 'closed', name: 'Unidade fechada', isActive: false, peopleCount: 1 },
  ],
  sectors: [
    { id: 'hr', name: 'RH', isActive: true, peopleCount: 3 },
    { id: 'it', name: 'TI', isActive: true, peopleCount: 2 },
  ],
  rules,
};
const person = (id: string, unitId: string | null, sectorId: string | null): api.ParticipantProfile =>
  ({ id, registrationNumber: null, email: null, phone: null, unitId, sectorId });
const profiles = [person('lucia', 'minas', 'hr'), person('marcos', 'minas', 'it'), person('nina', 'minas', 'hr'), person('paula', 'sp', 'it'), person('rita', 'sp', 'hr')];

const open = (targets: api.AudienceTarget[] = [], onSaved = vi.fn()) => {
  render(<AudienceDialog audience={{ targets }} onClose={vi.fn()} onSaved={onSaved} profiles={profiles} registry={registry} sipatId="t1" />);
  return onSaved;
};

beforeEach(() => {
  vi.mocked(api.countAudience).mockResolvedValue({ receiving: 3, leftOutUnplaced: 1 });
  vi.mocked(api.saveTrainingAudience).mockImplementation(async (_id, audience) => audience);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('who a training is for', () => {
  it('opens on the whole company when nothing is marked', () => {
    open();
    expect(screen.getByRole('radio', { name: 'Toda a empresa' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /Minas Gerais/ })).not.toBeInTheDocument();
  });

  it('marks a whole unit and saves it as one group', async () => {
    const user = userEvent.setup();
    const onSaved = open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.click(screen.getByRole('checkbox', { name: /Minas Gerais/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.saveTrainingAudience).toHaveBeenCalledWith('t1', { targets: [{ unitId: 'minas', sectorId: null }] });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ targets: [{ unitId: 'minas', sectorId: null }] }));
  });

  it('narrows a unit to its sectors: the HR of Minas and the IT of São Paulo', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.click(screen.getByRole('checkbox', { name: /Minas Gerais/ }));
    await user.click(screen.getByRole('checkbox', { name: /São Paulo/ }));
    const minas = screen.getByRole('group', { name: 'Setores de Minas Gerais' });
    // each sector says how many people of that unit are in it
    expect(within(minas).getByRole('button', { name: 'RH, 2 pessoas' })).toBeVisible();
    expect(within(minas).getByRole('button', { name: 'Toda a unidade' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(minas).getByRole('button', { name: 'RH, 2 pessoas' }));
    expect(within(minas).getByRole('button', { name: 'Toda a unidade' })).toHaveAttribute('aria-pressed', 'false');
    await user.click(within(screen.getByRole('group', { name: 'Setores de São Paulo' })).getByRole('button', { name: 'TI, 1 pessoa' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.saveTrainingAudience).toHaveBeenCalledWith('t1', { targets: [{ unitId: 'minas', sectorId: 'hr' }, { unitId: 'sp', sectorId: 'it' }] });
  });

  it('goes back to the whole unit when its last sector is unmarked', async () => {
    const user = userEvent.setup();
    open([{ unitId: 'minas', sectorId: 'hr' }]);
    const minas = screen.getByRole('group', { name: 'Setores de Minas Gerais' });
    expect(within(minas).getByRole('button', { name: 'RH, 2 pessoas' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(minas).getByRole('button', { name: 'RH, 2 pessoas' }));
    expect(within(minas).getByRole('button', { name: 'Toda a unidade' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks a sector in every unit', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.click(within(screen.getByRole('group', { name: 'Em todas as unidades' })).getByRole('button', { name: 'RH, 3 pessoas' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.saveTrainingAudience).toHaveBeenCalledWith('t1', { targets: [{ unitId: null, sectorId: 'hr' }] });
  });

  it('says how many people will receive it, and how many are left out for having no place', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.click(screen.getByRole('checkbox', { name: /Minas Gerais/ }));
    expect(await screen.findByText('3 pessoas vão receber')).toBeVisible();
    expect(screen.getByText(/1 pessoa sem unidade ou setor não vai receber/)).toBeVisible();
    expect(api.countAudience).toHaveBeenLastCalledWith({ targets: [{ unitId: 'minas', sectorId: null }] });
  });

  it('shows a unit put away only while the training still names it', () => {
    open([{ unitId: 'closed', sectorId: null }]);
    expect(screen.getByRole('checkbox', { name: /Unidade fechada/ })).toBeChecked();
    expect(screen.getByText('desativada')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /Filial antiga/ })).not.toBeInTheDocument();
  });

  it('creates a unit right there and leaves it marked', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addRegistryItems).mockResolvedValue({ ...registry, units: [...registry.units, { id: 'rio', name: 'Rio de Janeiro', isActive: true, peopleCount: 0 }] });
    open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ou criar unidade' }), 'Rio de Janeiro');
    await user.click(screen.getByRole('button', { name: 'Criar unidade “Rio de Janeiro”' }));
    expect(api.addRegistryItems).toHaveBeenCalledWith('units', ['Rio de Janeiro']);
    expect(await screen.findByRole('checkbox', { name: /Rio de Janeiro/ })).toBeChecked();
  });

  it('offers under each unit only the sectors that unit has', async () => {
    const user = userEvent.setup();
    const linked = { ...registry, unitSectors: [{ unitId: 'minas', sectorId: 'hr', peopleCount: 2 }, { unitId: 'sp', sectorId: 'it', peopleCount: 1 }] };
    render(<AudienceDialog audience={{ targets: [] }} onClose={vi.fn()} onSaved={vi.fn()} profiles={profiles} registry={linked} sipatId="t1" />);
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    await user.click(screen.getByRole('checkbox', { name: /Minas Gerais/ }));
    const minas = within(screen.getByRole('group', { name: 'Setores de Minas Gerais' }));
    expect(minas.getByRole('button', { name: 'RH, 2 pessoas' })).toBeVisible();
    expect(minas.queryByRole('button', { name: /^TI/ })).not.toBeInTheDocument();
    // every sector of the company can still be marked for all the units
    expect(within(screen.getByRole('group', { name: 'Em todas as unidades' })).getByRole('button', { name: /^TI/ })).toBeVisible();
  });

  it('does not save a choice with nothing chosen', async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('radio', { name: 'Escolher unidades e setores' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });
});

describe('the audience in one line', () => {
  it('is the whole company when nothing is marked', () => {
    expect(audienceLabel([], registry)).toBe('Toda a empresa');
  });

  it('names units, the sectors inside them, and sectors of every unit', () => {
    expect(audienceLabel([{ unitId: 'minas', sectorId: null }], registry)).toBe('Minas Gerais');
    expect(audienceLabel([{ unitId: 'minas', sectorId: 'hr' }, { unitId: 'sp', sectorId: 'it' }], registry)).toBe('Minas Gerais › RH · São Paulo › TI');
    expect(audienceLabel([{ unitId: 'minas', sectorId: 'hr' }, { unitId: 'minas', sectorId: 'it' }], registry)).toBe('Minas Gerais › RH, TI');
    expect(audienceLabel([{ unitId: null, sectorId: 'hr' }], registry)).toBe('RH de todas as unidades');
  });

  it('cuts a long one short', () => {
    expect(audienceLabel([
      { unitId: 'minas', sectorId: null }, { unitId: 'sp', sectorId: null }, { unitId: 'closed', sectorId: null }, { unitId: null, sectorId: 'hr' },
    ], registry)).toBe('Minas Gerais · São Paulo +2');
  });
});
