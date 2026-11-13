import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GamePlayer from './GamePlayer';
import type { GameModule } from './api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const base: GameModule = {
  id: 'activity', title: 'Prática de segurança', gameType: 'Ordering', questions: [],
  createdAt: '2026-11-10T00:00:00Z', usageCount: 0,
};
const empty = { imageUrl: null, items: null, pairs: null, risks: null, columns: 2 };
const quiz: GameModule = { ...base, title: 'Quiz de EPI', gameType: 'Quiz',
  questions: [{ text: 'Quando usar capacete?', options: ['Sempre', 'Nunca'], correctIndex: 0 }] };
const memory: GameModule = { ...base, gameType: 'Memory', content: { ...empty,
  pairs: [{ first: 'Capacete', second: 'Cabeça' }, { first: 'Óculos', second: 'Olhos' }] } };

async function start(module: GameModule, close = vi.fn()) {
  const user = userEvent.setup();
  render(<GamePlayer module={module} onClose={close} />);
  await user.click(screen.getByRole('button', { name: 'Começar' }));
  return { user, close };
}

async function finishWithContinue(user: ReturnType<typeof userEvent.setup>, close: ReturnType<typeof vi.fn>) {
  await user.click(await screen.findByRole('button', { name: 'Continuar' }));
  expect(close).toHaveBeenCalledExactlyOnceWith('completed');
}

describe('GamePlayer', () => {
  it('opens on a how-to screen that can be skipped before playing', async () => {
    const close = vi.fn();
    render(<GamePlayer module={quiz} onClose={close} />);
    expect(screen.getByRole('heading', { name: 'Quiz de EPI' })).toBeVisible();
    expect(screen.getByText('Atividade opcional · não bloqueia seu progresso')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('skipped');
  });

  it('scores a right quiz answer with a scoreboard and shows the result with stars', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const { user, close } = await start(quiz);
    await user.click(screen.getByRole('button', { name: 'Sempre' }));
    expect(screen.getByRole('status')).toHaveTextContent('Resposta correta!');
    expect(screen.getByLabelText(/^\d+ pontos$/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(screen.getByRole('img', { name: '3 de 3 estrelas' })).toBeVisible();
    expect(screen.getByText('Perfeito!')).toBeVisible();
    await finishWithContinue(user, close);
  });

  it('answers quiz options with the keyboard letters', async () => {
    const { user } = await start(quiz);
    await user.keyboard('b');
    expect(screen.getByRole('status')).toHaveTextContent('A resposta correta é: Sempre');
  });

  it('completes even after a wrong answer, with fewer stars', async () => {
    const { user, close } = await start(quiz);
    await user.click(screen.getByRole('button', { name: 'Nunca' }));
    expect(screen.getByRole('status')).toHaveTextContent('A resposta correta é: Sempre');
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(screen.getByRole('img', { name: '1 de 3 estrelas' })).toBeVisible();
    await finishWithContinue(user, close);
  });

  it('plays scenario decisions as situations with safe-attitude feedback', async () => {
    const { user, close } = await start({ ...base, gameType: 'Scenario',
      questions: [{ text: 'Um colega está sem capacete.', options: ['Ignorar', 'Comunicar'], correctIndex: 1 }] });
    expect(screen.getByText('Situação 1 de 1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Ignorar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Atitude arriscada. O mais seguro: Comunicar');
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    await finishWithContinue(user, close);
  });

  it('can replay a finished game from the start of the board', async () => {
    const { user } = await start(quiz);
    await user.click(screen.getByRole('button', { name: 'Sempre' }));
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    await user.click(screen.getByRole('button', { name: 'Jogar de novo' }));
    expect(screen.getByRole('button', { name: 'Sempre' })).toBeEnabled();
    expect(screen.getByLabelText('0 pontos')).toBeVisible();
  });

  it('checks ordering, keeps a wrong attempt open and completes only the correct order', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const { user, close } = await start({ ...base, content: { ...empty, items: ['Planejar', 'Executar'] } });
    await user.click(screen.getByRole('button', { name: 'Verificar ordem' }));
    expect(screen.getByText(/Ainda não está correto: 0 de 2 etapas/)).toBeVisible();
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Subir Planejar' }));
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Planejar');
    await user.click(screen.getByRole('button', { name: 'Verificar ordem' }));
    expect(screen.getByText(/A sequência está correta/)).toBeVisible();
    expect(await screen.findByRole('img', { name: '2 de 3 estrelas' })).toBeVisible();
    await finishWithContinue(user, close);
  });

  it('solves a puzzle by keyboard-accessible swaps and locks pieces that fit', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const { user, close } = await start({ ...base, gameType: 'Puzzle', content: { ...empty, imageUrl: '/course-covers/safety.jpg' } });
    await user.click(screen.getByRole('button', { name: 'Peça 1, posição 4' }));
    await user.click(screen.getByRole('button', { name: 'Peça 2, posição 1' }));
    expect(screen.getByRole('button', { name: 'Peça 1, posição 1, encaixada' })).toBeDisabled();
    for (let piece = 2; piece <= 3; piece++) {
      await user.click(screen.getByRole('button', { name: `Peça ${piece}, posição 4` }));
      await user.click(screen.getByRole('button', { name: `Peça ${piece + 1}, posição ${piece}` }));
    }
    expect(screen.getByText(/A imagem está completa/)).toBeVisible();
    expect(await screen.findByRole('img', { name: '3 de 3 estrelas' }, { timeout: 2000 })).toBeVisible();
    await finishWithContinue(user, close);
  });

  it('matches memory pairs without allowing concurrent third-card reveals', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const { user, close } = await start(memory);
    await user.click(screen.getByRole('button', { name: 'Revelar carta 1' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 4' }));
    expect(screen.getByRole('button', { name: 'Revelar carta 2' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Par encontrado: Capacete + Cabeça'));
    expect(screen.getByRole('button', { name: 'Capacete, par encontrado' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Revelar carta 2' }));
    await user.click(screen.getByRole('button', { name: 'Revelar carta 3' }));
    expect(await screen.findByRole('img', { name: '3 de 3 estrelas' }, { timeout: 2000 })).toBeVisible();
    await finishWithContinue(user, close);
  });

  it('turns mismatched memory cards back over and ignores clicks before the next render', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    await start(memory);
    const cards = [...document.querySelectorAll<HTMLButtonElement>('.memory-card')];
    act(() => { cards[0].click(); cards[0].click(); cards[1].click(); cards[2].click(); });
    expect(document.querySelectorAll('.memory-card.is-revealed')).toHaveLength(2);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('não formam um par'), { timeout: 2000 });
    expect(document.querySelectorAll('.memory-card.is-revealed')).toHaveLength(0);
    expect(screen.getByText('0 de 2 pares encontrados')).toBeInTheDocument();
  });

  it('identifies each risk once, breaks the combo on a wrong click and keeps the responsive area', async () => {
    const { user, close } = await start({ ...base, gameType: 'RiskSpotting', content: { ...empty, imageUrl: '/risk-scene.svg',
      risks: [{ label: 'Cabo', x: 10, y: 30, width: 20, height: 15 }, { label: 'Saída', x: 60, y: 20, width: 25, height: 40 }] } });
    const cable = screen.getByRole('button', { name: 'Identificar risco: Cabo' });
    expect(cable).toHaveStyle({ left: '10%', top: '30%', width: '20%', height: '15%' });
    await user.click(cable); await user.click(cable);
    expect(screen.getByText('1 de 2 riscos identificados')).toBeVisible();
    await user.click(screen.getByRole('img', { name: /Ambiente de trabalho/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Nada de risco aqui');
    await user.click(screen.getByRole('button', { name: 'Identificar risco: Saída' }));
    expect(await screen.findByRole('img', { name: '2 de 3 estrelas' })).toBeVisible();
    await finishWithContinue(user, close);
  });

  it.each(['Memory', 'Ordering', 'Puzzle', 'RiskSpotting'] as const)('can skip an unfinished %s without claiming completion', async gameType => {
    const { user, close } = await start({ ...base, gameType, content: { ...empty, imageUrl: '/risk-scene.svg',
      items: ['Primeiro', 'Segundo'], pairs: [{ first: 'A', second: 'B' }, { first: 'C', second: 'D' }],
      risks: [{ label: 'Risco', x: 10, y: 10, width: 20, height: 20 }] } });
    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('skipped');
  });

  it('explains a game without content and lets the participant move on', async () => {
    const close = vi.fn();
    render(<GamePlayer module={{ ...base, gameType: 'Memory', content: empty }} onClose={close} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Este jogo precisa de conteúdo');
    await userEvent.click(screen.getByRole('button', { name: 'Pular atividade' }));
    expect(close).toHaveBeenCalledExactlyOnceWith('skipped');
  });
});
