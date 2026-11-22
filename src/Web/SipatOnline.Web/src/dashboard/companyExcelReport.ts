import type { Borders, Cell, Fill, Font, Workbook, Worksheet } from 'exceljs';
import type { LearningParticipantProgress } from '../api';
import { participantProgressStatuses, type CompanyLearningOverview, type ParticipantProgressStatus } from '../participantProgress';
import {
  completionsByDate,
  parseDateKey,
  statusColors,
  statusLabels,
  statusShortLabels,
  type ParticipantRow,
} from './companyDashboardData';

export interface CompanyExcelReportInput {
  companyName: string;
  overview: CompanyLearningOverview;
  rows: readonly ParticipantRow[];
  participation: readonly LearningParticipantProgress[];
  /** Cor da marca da empresa (hex). Cai no verde do produto se for clara demais. */
  brandColor?: string;
  generatedAt?: Date;
  /** The training the report is about; absent when it covers every training. */
  trainingTitle?: string;
}

const INK = '1F2A24';
const MUTED = '6B7A72';
const HAIRLINE = 'E1E6E3';
const ZEBRA = 'F6F8F7';
const PAPER = 'FFFFFF';
const FALLBACK_BRAND = '14694B';
const MS_PER_DAY = 86_400_000;
const FONT = 'Calibri';

/** Planilha bonita, pronta para imprimir e filtrar, gerada no navegador (sem custo de servidor). */
export async function buildCompanyExcelReport(input: CompanyExcelReportInput): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const generatedAt = input.generatedAt ?? new Date();
  workbook.creator = 'SIPAT Online';
  workbook.company = input.companyName;
  workbook.title = `Relatório de treinamentos · ${input.companyName}`;
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const brand = readableBrand(input.brandColor);
  addSummarySheet(workbook, input, brand, generatedAt);
  addParticipantsSheet(workbook, input, brand);
  addHeatmapSheet(workbook, input, brand);
  addDetailSheet(workbook, input, brand);
  return workbook;
}

export async function downloadCompanyExcelReport(input: CompanyExcelReportInput): Promise<string> {
  const workbook = await buildCompanyExcelReport(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = excelReportFileName(input.companyName, input.generatedAt ?? new Date(), input.trainingTitle);
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

export function excelReportFileName(companyName: string, date: Date, trainingTitle?: string): string {
  const slugOf = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = slugOf(companyName) || 'empresa';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `relatorio-${(trainingTitle && slugOf(trainingTitle)) || 'treinamentos'}-${slug}-${day}.xlsx`;
}

// ── Resumo ──────────────────────────────────────────────────────────────────

function addSummarySheet(workbook: Workbook, input: CompanyExcelReportInput, brand: string, generatedAt: Date) {
  const { overview } = input;
  const sheet = workbook.addWorksheet('Resumo', {
    properties: { tabColor: { argb: `FF${brand}` } },
    views: [{ showGridLines: false }],
  });
  sheet.columns = [
    { width: 3 }, { width: 44 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 3 },
  ];

  // Faixa de título
  sheet.mergeCells('B2:F2');
  const title = sheet.getCell('B2');
  title.value = input.trainingTitle ? `Relatório · ${input.trainingTitle}` : 'Relatório de treinamentos';
  title.font = font({ size: 22, bold: true, color: PAPER });
  title.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(2).height = 42;
  sheet.mergeCells('B3:F3');
  const subtitle = sheet.getCell('B3');
  subtitle.value = `${input.companyName}  ·  gerado em ${generatedAt.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`;
  subtitle.font = font({ size: 11, color: PAPER });
  subtitle.alignment = { vertical: 'middle', indent: 1 };
  sheet.getRow(3).height = 24;
  for (const address of ['B2', 'B3']) sheet.getCell(address).fill = solid(brand);
  for (let column = 2; column <= 6; column++) {
    sheet.getRow(2).getCell(column).fill = solid(brand);
    sheet.getRow(3).getCell(column).fill = solid(brand);
  }

  // Indicadores (cartões)
  const kpis: { label: string; value: number; format: string; note: string }[] = [
    { label: 'Participantes', value: overview.participantCount, format: '#,##0', note: `${overview.activeParticipantCount} ativos` },
    { label: 'Dias entregues', value: overview.assignedTrackCount, format: '#,##0', note: `${overview.trackProgress.length} dias distintos` },
    { label: 'Dias concluídos', value: overview.completedTrackCount, format: '#,##0', note: `de ${overview.assignedTrackCount} entregues` },
    { label: 'Vídeos concluídos', value: overview.completedLessonCount, format: '#,##0', note: `de ${overview.lessonCount} entregues` },
    { label: 'Progresso geral', value: overview.overallProgressPercentage / 100, format: '0%', note: 'vídeos concluídos / entregues' },
  ];
  // B5:F7 — um cartão por coluna (B..F)
  kpis.forEach((kpi, index) => {
    const column = 2 + index;
    const label = sheet.getRow(5).getCell(column);
    const value = sheet.getRow(6).getCell(column);
    const note = sheet.getRow(7).getCell(column);
    label.value = kpi.label.toUpperCase();
    label.font = font({ size: 9, bold: true, color: MUTED });
    value.value = kpi.value;
    value.numFmt = kpi.format;
    value.font = font({ size: 24, bold: true, color: index === 4 ? brand : INK });
    note.value = kpi.note;
    note.font = font({ size: 9, color: MUTED });
    for (const cell of [label, value, note]) {
      cell.fill = solid(ZEBRA);
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    }
    label.border = { top: { style: 'medium', color: { argb: `FF${brand}` } } };
  });
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 38;
  sheet.getRow(7).height = 30;
  // O cartão "Participantes" ocupa a coluna larga; mantém o número à esquerda.

  // Situação dos participantes
  let row = 10;
  row = sectionTitle(sheet, row, 'Situação dos participantes', 'Quantas pessoas estão em cada etapa');
  headerRow(sheet, row, ['Situação', 'Pessoas', 'Parcela'], brand, 2);
  const statusStart = row + 1;
  const total = Math.max(1, overview.participantCount);
  for (const status of participantProgressStatuses) {
    row++;
    const count = overview.participantDistribution.find((item) => item.status === status)?.count ?? 0;
    const values = [statusLabels[status], count, count / total];
    writeRow(sheet, row, values, 2, row % 2 === 0);
    const name = sheet.getRow(row).getCell(2);
    name.value = { richText: [
      { text: '●  ', font: font({ size: 12, color: hex(statusColors[status]) }) },
      { text: statusLabels[status], font: font({ color: INK }) },
    ] };
    sheet.getRow(row).getCell(3).numFmt = '#,##0';
    sheet.getRow(row).getCell(4).numFmt = '0%';
  }
  dataBar(sheet, `D${statusStart}:D${row}`, 1);
  totalRow(sheet, ++row, ['Total', overview.participantCount, overview.participantCount > 0 ? 1 : 0], 2, ['', '#,##0', '0%']);

  // Conclusão por dia
  row += 3;
  row = sectionTitle(sheet, row, 'Conclusão por dia', 'Do menor para o maior progresso médio — onde agir primeiro');
  headerRow(sheet, row, ['Dia', 'Receberam', 'Concluíram', 'Taxa de conclusão', 'Progresso médio'], brand, 2);
  const trackStart = row + 1;
  const tracks = [...overview.trackProgress].sort((a, b) => a.averageProgressPercentage - b.averageProgressPercentage
    || a.trackTitle.localeCompare(b.trackTitle, 'pt-BR'));
  for (const track of tracks) {
    row++;
    writeRow(sheet, row, [
      track.trackTitle,
      track.participantCount,
      track.completedParticipantCount,
      track.participantCount === 0 ? 0 : track.completedParticipantCount / track.participantCount,
      track.averageProgressPercentage / 100,
    ], 2, row % 2 === 0);
    sheet.getRow(row).getCell(3).numFmt = '#,##0';
    sheet.getRow(row).getCell(4).numFmt = '#,##0';
    sheet.getRow(row).getCell(5).numFmt = '0%';
    sheet.getRow(row).getCell(6).numFmt = '0%';
  }
  if (tracks.length === 0) {
    row++;
    emptyRow(sheet, row, 'Nenhum dia entregue ainda.', 2, 6);
  } else {
    dataBar(sheet, `E${trackStart}:E${row}`, 1);
    dataBar(sheet, `F${trackStart}:F${row}`, 1);
  }

  // Ritmo de conclusão
  row += 3;
  row = sectionTitle(sheet, row, 'Dias concluídos por data', 'Ritmo de conclusão durante a semana');
  headerRow(sheet, row, ['Data', 'Dias concluídos'], brand, 2);
  const timeline = completionsByDate(input.participation);
  const timelineStart = row + 1;
  for (const point of timeline) {
    row++;
    writeRow(sheet, row, [excelDate(parseDateKey(point.date)), point.count], 2, row % 2 === 0);
    sheet.getRow(row).getCell(2).numFmt = '[$-416]ddd, dd/mm/yyyy';
    sheet.getRow(row).getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    sheet.getRow(row).getCell(3).numFmt = '#,##0';
  }
  if (timeline.length === 0) {
    row++;
    emptyRow(sheet, row, 'Ninguém concluiu um dia ainda.', 2, 3);
  } else {
    dataBar(sheet, `C${timelineStart}:C${row}`);
  }

  row += 2;
  sheet.mergeCells(row, 2, row, 6);
  const footnote = sheet.getCell(row, 2);
  footnote.value = 'Veja também as abas Colaboradores, Mapa de progresso e Detalhe por dia.';
  footnote.font = font({ size: 9, italic: true, color: MUTED });

  printSetup(sheet, input.companyName, 'portrait');
}

// ── Colaboradores ───────────────────────────────────────────────────────────

function addParticipantsSheet(workbook: Workbook, input: CompanyExcelReportInput, brand: string) {
  const sheet = workbook.addWorksheet('Colaboradores', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1, showGridLines: false }],
  });
  const columns = [
    { header: 'Nome', width: 32 },
    { header: 'Login', width: 18 },
    { header: 'Conta', width: 10 },
    { header: 'Situação', width: 16 },
    { header: 'Dias entregues', width: 10 },
    { header: 'Dias concluídos', width: 11 },
    { header: 'Vídeos', width: 9 },
    { header: 'Vídeos concluídos', width: 11 },
    { header: 'Progresso', width: 14 },
    { header: 'Tempo assistido', width: 12 },
    { header: 'Último acesso', width: 18 },
  ];
  sheet.columns = columns.map(({ width }) => ({ width }));
  headerRow(sheet, 1, columns.map(({ header }) => header), brand, 1);

  const rows = [...input.rows].sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  rows.forEach((participant, index) => {
    const rowNumber = index + 2;
    writeRow(sheet, rowNumber, [
      participant.displayName,
      participant.loginIdentifier,
      participant.isActive ? 'Ativo' : 'Inativo',
      statusShortLabels[participant.status],
      participant.assignedTrackCount,
      participant.completedTrackCount,
      participant.lessonCount,
      participant.completedLessonCount,
      participant.progressPercentage / 100,
      participant.watchedMilliseconds / MS_PER_DAY,
      participant.lastAccessedAt ? excelDate(new Date(participant.lastAccessedAt)) : null,
    ], 1, index % 2 === 1);
    const excelRow = sheet.getRow(rowNumber);
    statusPill(excelRow.getCell(4), participant.status);
    for (const column of [5, 6, 7, 8]) excelRow.getCell(column).numFmt = '#,##0';
    excelRow.getCell(9).numFmt = '0%';
    excelRow.getCell(10).numFmt = '[h]:mm';
    excelRow.getCell(11).numFmt = 'dd/mm/yyyy hh:mm';
    if (!participant.lastAccessedAt) {
      excelRow.getCell(11).value = '—';
      excelRow.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  const last = rows.length + 1;
  if (rows.length === 0) {
    emptyRow(sheet, 2, 'Nenhum participante cadastrado.', 1, columns.length);
  } else {
    dataBar(sheet, `I2:I${last}`, 1);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: columns.length } };
    totalRow(sheet, last + 1, [
      `${rows.length} participantes`, '', '', '',
      { formula: `SUM(E2:E${last})` }, { formula: `SUM(F2:F${last})` },
      { formula: `SUM(G2:G${last})` }, { formula: `SUM(H2:H${last})` },
      { formula: `IF(G${last + 1}=0,0,H${last + 1}/G${last + 1})` },
      { formula: `SUM(J2:J${last})` }, '',
    ], 1, ['', '', '', '', '#,##0', '#,##0', '#,##0', '#,##0', '0%', '[h]:mm', '']);
  }
  printSetup(sheet, input.companyName, 'landscape', '$1:$1');
}

// ── Mapa de progresso (pessoa × dia) ────────────────────────────────────────

function addHeatmapSheet(workbook: Workbook, input: CompanyExcelReportInput, brand: string) {
  const sheet = workbook.addWorksheet('Mapa de progresso', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1, showGridLines: false }],
  });
  const tracks = [...input.overview.trackProgress].sort((a, b) => a.trackTitle.localeCompare(b.trackTitle, 'pt-BR'));
  sheet.getColumn(1).width = 32;
  tracks.forEach((_, index) => { sheet.getColumn(index + 2).width = 13; });

  const lastColumn = Math.max(2, tracks.length + 1);
  sheet.mergeCells(1, 1, 1, lastColumn);
  const caption = sheet.getCell(1, 1);
  caption.value = 'Progresso de cada pessoa em cada dia — quanto mais escuro, mais avançado. Vazio = dia não entregue.';
  caption.font = font({ size: 10, italic: true, color: MUTED });
  caption.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 22;

  headerRow(sheet, 3, ['Colaborador', ...tracks.map((track) => track.trackTitle)], brand, 1);
  sheet.getRow(3).height = 48;
  for (let column = 2; column <= tracks.length + 1; column++) {
    sheet.getRow(3).getCell(column).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  const byKey = new Map(input.participation.map((track) => [`${track.participantId}|${track.trackId}`, track]));
  const people = [...input.rows]
    .filter((row) => row.assignedTrackCount > 0)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
  people.forEach((person, index) => {
    const rowNumber = index + 4;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = person.displayName;
    row.getCell(1).font = font({ color: INK });
    row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
    row.getCell(1).border = hairlineBottom();
    tracks.forEach((track, trackIndex) => {
      const cell = row.getCell(trackIndex + 2);
      const progress = byKey.get(`${person.id}|${track.trackId}`);
      cell.value = progress ? Math.min(100, Math.max(0, progress.progressPercentage)) / 100 : null;
      cell.numFmt = '0%';
      cell.font = font({ size: 10, color: INK });
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thin(PAPER, 'thin'), bottom: thin(PAPER, 'thin'), left: thin(PAPER, 'thin'), right: thin(PAPER, 'thin') };
    });
    row.height = 20;
  });

  if (people.length === 0 || tracks.length === 0) {
    emptyRow(sheet, 4, 'Nenhum dia entregue ainda.', 1, lastColumn);
  } else {
    const lastRow = people.length + 3;
    const range = `B4:${columnLetter(tracks.length + 1)}${lastRow}`;
    sheet.addConditionalFormatting({
      ref: range,
      rules: [{
        type: 'colorScale',
        priority: 1,
        cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.5 }, { type: 'num', value: 1 }],
        color: [{ argb: 'FFF1F4F2' }, { argb: `FF${mix(hex(statusColors.completed), 'FFFFFF', 0.55)}` }, { argb: `FF${hex(statusColors.completed)}` }],
      }],
    });
    // Texto branco onde o fundo é escuro (100%).
    sheet.addConditionalFormatting({
      ref: range,
      rules: [{
        type: 'cellIs', operator: 'greaterThan', formulae: ['0.79'], priority: 2,
        style: { font: { color: { argb: 'FFFFFFFF' }, bold: true } },
      }],
    });
  }
  printSetup(sheet, input.companyName, 'landscape', '$3:$3');
}

// ── Detalhe por dia (pessoa × dia, uma linha cada) ──────────────────────────

function addDetailSheet(workbook: Workbook, input: CompanyExcelReportInput, brand: string) {
  const sheet = workbook.addWorksheet('Detalhe por dia', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
  });
  const columns = [
    { header: 'Nome', width: 30 },
    { header: 'Login', width: 18 },
    { header: 'Dia', width: 40 },
    { header: 'Vídeos', width: 8 },
    { header: 'Vídeos concluídos', width: 11 },
    { header: 'Progresso', width: 13 },
    { header: 'Situação', width: 14 },
    { header: 'Tempo assistido', width: 12 },
    { header: 'Recebido em', width: 13 },
    { header: 'Concluído em', width: 17 },
    { header: 'Último acesso', width: 17 },
  ];
  sheet.columns = columns.map(({ width }) => ({ width }));
  headerRow(sheet, 1, columns.map(({ header }) => header), brand, 1);

  const records = [...input.participation].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'pt-BR') || a.trackTitle.localeCompare(b.trackTitle, 'pt-BR'));
  records.forEach((track, index) => {
    const rowNumber = index + 2;
    const status: ParticipantProgressStatus = track.isCompleted ? 'completed'
      : track.completedLessonCount > 0 || track.progressPercentage > 0 ? 'in-progress' : 'not-started';
    writeRow(sheet, rowNumber, [
      track.displayName,
      track.loginIdentifier,
      track.trackTitle,
      track.lessonCount,
      track.completedLessonCount,
      Math.min(100, Math.max(0, track.progressPercentage)) / 100,
      statusShortLabels[status],
      (track.watchedMilliseconds ?? 0) / MS_PER_DAY,
      dateOrNull(track.assignedAt),
      dateOrNull(track.completedAt),
      dateOrNull(track.lastAccessedAt),
    ], 1, index % 2 === 1);
    const row = sheet.getRow(rowNumber);
    statusPill(row.getCell(7), status);
    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '#,##0';
    row.getCell(6).numFmt = '0%';
    row.getCell(8).numFmt = '[h]:mm';
    row.getCell(9).numFmt = 'dd/mm/yyyy';
    row.getCell(10).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(11).numFmt = 'dd/mm/yyyy hh:mm';
  });

  if (records.length === 0) {
    emptyRow(sheet, 2, 'Nenhum dia entregue ainda.', 1, columns.length);
  } else {
    const last = records.length + 1;
    dataBar(sheet, `F2:F${last}`, 1);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: columns.length } };
  }
  printSetup(sheet, input.companyName, 'landscape', '$1:$1');
}

// ── Peças de estilo ─────────────────────────────────────────────────────────

type CellValue = Cell['value'];

function sectionTitle(sheet: Worksheet, row: number, title: string, note: string): number {
  const titleCell = sheet.getCell(row, 2);
  titleCell.value = title;
  titleCell.font = font({ size: 14, bold: true, color: INK });
  const noteCell = sheet.getCell(row + 1, 2);
  noteCell.value = note;
  noteCell.font = font({ size: 9, color: MUTED });
  sheet.getRow(row).height = 22;
  return row + 2;
}

function headerRow(sheet: Worksheet, row: number, labels: readonly string[], brand: string, startColumn: number) {
  const excelRow = sheet.getRow(row);
  excelRow.height = Math.max(excelRow.height ?? 0, 30);
  labels.forEach((label, index) => {
    const cell = excelRow.getCell(startColumn + index);
    cell.value = label;
    cell.font = font({ size: 10, bold: true, color: PAPER });
    cell.fill = solid(brand);
    cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'center', wrapText: true, indent: index === 0 ? 1 : 0 };
    cell.border = { right: thin(mix(brand, 'FFFFFF', 0.25), 'thin') };
  });
}

function writeRow(sheet: Worksheet, row: number, values: readonly CellValue[], startColumn: number, zebra: boolean) {
  const excelRow = sheet.getRow(row);
  excelRow.height = 20;
  values.forEach((value, index) => {
    const cell = excelRow.getCell(startColumn + index);
    cell.value = value;
    cell.font = font({ size: 10, color: index === 0 ? INK : '2F3B35' });
    cell.alignment = { vertical: 'middle', horizontal: index === 0 || typeof value === 'string' ? 'left' : 'right', indent: 1 };
    cell.border = hairlineBottom();
    if (zebra) cell.fill = solid(ZEBRA);
  });
}

function totalRow(sheet: Worksheet, row: number, values: readonly CellValue[], startColumn: number, formats: readonly string[]) {
  const excelRow = sheet.getRow(row);
  excelRow.height = 22;
  values.forEach((value, index) => {
    const cell = excelRow.getCell(startColumn + index);
    cell.value = value;
    if (formats[index]) cell.numFmt = formats[index];
    cell.font = font({ size: 10, bold: true, color: INK });
    cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right', indent: 1 };
    cell.border = { top: thin(INK, 'thin'), bottom: thin(INK, 'double') };
  });
}

function emptyRow(sheet: Worksheet, row: number, message: string, fromColumn: number, toColumn: number) {
  sheet.mergeCells(row, fromColumn, row, toColumn);
  const cell = sheet.getCell(row, fromColumn);
  cell.value = message;
  cell.font = font({ size: 10, italic: true, color: MUTED });
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(row).height = 28;
}

function statusPill(cell: Cell, status: ParticipantProgressStatus) {
  const color = hex(statusColors[status]);
  cell.fill = solid(mix(color, 'FFFFFF', 0.82));
  cell.font = font({ size: 10, bold: true, color: status === 'in-progress' ? '7A5600' : status === 'completed' ? color : '4A5650' });
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

/** Barras na cor de "concluído" (a mesma do painel); percentuais em escala fixa 0–100%. */
function dataBar(sheet: Worksheet, ref: string, max?: number) {
  sheet.addConditionalFormatting({
    ref,
    rules: [{
      type: 'dataBar',
      priority: 1,
      gradient: false,
      minLength: 0,
      maxLength: 100,
      showValue: true,
      border: false,
      cfvo: [{ type: 'num', value: 0 }, max === undefined ? { type: 'max' } : { type: 'num', value: max }],
      color: { argb: `FF${mix(hex(statusColors.completed), 'FFFFFF', 0.45)}` },
    } as never],
  });
}

function printSetup(sheet: Worksheet, companyName: string, orientation: 'portrait' | 'landscape', printTitlesRow?: string) {
  sheet.pageSetup = {
    ...sheet.pageSetup,
    paperSize: 9,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(printTitlesRow ? { printTitlesRow } : {}),
  };
  sheet.headerFooter = {
    oddFooter: `&L&8${companyName.replace(/&/g, '&&')} · SIPAT Online&R&8Página &P de &N`,
  };
}

function font(options: { size?: number; bold?: boolean; italic?: boolean; color?: string }): Partial<Font> {
  return {
    name: FONT,
    size: options.size ?? 11,
    bold: options.bold,
    italic: options.italic,
    color: { argb: `FF${options.color ?? INK}` },
  };
}

function solid(color: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` }, bgColor: { argb: `FF${color}` } };
}

function thin(color: string, style: 'thin' | 'double'): Borders['top'] {
  return { style, color: { argb: `FF${color}` } };
}

function hairlineBottom(): Partial<Borders> {
  return { bottom: thin(HAIRLINE, 'thin') };
}

function hex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

/** Mistura `color` com `other` (peso de `other` entre 0 e 1). */
function mix(color: string, other: string, weight: number): string {
  const a = parse(color);
  const b = parse(other);
  return a.map((channel, index) => Math.round(channel * (1 - weight) + b[index] * weight)
    .toString(16).padStart(2, '0')).join('').toUpperCase();
}

function parse(color: string): number[] {
  const value = hex(color);
  return [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16));
}

/** Cor da marca só se texto branco tiver contraste ≥ 4.5:1 sobre ela. */
export function readableBrand(color: string | undefined): string {
  const value = color?.trim().replace('#', '');
  if (!value || !/^[0-9a-f]{6}$/i.test(value)) return FALLBACK_BRAND;
  const [r, g, b] = parse(value).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05) >= 4.5 ? value.toUpperCase() : FALLBACK_BRAND;
}

/** O Excel não tem fuso: grava a hora local como se fosse UTC. */
function excelDate(date: Date): Date {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : excelDate(date);
}

function columnLetter(column: number): string {
  let result = '';
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result;
  }
  return result;
}
