import { isExtra, videoProvider, type PlatformCourseStatus, type VideoProvider } from '../api';

export type CourseOption = '1' | '2' | '3';

export const maxVideoBytes = 2 * 1024 * 1024 * 1024;
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
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1024
    ? `${(megabytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`
    : `${megabytes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
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

/** The videos that count for progress and the certificate: YouTube and Vimeo extras never do. */
export function houseVideos<T extends { provider?: string }>(videos: T[]): T[] {
  return videos.filter((video) => !isExtra(video));
}

/** " + 1 extra" / " + 3 extras", or nothing when there are none. */
export function extrasSuffix(extras: number): string {
  return extras > 0 ? ` + ${pluralize(extras, 'extra', 'extras')}` : '';
}

/** Where the duration usually goes: an extra without a known duration shows its provider instead. */
export function durationLabel(video: { provider?: VideoProvider; durationMilliseconds: number }): string {
  return isExtra(video) && video.durationMilliseconds <= 0 ? videoProvider(video) : formatDuration(video.durationMilliseconds);
}
