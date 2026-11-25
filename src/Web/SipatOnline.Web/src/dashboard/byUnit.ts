import type { ParticipantProgressStatus } from '@/participantProgress';

export interface UnitRow {
  /** null: the people with no unit. */
  unitId: string | null;
  name: string;
  people: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  completedPercent: number;
}

/**
 * How each unit is doing in the training on screen: its active people, by where they are in it. Units come in
 * alphabetical order, the people with no unit last; a unit with nobody is left out.
 */
export function byUnit(
  rows: readonly { id: string; status: ParticipantProgressStatus; isActive: boolean }[],
  profiles: ReadonlyMap<string, { unitId: string | null }>,
  units: readonly { id: string; name: string }[],
): UnitRow[] {
  const known = new Set(units.map(unit => unit.id));
  // someone whose unit is not in the list (it was put away) counts with the people of no unit
  const unitOf = (personId: string) => { const id = profiles.get(personId)?.unitId ?? null; return id !== null && known.has(id) ? id : null; };
  const line = (unitId: string | null, name: string): UnitRow[] => {
    const own = rows.filter(row => row.isActive && unitOf(row.id) === unitId);
    if (own.length === 0) return [];
    const completed = own.filter(row => row.status === 'completed').length;
    const inProgress = own.filter(row => row.status === 'in-progress').length;
    return [{
      unitId, name, people: own.length, completed, inProgress, notStarted: own.length - completed - inProgress,
      completedPercent: Math.round(completed / own.length * 100),
    }];
  };
  return [
    ...[...units].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).flatMap(unit => line(unit.id, unit.name)),
    ...line(null, 'Sem unidade'),
  ];
}
