import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import PlanSubjectsPanel from './PlanSubjectsPanel';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getPlanSubjects: vi.fn(), setPlanSubjects: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('assuntos of each plan', () => {
  it('starts with everything available and saves the assuntos taken out of a plan', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlanSubjects).mockResolvedValue({
      courses: [
        { id: 'c-1', title: 'Ergonomia', description: 'Opção 1 · 4 aulas\nGrade pronta.', videoCount: 4 },
        { id: 'c-2', title: 'Meio Ambiente', description: null, videoCount: 5 },
      ],
      excluded: { Bronze: [], Prata: [], Ouro: [], Diamante: [] },
    });
    vi.mocked(api.setPlanSubjects).mockResolvedValue(undefined);
    render(<PlanSubjectsPanel />);

    const bronze = await screen.findByRole('checkbox', { name: 'Meio Ambiente no plano Bronze' });
    expect(bronze).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Meio Ambiente no plano Ouro' })).toBeChecked();
    expect(screen.getByText('Opção 1')).toBeVisible();

    await user.click(bronze);
    expect(api.setPlanSubjects).toHaveBeenCalledWith('Bronze', ['c-2']);
    expect(bronze).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Meio Ambiente no plano Prata' })).toBeChecked();

    await user.click(bronze);
    expect(api.setPlanSubjects).toHaveBeenLastCalledWith('Bronze', []);
  });
});
