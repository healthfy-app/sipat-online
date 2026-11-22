import { describe, expect, it } from 'vitest';
import type { ParticipantProfile } from '@/api';
import { filterByPlacement } from './profileFilter';

const profile = (id: string, unitId: string | null, sectorId: string | null): ParticipantProfile =>
  ({ id, registrationNumber: null, email: null, phone: null, unitId, sectorId });
const people = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const profiles = new Map([
  profile('a', 'u1', 's1'), profile('b', 'u1', null), profile('c', 'u2', 's1'),
].map(item => [item.id, item]));
const ids = (list: { id: string }[]) => list.map(item => item.id);

describe('filterByPlacement', () => {
  it('keeps everyone when both filters are open', () => {
    expect(ids(filterByPlacement(people, profiles, 'all', 'all'))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('"none" returns who has no sector, including who has no profile at all', () => {
    expect(ids(filterByPlacement(people, profiles, 'all', 'none'))).toEqual(['b', 'd']);
  });
  it('an id returns only those of that sector', () => {
    expect(ids(filterByPlacement(people, profiles, 'all', 's1'))).toEqual(['a', 'c']);
  });
  it('unit and sector combine with AND', () => {
    expect(ids(filterByPlacement(people, profiles, 'u1', 's1'))).toEqual(['a']);
    expect(ids(filterByPlacement(people, profiles, 'u1', 'none'))).toEqual(['b']);
  });
});
