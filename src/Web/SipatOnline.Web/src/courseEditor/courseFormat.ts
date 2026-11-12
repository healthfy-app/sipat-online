import type { PlatformCourseStatus } from '../api';

export type CourseOption = '1' | '2' | '3';

export const maxVideoBytes = 250 * 1024 * 1024;
export const maxCoverBytes = 2 * 1024 * 1024;

export const statusLabels: Record<PlatformCourseStatus, string> = {
  Draft: 'Rascunho',
  Published: 'Publicado',
};

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}

const optionPrefix = /^Opção ([1-3])(?: ·[^\r\n]*)?(?:\r?\n|$)/u;

export function getCourseOption(description: string | null): CourseOption | null {
  const match = description?.match(optionPrefix);
  return (match?.[1] as CourseOption | undefined) ?? null;
}

export function getCourseDescription(description: string | null): string {
  return description?.replace(optionPrefix, '').trim() ?? '';
}

export function formatCourseOption(option: CourseOption | null, description: string): string | null {
  if (!option) return description || null;
  return [`Opção ${option}`, description].filter(Boolean).join('\n');
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
