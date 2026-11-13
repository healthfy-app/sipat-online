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
});
