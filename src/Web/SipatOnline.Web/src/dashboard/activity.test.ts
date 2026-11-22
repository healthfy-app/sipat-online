import { expect, it } from 'vitest';
import { activeParticipantsByDay, totalWatchedMilliseconds } from './activity';

const today = new Date(2026, 10, 22, 15, 0);

it('counts each person once a day over the last days, with empty days at zero', () => {
  const series = activeParticipantsByDay([
    { participantId: 'maria', lastAccessedAt: new Date(2026, 10, 22, 9).toISOString() },
    { participantId: 'maria', lastAccessedAt: new Date(2026, 10, 22, 10).toISOString() },
    { participantId: 'jose', lastAccessedAt: new Date(2026, 10, 22, 11).toISOString() },
    { participantId: 'ana', lastAccessedAt: new Date(2026, 10, 20, 8).toISOString() },
    { participantId: 'velho', lastAccessedAt: new Date(2026, 9, 1, 8).toISOString() },
    { participantId: 'nunca', lastAccessedAt: null },
  ], 3, today);
  expect(series).toEqual([{ date: '2026-11-20', count: 1 }, { date: '2026-11-21', count: 0 }, { date: '2026-11-22', count: 2 }]);
});

it('adds the time watched of every row', () =>
  expect(totalWatchedMilliseconds([{ watchedMilliseconds: 60_000 }, { watchedMilliseconds: undefined }, { watchedMilliseconds: 30_000 }])).toBe(90_000));
