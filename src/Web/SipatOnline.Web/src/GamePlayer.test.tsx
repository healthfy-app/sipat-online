import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GamePlayer from './GamePlayer';
import type { GameModule } from './api';

const quiz: GameModule = {
  id: 'm-1',
  title: 'Quiz de EPI',
  gameType: 'Quiz',
  createdAt: '2026-11-10T12:00:00Z',
  usageCount: 0,
  questions: [{ text: 'Quando usar capacete?', options: ['Sempre', 'Nunca'], correctIndex: 0 }],
};

afterEach(cleanup);

describe('GamePlayer', () => {
  it('can be skipped without answering and shows no score', async () => {
    const onClose = vi.fn();
    render(<GamePlayer module={quiz} onClose={onClose} />);

    expect(screen.queryByText(/pontos/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows feedback for a wrong answer and continues', async () => {
    const onClose = vi.fn();
    render(<GamePlayer module={quiz} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Nunca' }));
    expect(screen.getByRole('status')).toHaveTextContent('A resposta correta é: Sempre');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onClose).toHaveBeenCalled();
  });
});
