import type { LearningParticipantProgress } from '../api';
import type { ParticipantProgressStatus, ParticipantProgressSummary } from '../participantProgress';

export const statusLabels: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluíram todos os dias',
  'in-progress': 'Em andamento',
  'not-started': 'Ainda não iniciaram',
  'no-tracks': 'Sem dias da SIPAT',
  inactive: 'Participantes inativos',
};

/** Rótulo curto, para tabela e planilha (uma pessoa por linha). */
export const statusShortLabels: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluiu',
  'in-progress': 'Em andamento',
  'not-started': 'Não iniciou',
  'no-tracks': 'Sem dias',
  inactive: 'Inativo',
};

/**
 * Situação é uma escala ordenada (concluiu > andamento > não iniciou), não uma
 * identidade: verde → âmbar → cinzas. Sempre acompanhada de rótulo e número.
 */
export const statusColors: Record<ParticipantProgressStatus, string> = {
  completed: '#0a7a2f',
  'in-progress': '#e8a400',
  'not-started': '#8b9a92',
  'no-tracks': '#c3cbc6',
  inactive: '#e1e6e3',
};

export interface ParticipantRow {
  id: string;
  displayName: string;
  loginIdentifier: string;
  isActive: boolean;
  status: ParticipantProgressStatus;
  assignedTrackCount: number;
  completedTrackCount: number;
  lessonCount: number;
  completedLessonCount: number;
  progressPercentage: number;
  watchedMilliseconds: number;
  lastAccessedAt: string | null;
}

export function toParticipantRows(summaries: readonly ParticipantProgressSummary[]): ParticipantRow[] {
  return summaries.map((summary) => ({
    id: summary.participant.id,
    displayName: summary.participant.displayName,
    loginIdentifier: summary.participant.loginIdentifier,
    isActive: summary.participant.isActive,
    status: summary.status,
    assignedTrackCount: summary.assignedTrackCount,
    completedTrackCount: summary.completedTrackCount,
    lessonCount: summary.lessonCount,
    completedLessonCount: summary.completedLessonCount,
    progressPercentage: summary.overallProgressPercentage,
    watchedMilliseconds: summary.tracks.reduce((total, track) => total + Math.max(0, track.watchedMilliseconds ?? 0), 0),
    lastAccessedAt: latest(summary.tracks.map((track) => track.lastAccessedAt)),
  }));
}

export interface DailyCompletion {
  /** Data local no formato AAAA-MM-DD. */
  date: string;
  count: number;
}

/**
 * Dias da SIPAT concluídos por data de calendário. Preenche as datas sem
 * conclusão entre a primeira e a última, para o eixo do tempo não mentir.
 */
export function completionsByDate(
  participation: readonly LearningParticipantProgress[],
  maxDays = 21,
): DailyCompletion[] {
  const counts = new Map<string, number>();
  for (const track of participation) {
    if (!track.isCompleted || !track.completedAt) continue;
    const date = new Date(track.completedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = localDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const keys = [...counts.keys()].sort();
  const last = parseDateKey(keys[keys.length - 1]);
  const first = parseDateKey(keys[0]);
  const start = new Date(last);
  start.setDate(start.getDate() - (maxDays - 1));
  const cursor = first > start ? first : start;

  const series: DailyCompletion[] = [];
  for (const day = new Date(cursor); day <= last; day.setDate(day.getDate() + 1)) {
    const key = localDateKey(day);
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

export function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

export function formatShortDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function latest(values: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time) && time > bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}
