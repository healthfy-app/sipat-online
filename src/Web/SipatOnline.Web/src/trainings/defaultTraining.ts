/** What is needed to tell which training to open first. */
export interface TrainingTiming {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'Draft' | 'Published' | 'Cancelled';
  hasDays: boolean;
}

const time = (value: string) => new Date(value).getTime();
const byStart = (a: TrainingTiming, b: TrainingTiming) => time(a.startsAt) - time(b.startsAt);

/**
 * The training shown first: among the running ones that have days, the one that started first (it tends to end first);
 * else the next to start; else the most recent one.
 */
export function pickDefaultTraining<T extends TrainingTiming>(items: readonly T[], now: Date = new Date()): T | undefined {
  const at = now.getTime();
  const published = items.filter(item => item.status === 'Published');
  const running = published.filter(item => time(item.startsAt) <= at && at < time(item.endsAt));
  const first = [...running.filter(item => item.hasDays)].sort(byStart)[0] ?? [...running].sort(byStart)[0];
  if (first) return first;
  const next = published.filter(item => time(item.startsAt) > at).sort(byStart)[0];
  if (next) return next;
  const live = items.filter(item => item.status !== 'Draft' && item.status !== 'Cancelled');
  return [...(live.length > 0 ? live : items)].sort(byStart).at(-1);
}
