import { describe, expect, it } from 'vitest';
import type { ParticipantProgressStatus } from '@/participantProgress';
import { byUnit } from './byUnit';

const row = (id: string, status: ParticipantProgressStatus, isActive = true) => ({ id, status, isActive });
const units = [{ id: 'sp', name: 'São Paulo' }, { id: 'minas', name: 'Minas Gerais' }, { id: 'rio', name: 'Rio de Janeiro' }];
const profiles = new Map([
  ['a', { unitId: 'sp' }], ['b', { unitId: 'sp' }], ['c', { unitId: 'sp' }], ['d', { unitId: 'minas' }], ['e', { unitId: null }], ['f', { unitId: 'sp' }],
]);

describe('how each unit is doing', () => {
  it('counts the active people of each unit by where they are in the training, with those of no unit last', () => {
    const rows = [row('a', 'completed'), row('b', 'completed'), row('c', 'not-started'), row('d', 'in-progress'), row('e', 'in-progress'), row('f', 'completed', false)];
    expect(byUnit(rows, profiles, units)).toEqual([
      { unitId: 'minas', name: 'Minas Gerais', people: 1, completed: 0, inProgress: 1, notStarted: 0, completedPercent: 0 },
      { unitId: 'sp', name: 'São Paulo', people: 3, completed: 2, inProgress: 0, notStarted: 1, completedPercent: 67 },
      { unitId: null, name: 'Sem unidade', people: 1, completed: 0, inProgress: 1, notStarted: 0, completedPercent: 0 },
    ]);
  });

  it('leaves out a unit with nobody, and the line of no unit when everyone has one', () => {
    expect(byUnit([row('a', 'completed')], profiles, units)).toEqual([
      { unitId: 'sp', name: 'São Paulo', people: 1, completed: 1, inProgress: 0, notStarted: 0, completedPercent: 100 },
    ]);
  });

  it('counts someone with no days yet as not started', () => {
    expect(byUnit([row('d', 'no-tracks')], profiles, units)[0]).toMatchObject({ people: 1, notStarted: 1 });
  });
});
