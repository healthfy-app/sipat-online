import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GameModule } from '@/api';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';

vi.mock('@/api', async original => ({ ...(await original<typeof import('@/api')>()), createGameModule: vi.fn(), updateGameModule: vi.fn() }));

afterEach(cleanup);

const quiz: GameModule = {
  id: 'quiz', title: 'Quiz de EPI', gameType: 'Quiz', createdAt: '', usageCount: 0,
  questions: [{ text: 'Quando usar capacete?', options: ['Sempre', 'Nunca'], correctIndex: 0 }],
};

describe('testing games while creating them', () => {
  it('plays a saved game from the list on the same stage participants see', async () => {
    const user = userEvent.setup();
    render(<GameModulesPanel busy={false} modules={[quiz]} onCreate={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Testar jogo Quiz de EPI' }));
    expect(await screen.findByRole('dialog', { name: 'Quiz de EPI' }, { timeout: 5000 })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Começar' }, { timeout: 5000 }));
    expect(screen.getByRole('button', { name: 'Sempre' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tests the unsaved draft from the form and returns to editing without saving', async () => {
    const user = userEvent.setup();
    const saved = vi.fn();
    render(<GameModuleForm module={quiz} onBusyChange={vi.fn()} onCancel={vi.fn()} onSaved={saved} />);
    await user.clear(screen.getByLabelText('Texto da pergunta 1'));
    await user.type(screen.getByLabelText('Texto da pergunta 1'), 'Pergunta ainda não salva?');
    await user.click(screen.getByRole('button', { name: 'Testar jogo' }));
    expect(screen.getByText('Teste com o que está no formulário agora. Nada é salvo.')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: 'Começar' }, { timeout: 5000 }));
    expect(screen.getByRole('heading', { name: 'Pergunta ainda não salva?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Voltar à edição' }));
    expect(screen.getByLabelText('Texto da pergunta 1')).toHaveValue('Pergunta ainda não salva?');
    expect(saved).not.toHaveBeenCalled();
  });

  it('offers Seguro ou arriscado instead of Caça aos riscos for new games and tests the cards draft', async () => {
    const user = userEvent.setup();
    render(<GameModuleForm module={null} onBusyChange={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />);
    const type = screen.getByLabelText('Tipo de jogo');
    expect(screen.queryByRole('option', { name: 'Caça aos riscos' })).not.toBeInTheDocument();
    await user.selectOptions(type, 'SafeOrRisky');
    expect(screen.getAllByRole('radiogroup')).toHaveLength(3);
    await user.type(screen.getByLabelText('Situação da carta 1'), 'Correr na escada');
    await user.click(screen.getAllByRole('radio', { name: 'Arriscado' })[0]);
    await user.type(screen.getByLabelText('Por que, na carta 1'), 'Pode causar queda.');
    await user.click(screen.getByRole('button', { name: 'Adicionar carta' }));
    expect(screen.getByLabelText('Situação da carta 4')).toHaveFocus();
    expect(screen.getByText('1 segura · 3 arriscadas')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Testar jogo' }));
    await user.click(await screen.findByRole('button', { name: 'Começar' }, { timeout: 5000 }));
    expect(screen.getByRole('heading', { name: 'Correr na escada' })).toBeVisible();
  });

  it('keeps an existing Caça aos riscos game editable', () => {
    render(<GameModuleForm module={{ ...quiz, gameType: 'RiskSpotting', questions: [], content: {
      imageUrl: '/risk-scene.svg', items: null, pairs: null, risks: [{ label: 'Cabo', x: 1, y: 1, width: 10, height: 10 }], columns: 2 } }}
      onBusyChange={vi.fn()} onCancel={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole('option', { name: 'Caça aos riscos' })).toBeInTheDocument();
  });
});
