import { expect, it } from 'vitest';
import { filterByTraining, trainingsOfRows } from './useTrainingFilter';

const rows = [{ id: 1, sipatEventId: 'sipat' }, { id: 2, sipatEventId: 'fogo' }, { id: 3, sipatEventId: null }, { id: 4 }];

it('keeps only the rows of the chosen training', () =>
  expect(filterByTraining(rows, 'fogo').map(row => row.id)).toEqual([2]));

it('keeps every row, even those of no training, when none is chosen', () =>
  expect(filterByTraining(rows, null).map(row => row.id)).toEqual([1, 2, 3, 4]));

it('offers the trainings people have rows in, once each, without asking the admin-only list', () => {
  const options = trainingsOfRows([
    { sipatEventId: 'fogo', sipatTitle: 'Treinamento contra incêndios', sipatStartsAt: '2026-11-20T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' },
    { sipatEventId: 'sipat', sipatTitle: 'SIPAT 2026', sipatStartsAt: '2026-11-09T00:00:00Z', sipatEndsAt: '2099-01-01T00:00:00Z', sipatStatus: 'Published' },
    { sipatEventId: 'fogo', sipatTitle: 'Treinamento contra incêndios' },
    { sipatEventId: null },
  ]);
  expect(options.map(item => item.title)).toEqual(['SIPAT 2026', 'Treinamento contra incêndios']);
});
