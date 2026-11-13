import {
  defaultGameRows, defaultVideoRows, isValidDate, maxDays, maxGameRows, maxVideoRows, newDay, normalize,
  type Catalog, type DaySlots,
} from './model';

/** Reads CSV text: `;`, `,` or tab as separator, "quoted ; cells", doubled quotes and any line ending. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator = [';', '\t', ','].map(char => ({ char, count: firstLine.split(char).length - 1 })).sort((a, b) => b.count - a.count)[0].char;
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows.map(values => values.map(value => value.trim()));
}

const quote = (value: string) => (/[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The plan as a CSV the sheet users can open in Excel: one row per day, `;` separated (Brazilian Excel). */
export function planToCsv(days: DaySlots[], catalog: Catalog): string {
  const videoColumns = Math.max(defaultVideoRows, ...days.map(day => day.videos.length));
  const gameColumns = Math.max(defaultGameRows, ...days.map(day => day.games.length));
  const header = ['Dia', 'Data', 'Título do dia', 'Assunto',
    ...Array.from({ length: videoColumns }, (_, index) => `Vídeo ${index + 1}`),
    ...Array.from({ length: gameColumns }, (_, index) => `Jogo ${index + 1}`)];
  const lines = days.map((day, index) => [
    String(index + 1), day.date, day.title, day.subject,
    ...Array.from({ length: videoColumns }, (_, slot) => (day.videos[slot] ? catalog.videos.get(day.videos[slot]!)?.title ?? '' : '')),
    ...Array.from({ length: gameColumns }, (_, slot) => (day.games[slot] ? catalog.games.get(day.games[slot]!)?.title ?? '' : '')),
  ]);
  return '﻿' + [header, ...lines].map(cells => cells.map(quote).join(';')).join('\r\n') + '\r\n';
}

/** An example for the "baixar modelo" button, with the first videos and games of the catalog. */
export function sampleCsv(catalog: Catalog): string {
  const videos = [...catalog.videos.values()];
  const games = [...catalog.games.values()];
  const day = (index: number): DaySlots => {
    const planned = newDay(index, `2026-11-${String(9 + index).padStart(2, '0')}`);
    planned.title = `Dia ${index + 1} · Escreva o slogan`;
    videos.slice(index * 3, index * 3 + 3).forEach((video, slot) => { planned.videos[slot] = video.id; });
    if (games[index]) planned.games[0] = games[index].id;
    return planned;
  };
  return planToCsv([day(0), day(1)], catalog);
}

export function matchVideo(value: string, catalog: Catalog): string | null {
  const wanted = normalize(value);
  if (!wanted) return null;
  const all = [...catalog.videos.values()];
  const code = /^[a-z]\d+v\d+$/i.exec(value.trim())?.[0].toUpperCase();
  if (code) return all.find(video => video.code === code)?.id ?? null;
  const exact = all.find(video => normalize(video.title) === wanted);
  if (exact) return exact.id;
  const leading = /^([a-z]\d+v\d+)\s*[-–—:]/i.exec(value.trim())?.[1].toUpperCase();
  if (leading) {
    const byCode = all.find(video => video.code === leading);
    if (byCode) return byCode.id;
  }
  const starts = all.filter(video => normalize(video.title).startsWith(wanted));
  if (starts.length === 1) return starts[0].id;
  const contains = all.filter(video => normalize(video.title).includes(wanted));
  return contains.length === 1 ? contains[0].id : null;
}

export function matchGame(value: string, catalog: Catalog): string | null {
  const wanted = normalize(value);
  if (!wanted) return null;
  const all = [...catalog.games.values()];
  const exact = all.find(game => normalize(game.title) === wanted);
  if (exact) return exact.id;
  const starts = all.filter(game => normalize(game.title).startsWith(wanted));
  if (starts.length === 1) return starts[0].id;
  const contains = all.filter(game => normalize(game.title).includes(wanted));
  return contains.length === 1 ? contains[0].id : null;
}

export interface ImportIssue { row: number; column: string; value: string; reason: string }
export interface ImportResult { days: DaySlots[]; issues: ImportIssue[]; matched: number }

function parseDate(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (isValidDate(text)) return text;
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (local) {
    const iso = `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
    return isValidDate(iso) ? iso : '';
  }
  return '';
}

/**
 * Turns a CSV into days. Columns are found by header name (Data, Título, Assunto, Vídeo n, Jogo n), so the sheet's
 * own layout works. Cells that do not match the catalog are reported and left empty; nothing is silently guessed.
 */
export function csvToPlan(text: string, catalog: Catalog): ImportResult {
  const rows = parseCsv(text);
  const issues: ImportIssue[] = [];
  if (rows.length === 0) return { days: [], issues: [{ row: 0, column: '', value: '', reason: 'O arquivo está vazio.' }], matched: 0 };

  const header = rows[0].map(cell => normalize(cell));
  const find = (predicate: (name: string) => boolean) => header.findIndex(predicate);
  const titleColumn = find(name => name.startsWith('titulo') || name.includes('slogan'));
  const dateColumn = find(name => name === 'data' || name.startsWith('data '));
  const subjectColumn = find(name => name.startsWith('assunto'));
  const videoColumns = header.flatMap((name, index) => (/^video\s*\d*$/.test(name) ? [index] : []));
  const gameColumns = header.flatMap((name, index) => (/^jogo\s*\d*$/.test(name) ? [index] : []));
  if (videoColumns.length === 0) {
    return { days: [], issues: [{ row: 1, column: '', value: rows[0].join(';'), reason: 'Não encontrei colunas "Vídeo 1", "Vídeo 2"... na primeira linha.' }], matched: 0 };
  }

  const days: DaySlots[] = [];
  let matched = 0;
  let overflow = false;
  rows.slice(1).forEach((cells, rowIndex) => {
    if (days.length >= maxDays) {
      if (!overflow) issues.push({ row: rowIndex + 2, column: 'Dia', value: '', reason: `O programa aceita até ${maxDays} dias; o resto foi ignorado.` });
      overflow = true;
      return;
    }
    const day = newDay(days.length);
    const cell = (column: number) => (column >= 0 ? cells[column] ?? '' : '');
    const title = cell(titleColumn).trim();
    if (title) day.title = title;
    const rawDate = cell(dateColumn);
    day.date = parseDate(rawDate);
    if (rawDate.trim() && !day.date) issues.push({ row: rowIndex + 2, column: 'Data', value: rawDate, reason: 'Data inválida. Use dd/mm/aaaa.' });
    day.subject = cell(subjectColumn).trim();

    const videos: (string | null)[] = [];
    videoColumns.forEach((column, slot) => {
      const value = cell(column).trim();
      if (!value || value === '-' || /^clique e selecione/i.test(value)) { videos.push(null); return; }
      const id = matchVideo(value, catalog);
      if (id) matched++; else issues.push({ row: rowIndex + 2, column: `Vídeo ${slot + 1}`, value, reason: 'Não encontrei esse vídeo no catálogo.' });
      videos.push(id);
    });
    const games: (string | null)[] = [];
    gameColumns.forEach((column, slot) => {
      const value = cell(column).trim();
      if (!value || value === '-' || /^jogos?,/i.test(value) || /^clique e selecione/i.test(value)) { games.push(null); return; }
      const id = matchGame(value, catalog);
      if (id) matched++; else issues.push({ row: rowIndex + 2, column: `Jogo ${slot + 1}`, value, reason: 'Não encontrei esse jogo ou quiz no catálogo.' });
      games.push(id);
    });
    day.videos = [...videos.slice(0, maxVideoRows)];
    while (day.videos.length < defaultVideoRows) day.videos.push(null);
    day.games = [...games.slice(0, maxGameRows)];
    while (day.games.length < defaultGameRows) day.games.push(null);
    days.push(day);
  });
  return { days, issues, matched };
}
