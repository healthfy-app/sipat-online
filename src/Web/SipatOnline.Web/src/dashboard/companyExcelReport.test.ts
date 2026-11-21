import { describe, expect, it } from 'vitest';
import type { LearningParticipantProgress, ParticipantAccount } from '../api';
import { summarizeCompanyProgress, summarizeParticipants } from '../participantProgress';
import { completionsByDate, toParticipantRows } from './companyDashboardData';
import { buildCompanyExcelReport, excelReportFileName, readableBrand } from './companyExcelReport';

const participants: ParticipantAccount[] = [
  { id: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', isActive: true },
  { id: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002', isActive: true },
  { id: 'p3', displayName: 'Carla Nunes', loginIdentifier: 'MAT-003', isActive: false },
];
const participation: LearningParticipantProgress[] = [
  {
    participantId: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', trackId: 't1', trackTitle: 'Ergonomia',
    assignedAt: '2026-11-16T09:00:00', lessonCount: 2, completedLessonCount: 2, progressPercentage: 100, isCompleted: true,
    watchedMilliseconds: 3_900_000, completedAt: '2026-11-17T10:00:00', lastAccessedAt: '2026-11-17T10:00:00',
  },
  {
    participantId: 'p2', displayName: 'Bruno Lima', loginIdentifier: 'MAT-002', trackId: 't1', trackTitle: 'Ergonomia',
    assignedAt: '2026-11-16T09:00:00', lessonCount: 2, completedLessonCount: 1, progressPercentage: 40, isCompleted: false,
    watchedMilliseconds: 600_000, lastAccessedAt: '2026-11-18T08:00:00',
  },
  {
    participantId: 'p1', displayName: 'Ana Costa', loginIdentifier: 'MAT-001', trackId: 't2', trackTitle: 'Comportamento seguro',
    assignedAt: '2026-11-16T09:00:00', lessonCount: 3, completedLessonCount: 3, progressPercentage: 100, isCompleted: true,
    completedAt: '2026-11-19T15:00:00',
  },
];

describe('company Excel report', () => {
  it('builds summary, participants, heatmap and detail sheets with real numbers', async () => {
    const rows = toParticipantRows(summarizeParticipants(participants, participation));
    const workbook = await buildCompanyExcelReport({
      companyName: 'Acme & Filhos',
      overview: summarizeCompanyProgress(participants, participation),
      rows,
      participation,
      brandColor: '#d40000',
      generatedAt: new Date(2026, 10, 21, 9, 30),
    });

    expect(workbook.worksheets.map((sheet) => sheet.name))
      .toEqual(['Resumo', 'Colaboradores', 'Mapa de progresso', 'Detalhe por dia']);

    const people = workbook.getWorksheet('Colaboradores')!;
    expect(people.getRow(1).getCell(1).value).toBe('Nome');
    expect(people.getRow(2).getCell(1).value).toBe('Ana Costa');
    expect(people.getRow(2).getCell(9).value).toBe(1);
    expect(people.getRow(2).getCell(9).numFmt).toBe('0%');
    expect(people.getRow(4).getCell(3).value).toBe('Inativo');
    expect(people.autoFilter).toBeTruthy();

    const heatmap = workbook.getWorksheet('Mapa de progresso')!;
    expect(heatmap.getRow(3).values).toEqual([undefined, 'Colaborador', 'Comportamento seguro', 'Ergonomia']);
    expect(heatmap.getRow(5).getCell(2).value).toBeNull();
    expect(heatmap.getRow(5).getCell(3).value).toBe(0.4);

    expect(workbook.getWorksheet('Detalhe por dia')!.rowCount).toBe(4);

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5000);
  });

  it('falls back to the product green when white text would not read on the brand color', () => {
    expect(readableBrand('#d40000')).toBe('D40000');
    expect(readableBrand('#ffe066')).toBe('14694B');
    expect(readableBrand(undefined)).toBe('14694B');
  });

  it('names the file after the company and day', () => {
    expect(excelReportFileName('Indústria São José', new Date(2026, 10, 21))).toBe('relatorio-sipat-industria-sao-jose-2026-11-21.xlsx');
  });

  it('fills calendar gaps between completions', () => {
    expect(completionsByDate(participation)).toEqual([
      { date: '2026-11-17', count: 1 },
      { date: '2026-11-18', count: 0 },
      { date: '2026-11-19', count: 1 },
    ]);
  });
});
