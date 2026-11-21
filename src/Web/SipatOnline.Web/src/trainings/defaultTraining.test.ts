import { describe, expect, it } from 'vitest';
import { orderTrainings, pickDefaultTraining, type TrainingTiming } from './defaultTraining';

const now = new Date('2026-11-21T12:00:00Z');
const t = (id: string, startsAt: string, endsAt: string, extra: Partial<TrainingTiming> = {}): TrainingTiming =>
  ({ id, startsAt: `${startsAt}T00:00:00Z`, endsAt: `${endsAt}T00:00:00Z`, status: 'Published', hasDays: true, ...extra });

describe('pickDefaultTraining', () => {
  it('opens the running training that started first', () =>
    expect(pickDefaultTraining([t('fogo', '2026-11-20', '2026-11-22'), t('sipat', '2026-11-09', '2026-12-01')], now)?.id).toBe('sipat'));
  it('skips a running training without days', () =>
    expect(pickDefaultTraining([t('vazio', '2026-11-01', '2026-12-01', { hasDays: false }), t('fogo', '2026-11-20', '2026-11-22')], now)?.id).toBe('fogo'));
  it('falls back to the next one to start', () =>
    expect(pickDefaultTraining([t('velho', '2025-11-01', '2025-11-05'), t('jan', '2027-01-10', '2027-01-12'), t('dez', '2026-12-01', '2026-12-05')], now)?.id).toBe('dez'));
  it('falls back to the most recent', () =>
    expect(pickDefaultTraining([t('a', '2024-11-01', '2024-11-05'), t('b', '2025-11-01', '2025-11-05')], now)?.id).toBe('b'));
  it('ignores drafts and cancelled when anything else exists', () =>
    expect(pickDefaultTraining([t('r', '2026-11-20', '2026-11-22', { status: 'Draft' }), t('b', '2025-11-01', '2025-11-05')], now)?.id).toBe('b'));
  it('returns undefined for no trainings', () => expect(pickDefaultTraining([], now)).toBeUndefined());
});

describe('orderTrainings', () => {
  it('puts the running first, then the next to start, then the finished, newest first', () =>
    expect(orderTrainings([
      t('velho', '2024-11-01', '2024-11-05'), t('dez', '2026-12-01', '2026-12-05'), t('fogo', '2026-11-20', '2026-11-22'),
      t('ano-passado', '2025-11-01', '2025-11-05'), t('sipat', '2026-11-09', '2026-12-01'), t('jan', '2027-01-10', '2027-01-12'),
    ], now).map(item => item.id)).toEqual(['sipat', 'fogo', 'dez', 'jan', 'ano-passado', 'velho']));
});
