import { expect, it } from 'vitest';
import { partWord } from './partWord';

it('calls the parts Dia when any has a date, Módulo otherwise', () => {
  expect(partWord(['2026-11-09', null])).toBe('Dia');
  expect(partWord([null, undefined])).toBe('Módulo');
  expect(partWord([])).toBe('Módulo');
});
