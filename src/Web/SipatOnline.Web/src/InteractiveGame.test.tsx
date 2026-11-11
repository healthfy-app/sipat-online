import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GamePlayer from './GamePlayer';
import type { GameModule } from './api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const base: GameModule = {
  id: 'activity', title: 'Prática de segurança', gameType: 'Ordering', questions: [],
  createdAt: '2026-11-10T00:00:00Z', usageCount: 0,
};
const empty = { imageUrl: null, items: null, pairs: null, risks: null, columns: 2 };

describe('interactive games', () => {
  it.each([{ mode: 'standard', reduced: false }, { mode: 'reduced', reduced: true }])(
    'keeps ordering immediate and respects $mode motion while cleaning up animations', async ({ reduced }) => {
      vi.spyOn(Math, 'random').mockReturnValue(.99);
      vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reduced })));
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const index = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
        return new DOMRect(0, index * 60, 200, 50);
      });
      const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
      const cancel = vi.fn();
      const animate = vi.fn(() => ({ cancel }));
      Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
      try {
        const view = render(<GamePlayer module={{ ...base, content: { ...empty, items: ['Planejar', 'Executar'] } }} onClose={vi.fn()} />);
        expect(animate).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Subir Planejar' }));
        const items = screen.getAllByRole('listitem');
        expect(items[0]).toHaveTextContent('Planejar');
        expect(items[1]).toHaveTextContent('Executar');
        expect(screen.getByRole('button', { name: 'Verificar resposta' })).toBeEnabled();
        if (reduced) expect(animate).not.toHaveBeenCalled();
        else expect(animate).toHaveBeenCalledTimes(2);
        view.unmount();
        expect(cancel).toHaveBeenCalledTimes(reduced ? 0 : 2);
      } finally {
        if (previous) Object.defineProperty(HTMLElement.prototype, 'animate', previous);
        else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      }
    },
  );
  it('checks ordering, keeps a wrong attempt open and completes only the correct order', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const close = vi.fn(); const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, content: { ...empty, items: ['Planejar', 'Executar'] } }} onClose={close} />);
    await user.click(screen.getByRole('button', { name: 'Verificar resposta' }));
    expect(screen.getByRole('status')).toHaveTextContent('Ainda não está correto');
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Subir Planejar' }));
    await user.click(screen.getByRole('button', { name: 'Verificar resposta' }));
    expect(screen.getByRole('status')).toHaveTextContent('Atividade concluída');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it('solves a puzzle by keyboard-accessible swaps rather than drag gestures', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const close = vi.fn(); const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, gameType: 'Puzzle', content: { ...empty, imageUrl: '/course-covers/safety.jpg' } }} onClose={close} />);
    for (let piece = 1; piece <= 3; piece++) {
      await user.click(screen.getByRole('button', { name: `Peça ${piece}, posição 4` }));
      await user.click(screen.getByRole('button', { name: `Peça ${piece + 1}, posição ${piece}` }));
    }
    await user.click(screen.getByRole('button', { name: 'Verificar resposta' }));
    expect(screen.getByRole('status')).toHaveTextContent('A sequência está correta');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it('matches memory pairs without allowing concurrent third-card reveals', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const close = vi.fn(); const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, gameType: 'Memory', content: { ...empty,
      pairs: [{ first: 'Capacete', second: 'Cabeça' }, { first: 'Óculos', second: 'Olhos' }],
    } }} onClose={close} />);
    await user.click(screen.getByRole('button', { name: 'Revelar carta 1' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 4' }));
    expect(screen.getByRole('button', { name: 'Revelar carta 2' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Par encontrado'));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 2' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 3' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Todos os pares encontrados'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it('rejects mismatched memory cards and marks only complementary equipment pairs as found', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, gameType: 'Memory', content: { ...empty,
      pairs: [{ first: 'Capacete', second: 'Cabeça' }, { first: 'Óculos', second: 'Olhos' }],
    } }} onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Revelar carta 1' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 2' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('não formam um par'));
    expect(screen.getByText('0 de 2 pares encontrados')).toBeVisible();
    expect(document.querySelectorAll('.memory-game-card.is-matched')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Revelar carta 1' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 4' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Par encontrado: Capacete + Cabeça'));
    expect(screen.getByText('1 de 2 pares encontrados')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Pares encontrados' })).toHaveAttribute('value', '1');
    const matched = [...document.querySelectorAll<HTMLButtonElement>('.memory-game-card.is-matched')];
    expect(matched).toHaveLength(2);
    expect(matched.every(card => card.disabled && card.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
  });

  it('ignores repeated and third memory clicks even before the next render commits', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    render(<GamePlayer module={{ ...base, gameType: 'Memory', content: { ...empty,
      pairs: [{ first: 'Capacete', second: 'Cabeça' }, { first: 'Óculos', second: 'Olhos' }],
    } }} onClose={vi.fn()} />);
    const cards = [...document.querySelectorAll<HTMLButtonElement>('.memory-game-card')];
    act(() => { cards[0].click(); cards[0].click(); cards[1].click(); cards[2].click(); });
    expect(document.querySelectorAll('.memory-game-card.is-revealed')).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('não formam um par'));
    expect(document.querySelectorAll('.memory-game-card.is-revealed')).toHaveLength(0);
    expect(screen.getByText('0 de 2 pares encontrados')).toBeVisible();
  });

  it('identifies each risk once and keeps its normalized responsive area', async () => {
    const close = vi.fn(); const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, gameType: 'RiskSpotting', content: { ...empty, imageUrl: '/risk-scene.svg',
      risks: [{ label: 'Cabo', x: 10, y: 30, width: 20, height: 15 }, { label: 'Saída', x: 60, y: 20, width: 25, height: 40 }],
    } }} onClose={close} />);
    const cable = screen.getByRole('button', { name: 'Identificar risco: Cabo' });
    expect(cable).toHaveStyle({ left: '10%', top: '30%', width: '20%', height: '15%' });
    await user.click(cable); await user.click(cable);
    expect(screen.getByText('1 de 2 riscos identificados')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Identificar risco: Saída' }));
    expect(screen.getByRole('progressbar', { name: 'Riscos identificados' })).toHaveAttribute('value', '2');
    expect(document.querySelector('.game-feedback .achievement-mark')).toHaveClass('is-celebrating');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it('plays scenario decisions with feedback without points or blocking completion on a wrong answer', async () => {
    const close = vi.fn(); const user = userEvent.setup();
    render(<GamePlayer module={{ ...base, gameType: 'Scenario',
      questions: [{ text: 'Como agir?', options: ['Ignorar', 'Comunicar'], correctIndex: 1 }],
    }} onClose={close} />);
    await user.click(screen.getByRole('button', { name: 'Ignorar' }));
    expect(screen.getByRole('status')).toHaveTextContent('A resposta correta é: Comunicar');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('completed');
  });

  it.each(['Memory', 'Ordering', 'Puzzle', 'RiskSpotting'] as const)('can skip an unfinished %s without claiming completion', async gameType => {
    const close = vi.fn();
    render(<GamePlayer module={{ ...base, gameType, content: { ...empty, imageUrl: '/risk-scene.svg',
      items: ['Primeiro', 'Segundo'], pairs: [{ first: 'A', second: 'B' }, { first: 'C', second: 'D' }],
      risks: [{ label: 'Risco', x: 10, y: 10, width: 20, height: 20 }],
    } }} onClose={close} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('skipped');
  });
});
