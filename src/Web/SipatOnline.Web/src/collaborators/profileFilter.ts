import type { ParticipantProfile } from '@/api';

/** 'all' keeps everyone, 'none' keeps who has no unit/sector, any other value is the id of the unit/sector. */
export type PlacementFilter = 'all' | 'none' | string;

const matches = (value: string | null | undefined, filter: PlacementFilter) =>
  filter === 'all' || (filter === 'none' ? !value : value === filter);

/** People that satisfy both the unit and the sector filter (AND). Someone without a profile counts as having neither. */
export function filterByPlacement<T extends { id: string }>(
  people: T[], profiles: Map<string, ParticipantProfile>, unit: PlacementFilter, sector: PlacementFilter,
): T[] {
  if (unit === 'all' && sector === 'all') return people;
  return people.filter(person => {
    const profile = profiles.get(person.id);
    return matches(profile?.unitId, unit) && matches(profile?.sectorId, sector);
  });
}
