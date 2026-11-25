import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import PlacementDialog from './PlacementDialog';

vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  changePlacement: vi.fn(), addRegistryItems: vi.fn(), removeRegistryItem: vi.fn(), getCompanyRegistry: vi.fn(),
}));

const rules = { requireRegistration: false, requireEmail: false, requirePhone: false, requireUnit: false, requireSector: false };
const registry: api.CompanyRegistry = {
  units: [
    { id: 'sp', name: 'São Paulo', isActive: true, peopleCount: 2 },
    { id: 'rio', name: 'Rio de Janeiro', isActive: true, peopleCount: 1 },
    { id: 'minas', name: 'Minas Gerais', isActive: true, peopleCount: 0 },
    { id: 'old', name: 'Filial antiga', isActive: false, peopleCount: 0 },
  ],
  sectors: [{ id: 'hr', name: 'RH', isActive: true, peopleCount: 1 }],
  rules,
};
const person = (id: string, unitId: string | null, sectorId: string | null = null): api.ParticipantProfile =>
  ({ id, registrationNumber: null, email: null, phone: null, unitId, sectorId });
const moved = (changed: number, extra: Partial<api.PlacementResult> = {}): api.PlacementResult => ({ changed, added: 0, removed: 0, receivedTrainings: [], ...extra });

function open(profiles: api.ParticipantProfile[], onSaved = vi.fn()) {
  render(<PlacementDialog onClose={vi.fn()} onSaved={onSaved} people={profiles.map(item => item.id)}
    profiles={new Map(profiles.map(item => [item.id, item]))} registry={registry} />);
  return onSaved;
}

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('unit and sector of the selected people', () => {
  it('opens showing where they are: all in one, or only part of them', () => {
    open([person('a', 'sp'), person('b', 'sp'), person('c', 'rio')]);
    expect(screen.getByRole('radio', { name: /São Paulo/ })).not.toBeChecked();
    expect(screen.getAllByText('(em parte das pessoas)')).toHaveLength(2);
    cleanup();
    open([person('a', 'sp'), person('b', 'sp')]);
    expect(screen.getByRole('radio', { name: /São Paulo/ })).toBeChecked();
    expect(screen.queryByRole('radio', { name: /Filial antiga/ })).not.toBeInTheDocument();
  });

  it('moves them to the unit chosen and leaves the sector alone', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePlacement).mockResolvedValue(moved(2, { added: 4, receivedTrainings: ['SIPAT Rio'] }));
    const onSaved = open([person('a', 'sp'), person('b', 'sp')]);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Rio de Janeiro/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('2 colaboradores passaram para Rio de Janeiro e receberam SIPAT Rio.'));
    expect(api.changePlacement).toHaveBeenCalledTimes(1);
    expect(api.changePlacement).toHaveBeenCalledWith(['a', 'b'], 'unit', 'rio');
  });

  it('takes the unit away with "Sem unidade", and says what left', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePlacement).mockResolvedValue(moved(1, { removed: 5 }));
    const onSaved = open([person('a', 'sp')]);
    await user.click(screen.getByRole('radio', { name: 'Sem unidade' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.changePlacement).toHaveBeenCalledWith(['a'], 'unit', null);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('1 colaborador ficou sem unidade · 5 dias de treinamentos não iniciados saíram.'));
  });

  it('changes unit and sector in one go, each in its tab', async () => {
    const user = userEvent.setup();
    vi.mocked(api.changePlacement).mockResolvedValueOnce(moved(1)).mockResolvedValueOnce(moved(1));
    const onSaved = open([person('lucia', null)]);
    await user.click(screen.getByRole('radio', { name: /Minas Gerais/ }));
    await user.click(screen.getByRole('tab', { name: 'Setores' }));
    await user.click(screen.getByRole('radio', { name: /RH/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('1 colaborador passou para Minas Gerais. 1 colaborador passou para RH.'));
    expect(api.changePlacement).toHaveBeenNthCalledWith(1, ['lucia'], 'unit', 'minas');
    expect(api.changePlacement).toHaveBeenNthCalledWith(2, ['lucia'], 'sector', 'hr');
  });

  it('makes a unit right there and leaves it chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(api.addRegistryItems).mockResolvedValue({ ...registry, units: [...registry.units, { id: 'ba', name: 'Bahia', isActive: true, peopleCount: 0 }] });
    open([person('a', 'sp')]);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar ou criar unidade' }), 'Bahia');
    await user.click(screen.getByRole('button', { name: 'Criar unidade “Bahia”' }));
    expect(api.addRegistryItems).toHaveBeenCalledWith('units', ['Bahia']);
    expect(await screen.findByRole('radio', { name: /Bahia/ })).toBeChecked();
  });

  it('takes a unit off the list, saying whether people stay in it', async () => {
    const user = userEvent.setup();
    vi.mocked(api.removeRegistryItem).mockResolvedValue({ deleted: true });
    vi.mocked(api.getCompanyRegistry).mockResolvedValue({ ...registry, units: registry.units.filter(unit => unit.id !== 'minas') });
    open([person('a', 'sp')]);
    await user.click(screen.getByRole('button', { name: 'Tirar São Paulo' }));
    expect(screen.getByText('2 pessoas continuam nela; ela só deixa de ser oferecida.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Não' }));
    await user.click(screen.getByRole('button', { name: 'Tirar Minas Gerais' }));
    expect(screen.getByText('Ninguém está nela.')).toBeVisible();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Tirar' }));
    expect(api.removeRegistryItem).toHaveBeenCalledWith('units', 'minas');
    await waitFor(() => expect(screen.queryByRole('radio', { name: /Minas Gerais/ })).not.toBeInTheDocument());
    // "Sem unidade" is not something to take off the list
    expect(screen.queryByRole('button', { name: 'Tirar Sem unidade' })).not.toBeInTheDocument();
  });
});
