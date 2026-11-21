import { expect, it } from 'vitest';
import { filterByTraining } from './useTrainingFilter';

const rows = [{ id: 1, sipatEventId: 'sipat' }, { id: 2, sipatEventId: 'fogo' }, { id: 3, sipatEventId: null }, { id: 4 }];

it('keeps only the rows of the chosen training', () =>
  expect(filterByTraining(rows, 'fogo').map(row => row.id)).toEqual([2]));

it('keeps every row, even those of no training, when none is chosen', () =>
  expect(filterByTraining(rows, null).map(row => row.id)).toEqual([1, 2, 3, 4]));
