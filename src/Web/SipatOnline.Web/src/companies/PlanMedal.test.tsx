import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import PlanMedal from './PlanMedal';

afterEach(cleanup);

describe('PlanMedal', () => {
  it('names the plan and shows on hover what it has and what a higher plan adds', async () => {
    const user = userEvent.setup();
    render(<PlanMedal plan="Ouro" />);

    const medal = screen.getByRole('button', { name: 'Plano Ouro' });
    await user.hover(medal);

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Plano Ouro')).toBeInTheDocument();
    expect(within(tooltip).getByText('6 de 8 recursos incluídos')).toBeInTheDocument();
    expect(within(tooltip).getByText(/Certificado personalizado/)).toHaveTextContent('(incluído)');
    expect(within(tooltip).getByText(/Quiz ao final de cada módulo/)).toHaveTextContent('(a partir do plano Diamante)');
    expect(within(tooltip).getByText('Quer mais recursos? Fale com a SIPAT Online.')).toBeInTheDocument();
  });

  it('opens on keyboard focus too, and the top plan has everything', async () => {
    const user = userEvent.setup();
    render(<PlanMedal plan="Diamante" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Plano Diamante' })).toHaveFocus();

    const tooltip = await screen.findByRole('tooltip');
    expect(within(tooltip).getByText('Todos os recursos da plataforma')).toBeInTheDocument();
    expect(within(tooltip).queryByText(/a partir do plano/)).not.toBeInTheDocument();
    expect(within(tooltip).queryByText(/Quer mais recursos/)).not.toBeInTheDocument();
  });
});
