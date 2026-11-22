import type { CompanyRegistry, ImportRow } from '@/api';

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type SheetReadResult = { rows: ImportRow[]; fatalError?: string };
type Field = Exclude<keyof ImportRow, 'row' | 'password'>;

const synonyms: Record<Field, string[]> = {
  name: ['nome', 'nome completo', 'colaborador', 'funcionario'],
  login: ['login', 'usuario'],
  registrationNumber: ['matricula', 'registro', 're', 'chapa'],
  email: ['email', 'e-mail', 'e mail'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone'],
  unit: ['unidade', 'filial', 'planta', 'unidade organizacional'],
  sector: ['setor', 'departamento', 'area'],
};

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();

/** Maps a spreadsheet header to the field it fills, ignoring accents and case. */
export function mapHeader(header: string): keyof ImportRow | null {
  const key = normalize(header);
  for (const [field, names] of Object.entries(synonyms)) if (names.includes(key)) return field as keyof ImportRow;
  return null;
}

const unknownColumns = 'Não reconhecemos as colunas. Use o modelo.';
const missingIdentity = 'A planilha precisa da coluna nome ou da coluna login/matrícula.';

/** Reads a .csv or .xlsx file; `row` is the line in the sheet (header = 1). Blank lines are skipped. */
export async function readSheet(file: File): Promise<SheetReadResult> {
  let records: string[][];
  try {
    if (/\.xlsx$/i.test(file.name)) records = await readExcelRecords(file);
    else {
      const text = (await readText(file)).replace(/^﻿/, '');
      const parsed = parseRecords(text, detectDelimiter(text));
      if (parsed.error) return { rows: [], fatalError: parsed.error };
      records = parsed.records;
    }
  } catch {
    return { rows: [], fatalError: 'Não foi possível ler o arquivo. Use o modelo (.xlsx) ou um CSV.' };
  }
  return mapRecords(records);
}

function mapRecords(records: string[][]): SheetReadResult {
  const header = records[0];
  if (!header || !header.some(cell => cell.trim())) return { rows: [], fatalError: unknownColumns };
  const columns = new Map<Field, number>();
  header.forEach((cell, index) => {
    const field = mapHeader(cell) as Field | null;
    if (field && !columns.has(field)) columns.set(field, index);
  });
  if (columns.size === 0) return { rows: [], fatalError: unknownColumns };
  if (!columns.has('name') && !columns.has('login') && !columns.has('registrationNumber')) return { rows: [], fatalError: missingIdentity };

  const rows: ImportRow[] = [];
  records.forEach((record, index) => {
    if (index === 0 || record.every(cell => !cell.trim())) return;
    const row: ImportRow = { row: index + 1 };
    columns.forEach((column, field) => { const value = (record[column] ?? '').trim(); if (value) row[field] = value; });
    rows.push(row);
  });
  if (rows.length > MAX_IMPORT_ROWS) return { rows: [], fatalError: `O limite é ${MAX_IMPORT_ROWS} linhas por carga.` };
  if (rows.length === 0) return { rows: [], fatalError: 'A planilha não tem linhas de dados.' };
  return { rows };
}

async function readExcelRecords(file: File): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await readBuffer(file));
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const width = sheet.columnCount;
  const records: string[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    records.push(Array.from({ length: width }, (_, c) => cellText(row.getCell(c + 1).value)));
  }
  return records;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(value.getUTCDate())}/${pad(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  const object = value as { result?: unknown; richText?: { text: string }[]; text?: unknown };
  if ('result' in object) return cellText(object.result);
  if (Array.isArray(object.richText)) return object.richText.map(part => part.text).join('');
  if (object.text !== undefined) return cellText(object.text);
  return '';
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.readAsText(file, 'UTF-8');
  });
}

function readBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.onload = () => (reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('read')));
    reader.readAsArrayBuffer(file);
  });
}

/** Downloads the sample sheet: the people tab plus the lists of active units and sectors. */
export async function downloadTemplate(registry: CompanyRegistry): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const units = registry.units.filter(unit => unit.isActive).map(unit => unit.name);
  const sectors = registry.sectors.filter(sector => sector.isActive).map(sector => sector.name);

  const people = workbook.addWorksheet('Participantes');
  people.addRow(['Nome', 'Login', 'Matrícula', 'E-mail', 'Telefone', 'Unidade', 'Setor']);
  people.addRow(['Maria Silva', 'maria.silva', '123456', 'maria@empresa.com.br', '(11) 98888-7777', units[0] ?? '', sectors[0] ?? '']);
  people.getRow(1).font = { bold: true };
  people.columns.forEach(column => { column.width = 22; });

  const lists = workbook.addWorksheet('Listas válidas');
  lists.addRow(['Unidades', 'Setores']);
  for (let i = 0; i < Math.max(units.length, sectors.length); i++) lists.addRow([units[i] ?? '', sectors[i] ?? '']);
  lists.getRow(1).font = { bold: true };
  lists.columns.forEach(column => { column.width = 28; });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-carga-participantes.xlsx';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function detectDelimiter(content: string): string {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;

  for (let index = 0; index < content.length; index++) {
    const character = content[index];
    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (character === '\r' || character === '\n')) {
      break;
    } else if (!inQuotes && character === ',') {
      commas++;
    } else if (!inQuotes && character === ';') {
      semicolons++;
    }
  }

  return semicolons > commas ? ';' : ',';
}

/** Keeps blank records so the line numbers stay those of the sheet. */
function parseRecords(content: string, delimiter: string): { records: string[][]; error?: string } {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let inQuotes = false;
  let afterQuote = false;

  const finishCell = () => {
    record.push(cell);
    cell = '';
    afterQuote = false;
  };
  const finishRecord = () => {
    finishCell();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < content.length; index++) {
    const character = content[index];

    if (inQuotes) {
      if (character === '"') {
        if (content[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === delimiter) {
        finishCell();
      } else if (character === '\r' || character === '\n') {
        finishRecord();
        if (character === '\r' && content[index + 1] === '\n') index++;
      } else if (character !== ' ' && character !== '\t') {
        return { records: [], error: 'O CSV contém aspas ou caracteres inválidos após um campo entre aspas.' };
      }
      continue;
    }

    if (character === '"' && cell.trim() === '') {
      cell = '';
      inQuotes = true;
    } else if (character === '"') {
      return { records: [], error: 'O CSV contém aspas em posição inválida.' };
    } else if (character === delimiter) {
      finishCell();
    } else if (character === '\r' || character === '\n') {
      finishRecord();
      if (character === '\r' && content[index + 1] === '\n') index++;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    return { records: [], error: 'O CSV termina com aspas sem fechamento.' };
  }
  if (cell.length > 0 || record.length > 0 || afterQuote) {
    finishRecord();
  }

  return { records };
}
