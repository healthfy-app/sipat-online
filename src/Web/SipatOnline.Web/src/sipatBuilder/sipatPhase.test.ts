import { describe, expect, it } from 'vitest';
import { sipatPhase } from './sipatPhase';

const week = { startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-14T00:00:00Z' };

describe('SIPAT phase', () => {
  it('follows the life of a SIPAT from draft to finished', () => {
    const at = (value: string) => new Date(value);
    expect(sipatPhase({ status: 'Draft', ...week }, 0, at('2026-11-01'))).toBe('draft');
    expect(sipatPhase({ status: 'Draft', ...week }, 5, at('2026-11-01'))).toBe('created');
    expect(sipatPhase({ status: 'Published', ...week }, 5, at('2026-11-01'))).toBe('published');
    expect(sipatPhase({ status: 'Published', ...week }, 5, at('2026-11-10T12:00:00Z'))).toBe('running');
    expect(sipatPhase({ status: 'Published', ...week }, 5, at('2026-11-14T00:00:00Z'))).toBe('finished');
    expect(sipatPhase({ status: 'Cancelled', ...week }, 5, at('2026-11-10'))).toBe('cancelled');
  });
});
