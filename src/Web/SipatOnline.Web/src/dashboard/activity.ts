import type { LearningParticipantProgress } from '../api';
import { localDateKey } from './companyDashboardData';

export interface DayCount { date: string; count: number }

/**
 * How many different people came in on each of the last `days` days (today included), from the last access of each of
 * their days. A person counts once a day however many days of training they opened. Days nobody came in count 0.
 */
export function activeParticipantsByDay(
  participation: readonly Pick<LearningParticipantProgress, 'participantId' | 'lastAccessedAt'>[],
  days = 14,
  today: Date = new Date(),
): DayCount[] {
  const people = new Map<string, Set<string>>();
  for (const row of participation) {
    if (!row.lastAccessedAt) continue;
    const key = localDateKey(new Date(row.lastAccessedAt));
    (people.get(key) ?? people.set(key, new Set()).get(key)!).add(row.participantId);
  }
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - index));
    const date = localDateKey(day);
    return { date, count: people.get(date)?.size ?? 0 };
  });
}

/** The total time watched, in milliseconds, across the rows. */
export function totalWatchedMilliseconds(participation: readonly Pick<LearningParticipantProgress, 'watchedMilliseconds'>[]): number {
  return participation.reduce((sum, row) => sum + (row.watchedMilliseconds ?? 0), 0);
}
