import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoiceList, type Mark } from './choice-list';

const units = [
  { id: 'sp', title: 'São Paulo', hint: '212 pessoas' },
  { id: 'rio', title: 'Rio de Janeiro', hint: '180 pessoas' },
];
const marks = (entries: [string, Mark][] = []) => new Map<string, Mark>(entries);

afterEach(cleanup);

describe('choice list', () => {
  it('narrows the list by the search, whatever the case', async () => {
    const user = userEvent.setup();
    render(<ChoiceList choices={units} marks={marks()} noun="unidade" onToggle={vi.fn()} />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar unidade' }), 'são');
    expect(screen.getByLabelText(/São Paulo/)).toBeVisible();
    expect(screen.queryByLabelText(/Rio de Janeiro/)).not.toBeInTheDocument();
  });

  it('shows how many each one has beside its name', () => {
    render(<ChoiceList choices={units} marks={marks()} noun="unidade" onToggle={vi.fn()} />);
    expect(screen.getByText('212 pessoas')).toBeVisible();
  });

  it('offers to create only a name that does not exist yet, and only when it can create', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ChoiceList choices={units} marks={marks()} noun="unidade" onCreate={onCreate} onToggle={vi.fn()} />);
    const search = screen.getByRole('searchbox', { name: 'Buscar ou criar unidade' });
    await user.type(search, 'são paulo');
    expect(screen.queryByRole('button', { name: /Criar unidade/ })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'Minas');
    await user.click(screen.getByRole('button', { name: 'Criar unidade “Minas”' }));
    expect(onCreate).toHaveBeenCalledWith('Minas');

    rerender(<ChoiceList choices={units} marks={marks()} noun="unidade" onToggle={vi.fn()} />);
    await user.type(screen.getByRole('searchbox', { name: 'Buscar unidade' }), 'Bahia');
    expect(screen.queryByRole('button', { name: /Criar unidade/ })).not.toBeInTheDocument();
    expect(screen.getByText('Nada encontrado.')).toBeVisible();
  });

  it('creates on Enter when nothing matches', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<ChoiceList choices={units} marks={marks()} noun="unidade" onCreate={onCreate} onToggle={vi.fn()} />);
    await user.type(screen.getByRole('searchbox'), 'Minas Gerais{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Minas Gerais');
  });

  it('marks several with boxes, and says when only part has one', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ChoiceList choices={units} marks={marks([['sp', 'all'], ['rio', 'some']])} noun="unidade" onToggle={onToggle} someLabel="(em parte das pessoas)" />);
    expect(screen.getByRole('checkbox', { name: /São Paulo/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Rio de Janeiro/ })).not.toBeChecked();
    expect(screen.getByText('(em parte das pessoas)')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /Rio de Janeiro/ }));
    expect(onToggle).toHaveBeenCalledWith('rio');
  });

  it('is a choice of one when single', () => {
    render(<ChoiceList choices={units} marks={marks([['sp', 'all']])} mode="single" noun="unidade" onToggle={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /São Paulo/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Rio de Janeiro/ })).not.toBeChecked();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('asks before removing, saying what happens, and removes only on the yes', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<ChoiceList choices={units} marks={marks()} noun="unidade" onRemove={onRemove} onToggle={vi.fn()}
      removeNote={choice => `${choice.hint} continuam nela.`} removeVerb="Tirar" />);
    await user.click(screen.getByRole('button', { name: 'Tirar São Paulo' }));
    expect(screen.getByText('212 pessoas continuam nela.')).toBeVisible();
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Não' }));
    expect(screen.queryByText('212 pessoas continuam nela.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tirar São Paulo' }));
    await user.click(screen.getByRole('button', { name: 'Tirar' }));
    expect(onRemove).toHaveBeenCalledWith('sp');
  });
});
