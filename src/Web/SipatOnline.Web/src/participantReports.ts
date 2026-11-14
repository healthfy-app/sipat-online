import type { LearningParticipantProgress, LearningParticipantReport, ParticipantAccount } from './api';

const cell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const toCsv = (rows: (string | number | null | undefined)[][]) =>
  `﻿${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;

/** 5025000 ms -> "1h23m", no mesmo formato do relatório de acompanhamento. */
export function formatWatchTime(milliseconds: number | undefined): string {
  const minutes = Math.round((milliseconds ?? 0) / 60000);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`;
}

export function formatReportDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Relatório da empresa: uma linha por pessoa e trilha (inclui quem ainda não recebeu trilha). */
export function companyReportCsv(
  participants: readonly ParticipantAccount[],
  participation: readonly LearningParticipantProgress[],
): string {
  const header = ['Login', 'Nome', 'Conta', 'Dia', 'Vídeos', 'Vídeos concluídos', 'Tempo assistido', 'Progresso', 'Data de conclusão', 'Último acesso'];
  const rows = participants.flatMap((participant) => {
    const tracks = participation.filter((row) => row.participantId === participant.id);
    const account = participant.isActive ? 'Ativo' : 'Inativo';
    if (tracks.length === 0) {
      return [[participant.loginIdentifier, participant.displayName, account, '', 0, 0, formatWatchTime(0), '0%', '', '']];
    }
    return tracks.map((track) => [
      participant.loginIdentifier, participant.displayName, account, track.trackTitle,
      track.lessonCount, track.completedLessonCount, formatWatchTime(track.watchedMilliseconds),
      `${track.progressPercentage}%`, formatReportDate(track.completedAt), formatReportDate(track.lastAccessedAt),
    ]);
  });
  return toCsv([header, ...rows]);
}

/** Relatório da pessoa: uma linha por vídeo de cada trilha. */
export function participantReportCsv(report: LearningParticipantReport): string {
  const header = ['Login', 'Nome', 'Dia', 'Posição', 'Vídeo', 'Duração', 'Tempo assistido', 'Assistido', 'Situação', 'Concluído em'];
  const rows = report.tracks.flatMap((experience) => experience.lessons.map((lesson) => [
    report.loginIdentifier, report.displayName, experience.track.title, lesson.sectionTitle ?? '', lesson.title,
    formatWatchTime(lesson.durationMilliseconds), formatWatchTime(lesson.watchedMilliseconds),
    `${lesson.watchedPercentage}%`, lesson.isCompleted ? 'Concluído' : lesson.watchedPercentage > 0 ? 'Em andamento' : 'Não iniciado',
    formatReportDate(lesson.completedAt),
  ]));
  return toCsv([header, ...rows]);
}

export function reportFileName(prefix: string): string {
  const slug = prefix.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `relatorio-${slug || 'participantes'}-${new Date().toISOString().slice(0, 10)}.csv`;
}
