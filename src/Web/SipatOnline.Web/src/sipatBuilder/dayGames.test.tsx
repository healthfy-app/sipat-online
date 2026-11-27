import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameModule } from '@/api';
import BuilderGrid from './BuilderGrid';
import { addGame, daySteps, moveGame, removeGame, replaceGame, toProgramDay, type Catalog, type DaySlots } from './model';

afterEach(cleanup);

// two games left before the first video, as after the videos they came after were taken out
const day = (): DaySlots => ({
  key: 'd1', id: 'day-1', title: 'Aula 2', date: '', subject: '', videos: ['v1', 'v2', null], games: ['g1', 'g2', null],
  places: [{ gameId: 'g1', afterVideo: 0 }, { gameId: 'g2', afterVideo: 0 }],
});
const order = (slots: Pick<DaySlots, 'games' | 'places'> | null) => slots?.places?.map(place => `${place.gameId}@${place.afterVideo}`);

describe('the games of a day on the board', () => {
  it('moves a game a step: past another game it changes turns, past a video it changes place', () => {
    expect(order(moveGame(day(), 'g1', 1))).toEqual(['g2@0', 'g1@0']);
    expect(order(moveGame(day(), 'g2', 1))).toEqual(['g1@0', 'g2@1']);
    expect(moveGame(day(), 'g1', -1)).toBeNull();
  });

  it('puts a game after the last video once, takes one out, and puts a copy in its place', () => {
    expect(order(addGame(day(), 'g3'))).toEqual(['g1@0', 'g2@0', 'g3@2']);
    expect(addGame(day(), 'g1')).toBeNull();
    expect(order(removeGame(day(), 'g1'))).toEqual(['g2@0']);
    expect(order(replaceGame(day(), 'g2', 'copy'))).toEqual(['g1@0', 'copy@0']);
  });

  it('saves where the board shows each game', () => {
    expect(toProgramDay({ ...day(), ...moveGame(day(), 'g2', 1) }).gamePlaces).toEqual([{ gameId: 'g1', afterVideo: 0 }, { gameId: 'g2', afterVideo: 1 }]);
  });

  it('shows the day in the participant\'s order', () => {
    expect(daySteps(['v1', 'v2'], [{ id: 'g1', afterVideo: 1 }]).map(step => step.id)).toEqual(['v1', 'g1', 'v2']);
  });

  it('moves a game down on the grid with its arrow', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const games = new Map<string, GameModule>([
      ['g1', { id: 'g1', title: 'Caça aos riscos', gameType: 'Quiz', questions: [], createdAt: '', usageCount: 1 } as GameModule],
      ['g2', { id: 'g2', title: 'Memória', gameType: 'Quiz', questions: [], createdAt: '', usageCount: 1 } as GameModule],
    ]);
    const catalog: Catalog = {
      videos: new Map([['v1', { id: 'v1', title: 'Vídeo 1', durationMs: 60_000, code: null }], ['v2', { id: 'v2', title: 'Vídeo 2', durationMs: 60_000, code: null }]]),
      subjects: [], games, filters: [],
    };
    render(<BuilderGrid canCustomizeGrid catalog={catalog} days={[day()]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Descer Memória' }));
    const changed: DaySlots[] = onChange.mock.calls[0][0];
    expect(order(changed[0])).toEqual(['g1@0', 'g2@1']);
    expect(screen.getByRole('button', { name: 'Subir Caça aos riscos' })).toBeDisabled();
  });
});
