import { describe, expect, it } from 'vitest';
import type { GameModule } from '@/api';
import { csvToPlan, matchGame, matchVideo, parseCsv, planToCsv } from './csv';
import { addDays, dayDuration, formatClock, formatSpan, fromProgramDay, newDay, shortDate, toProgramDay, videoCode, type Catalog } from './model';

const video = (id: string, title: string, minutes: number) => ({ id, title, durationMs: minutes * 60000, code: videoCode(title) });
const game = (id: string, title: string): GameModule => ({ id, title, gameType: 'Quiz', questions: [], createdAt: '', usageCount: 0 });

const catalog: Catalog = {
  videos: new Map([
    video('v1', 'A1V4-Ergonomia e doenças psicossociais', 3),
    video('v2', 'A5V1-Ferramentas de atenção e concentração', 2),
    video('v3', 'A1V7-A dinâmica do trabalho sentado', 4),
  ].map(item => [item.id, item])),
  subjects: [],
  games: new Map([game('g1', 'Caça palavras'), game('g2', 'Quiz de EPI')].map(item => [item.id, item])),
};

describe('csv reading', () => {
  it('reads semicolons, quoted cells with separators and doubled quotes, in any line ending', () => {
    expect(parseCsv('a;b;c\r\n"x;y";"he said ""hi""";z\n')).toEqual([['a', 'b', 'c'], ['x;y', 'he said "hi"', 'z']]);
  });
  it('detects commas and tabs, and skips blank lines and the byte order mark', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('matching the catalog', () => {
  it('finds a video by code, by full title, by a unique start or by a unique part, ignoring accents and case', () => {
    expect(matchVideo('a1v4', catalog)).toBe('v1');
    expect(matchVideo('A5V1-Ferramentas de atenção e concentração', catalog)).toBe('v2');
    expect(matchVideo('a5v1-ferramentas de atencao e concentracao', catalog)).toBe('v2');
    expect(matchVideo('A1V7', catalog)).toBe('v3');
    expect(matchVideo('dinamica do trabalho', catalog)).toBe('v3');
    expect(matchVideo('A9V9', catalog)).toBeNull();
    expect(matchVideo('a', catalog)).toBeNull();
  });
  it('finds a game by name', () => {
    expect(matchGame('caca palavras', catalog)).toBe('g1');
    expect(matchGame('quiz', catalog)).toBe('g2');
    expect(matchGame('forca', catalog)).toBeNull();
  });
});

describe('plan to csv and back', () => {
  it('keeps titles, dates, subjects, videos and games', () => {
    const day = newDay(0, '2026-11-09');
    day.title = 'Dia 1 · Boa postura; mais saúde';
    day.subject = 'Ergonomia';
    day.videos[0] = 'v1'; day.videos[1] = 'v3';
    day.games[0] = 'g1';
    const csv = planToCsv([day], catalog);
    expect(csv.startsWith('﻿Dia;Data;Título do dia;Assunto;Vídeo 1')).toBe(true);
    const back = csvToPlan(csv, catalog);
    expect(back.issues).toEqual([]);
    expect(back.matched).toBe(3);
    expect(back.days).toHaveLength(1);
    expect(toProgramDay(back.days[0])).toEqual({
      title: 'Dia 1 · Boa postura; mais saúde', date: '2026-11-09', subject: 'Ergonomia', videoIds: ['v1', 'v3'], gameIds: ['g1'],
    });
  });

  it('reads the sheet layout, with dd/mm/yyyy dates, codes, placeholders and a header that is not in order', () => {
    const text = [
      'Dia;Data;Título;Assunto;Vídeo 1;Vídeo 2;Vídeo 3;Jogo 1',
      '1;09/11/2026;Boa postura;Ergonomia;A1V4;CLIQUE E SELECIONE O VIDEO DESEJADO;-;Caça palavras',
      '2;31/02/2026;;;A5V1;A9V9;;Forca',
    ].join('\n');
    const result = csvToPlan(text, catalog);
    expect(result.days.map(day => toProgramDay(day))).toEqual([
      { title: 'Boa postura', date: '2026-11-09', subject: 'Ergonomia', videoIds: ['v1'], gameIds: ['g1'] },
      { title: 'Dia 2', date: null, subject: null, videoIds: ['v2'], gameIds: [] },
    ]);
    expect(result.issues.map(issue => `${issue.row} ${issue.column} ${issue.value}`)).toEqual([
      '3 Data 31/02/2026', '3 Vídeo 2 A9V9', '3 Jogo 1 Forca',
    ]);
  });

  it('explains a file that has no video columns or is empty', () => {
    expect(csvToPlan('', catalog).issues[0].reason).toBe('O arquivo está vazio.');
    expect(csvToPlan('Dia;Data\n1;2026-11-09', catalog).issues[0].reason).toContain('Vídeo 1');
  });

  it('ignores days beyond the limit and says so once', () => {
    const lines = ['Dia;Vídeo 1', ...Array.from({ length: 16 }, (_, index) => `${index + 1};A1V4`)];
    const result = csvToPlan(lines.join('\n'), catalog);
    expect(result.days).toHaveLength(14);
    expect(result.issues.filter(issue => issue.reason.includes('até 14'))).toHaveLength(1);
  });
});

describe('model helpers', () => {
  it('adds up the time of the day and formats it like the sheet', () => {
    const day = newDay(0);
    day.videos[0] = 'v1'; day.videos[1] = 'v2';
    expect(dayDuration(day, catalog)).toBe(5 * 60000);
    expect(formatClock(5 * 60000)).toBe('0:05:00');
    expect(formatClock(1 * 3600000 + 27 * 60000 + 57000)).toBe('1:27:57');
    expect(formatSpan(22 * 60000)).toBe('22 min');
    expect(formatSpan(88 * 60000)).toBe('1 h 28 min');
  });
  it('moves dates across month ends and shows the weekday', () => {
    expect(addDays('2026-11-29', 2)).toBe('2026-12-01');
    expect(shortDate('2026-11-09')).toMatch(/09\/11/);
    expect(shortDate('')).toBe('');
  });
  it('keeps the id of a saved day and drops empty slots when saving', () => {
    const slots = fromProgramDay({ id: 'd1', title: 'Dia 1', date: null, subject: null, videoIds: ['v1'], gameIds: [] });
    expect(slots.videos).toHaveLength(5);
    expect(toProgramDay(slots)).toEqual({ id: 'd1', title: 'Dia 1', date: null, subject: null, videoIds: ['v1'], gameIds: [] });
  });
});
