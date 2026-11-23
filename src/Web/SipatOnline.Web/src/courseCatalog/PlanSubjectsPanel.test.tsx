import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import PlanSubjectsPanel from './PlanSubjectsPanel';

vi.mock('@/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/api')>()), getPlanSubjects: vi.fn(), setPlanSubjects: vi.fn(), setSubjectCompany: vi.fn(), listPlatformCompanies: vi.fn(), listCourseCategories: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('treinamentos of each plan', () => {
  it('starts with everything available and saves the treinamentos taken out of a plan', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlanSubjects).mockResolvedValue({
      courses: [
        { id: 'c-1', title: 'Ergonomia', description: 'Grade pronta.', videoCount: 4, categoryId: 'cat-post' },
        { id: 'c-2', title: 'Meio Ambiente', description: null, videoCount: 5 },
      ],
      excluded: { Bronze: [], Prata: [], Ouro: [], Diamante: [] },
    });
    vi.mocked(api.setPlanSubjects).mockResolvedValue(undefined);
    vi.mocked(api.listPlatformCompanies).mockResolvedValue([]);
    vi.mocked(api.listCourseCategories).mockResolvedValue([{ id: 'cat-post', name: 'Postura', courseCount: 1 }]);
    render(<PlanSubjectsPanel />);

    const bronze = await screen.findByRole('checkbox', { name: 'Bronze — Meio Ambiente' });
    expect(bronze).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Ouro — Meio Ambiente' })).toBeChecked();
    expect(await screen.findByText('Postura')).toBeVisible();

    await user.click(bronze);
    expect(api.setPlanSubjects).toHaveBeenCalledWith('Bronze', ['c-2']);
    expect(bronze).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Prata — Meio Ambiente' })).toBeChecked();

    await user.click(bronze);
    expect(api.setPlanSubjects).toHaveBeenLastCalledWith('Bronze', []);
  });

  it('folds a category away and opens every one while searching', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlanSubjects).mockResolvedValue({
      courses: [
        { id: 'c-1', title: 'Ergonomia', description: null, videoCount: 4, categoryId: 'cat-post' },
        { id: 'c-2', title: 'Meio Ambiente', description: null, videoCount: 5 },
      ],
      excluded: { Bronze: [], Prata: [], Ouro: [], Diamante: [] },
    });
    vi.mocked(api.listPlatformCompanies).mockResolvedValue([]);
    vi.mocked(api.listCourseCategories).mockResolvedValue([{ id: 'cat-post', name: 'Postura', courseCount: 1 }]);
    render(<PlanSubjectsPanel />);

    const postura = await screen.findByRole('button', { name: /Postura/ });
    expect(postura).toHaveAttribute('aria-expanded', 'true');
    await user.click(postura);
    expect(postura).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Ergonomia')).not.toBeInTheDocument();
    expect(screen.getByText('Meio Ambiente')).toBeVisible();

    await user.type(screen.getByPlaceholderText('Buscar treinamento'), 'ergo');
    expect(screen.getByText('Ergonomia')).toBeVisible();

    await user.clear(screen.getByPlaceholderText('Buscar treinamento'));
    await user.click(screen.getByRole('button', { name: 'Recolher todos' }));
    expect(screen.queryByText('Meio Ambiente')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expandir todos' }));
    expect(screen.getByText('Ergonomia')).toBeVisible();
    expect(screen.getByText('Meio Ambiente')).toBeVisible();
  });

  it('gives an treinamento to one company as its internal videos, outside the plans', async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPlanSubjects).mockResolvedValue({
      courses: [
        { id: 'c-1', title: 'Ergonomia', description: null, videoCount: 4 },
        { id: 'c-2', title: 'Vídeos da Acme', description: null, videoCount: 2 },
      ],
      excluded: { Bronze: [], Prata: [], Ouro: [], Diamante: [] },
    });
    vi.mocked(api.listPlatformCompanies).mockResolvedValue([{ id: 'acme', key: 'acme', name: 'Acme', createdAt: '2026-01-01T00:00:00Z', isActive: true }]);
    vi.mocked(api.setSubjectCompany).mockResolvedValue(undefined);
    vi.mocked(api.listCourseCategories).mockResolvedValue([]);
    render(<PlanSubjectsPanel />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Quem vê o treinamento Vídeos da Acme' }), 'acme');
    expect(api.setSubjectCompany).toHaveBeenCalledWith('c-2', 'acme');
    expect(screen.getByText(/Só Acme, no plano/)).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'Bronze — Vídeos da Acme' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Todos').length).toBe(4);
  });
});
