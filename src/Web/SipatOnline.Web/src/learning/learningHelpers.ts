import { ApiError, type LearningLessonProgress, type LearningTrackCard } from '@/api';

export interface LearningSummary {
  percentage: number;
  completed: number;
  total: number;
}

export function getTrackDisplayTitle(title: string): string {
  const match = title.match(/^\s*Opção\s+\d+\s*·\s*(.+)$/iu);
  return match ? match[1].trim() : title;
}

export function getTrackArtwork(title: string) {
  const normalizedTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/ergonomia|atividade fisica/.test(normalizedTitle)) return 'ergonomics';
  if (/alimentacao|nutricao/.test(normalizedTitle)) return 'nutrition';
  if (/seguranca|comportamento seguro|prevencao/.test(normalizedTitle)) return 'safety';
  if (/higiene mental|saude mental|qualidade do sono/.test(normalizedTitle)) return 'wellbeing';
  if (/habitos de vida|qualidade de vida/.test(normalizedTitle)) return 'habits';
  if (/primeiros socorros|saude/.test(normalizedTitle)) return 'first-aid';
  if (/lideranca/.test(normalizedTitle)) return 'leadership';
  if (/demonstracao|pratica|tecnica/.test(normalizedTitle)) return 'practice';
  return 'course';
}

export const courseCategories = [
  'Saúde física',
  'Alimentação',
  'Segurança',
  'Bem-estar mental',
] as const;

export type CourseCategory = 'all' | typeof courseCategories[number];
export type CourseSort = 'recommended' | 'newest' | 'shortest';
export type TrackWithOptionalCatalogMetadata = LearningTrackCard & {
  assignedAt?: string | null;
  category?: string | null;
  durationMilliseconds?: number | null;
  level?: string | null;
  totalDurationMilliseconds?: number | null;
};

export function getCourseCategory(track: TrackWithOptionalCatalogMetadata): CourseCategory | null {
  const explicitCategory = track.category?.trim().toLocaleLowerCase('pt-BR');
  const explicitMatch = courseCategories.find(
    value => value.toLocaleLowerCase('pt-BR') === explicitCategory,
  );
  if (explicitMatch) {
    return explicitMatch;
  }

  const title = track.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (/alimentacao|nutricao/.test(title)) return 'Alimentação';
  if (/seguranca|prevencao|primeiros socorros/.test(title)) return 'Segurança';
  if (/bem-estar|saude mental|ansiedade|estresse|emocional/.test(title)) return 'Bem-estar mental';
  if (/saude|ergonomia|atividade fisica|postura/.test(title)) return 'Saúde física';
  return null;
}

export function getTrackDuration(track: TrackWithOptionalCatalogMetadata): number | null {
  const duration = track.totalDurationMilliseconds ?? track.durationMilliseconds;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : null;
}

export function getTrackDate(track: TrackWithOptionalCatalogMetadata): number | null {
  if (!track.assignedAt) {
    return null;
  }
  const date = Date.parse(track.assignedAt);
  return Number.isFinite(date) ? date : null;
}

export function getTrackMetadata(track: TrackWithOptionalCatalogMetadata): string {
  const videoLabel = `${track.lessonCount} ${track.lessonCount === 1 ? 'vídeo' : 'vídeos'}`;
  const duration = getTrackDuration(track);
  const level = track.level?.trim();
  return [videoLabel, duration ? formatCourseDuration(duration) : null, level || null]
    .filter(Boolean)
    .join(' · ');
}

export function formatCourseDuration(milliseconds: number): string {
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }
  return `${minutes} min`;
}

export function getResumeLesson(lessons: LearningLessonProgress[]): LearningLessonProgress | null {
  return lessons.find(lesson => !lesson.isCompleted &&
    (lesson.lastPlaybackPositionMilliseconds > 0 || lesson.watchedPercentage > 0))
    ?? lessons.find(lesson => !lesson.isCompleted)
    ?? null;
}

export function getRemainingCourseMinutes(
  lessons: LearningLessonProgress[],
  currentLesson: LearningLessonProgress,
): number | null {
  const remainingMilliseconds = lessons.reduce((total, lesson) => {
    if (lesson.isCompleted) {
      return total;
    }
    return total + Math.max(
      0,
      lesson.durationMilliseconds - (lesson.id === currentLesson.id
        ? lesson.lastPlaybackPositionMilliseconds
        : 0),
    );
  }, 0);
  return remainingMilliseconds > 0 ? Math.ceil(remainingMilliseconds / 60_000) : null;
}

export function getTrackPath(track: LearningTrackCard, tracks: LearningTrackCard[]): string {
  const slug = createTrackSlug(track.title);
  const duplicateTitle = tracks.some(
    (candidate) => candidate.id !== track.id && createTrackSlug(candidate.title) === slug,
  );
  return `/learning/tracks/${duplicateTitle ? track.id : slug}`;
}

export function getTrackProgress(track: LearningTrackCard): number {
  if (track.lessonCount <= 0) {
    return 0;
  }
  return track.completedLessonCount === track.lessonCount
    ? 100
    : Math.min(99, Math.max(0, track.progressPercentage));
}

export function getNextLesson(lessons: LearningLessonProgress[]): LearningLessonProgress | null {
  return lessons.find((lesson) => !lesson.isCompleted && lesson.watchedPercentage > 0)
    ?? lessons.find((lesson) => !lesson.isCompleted)
    ?? lessons[0]
    ?? null;
}

export function getOverallProgress(tracks: LearningTrackCard[]): number {
  const totalLessons = tracks.reduce(
    (total, track) => total + Math.max(0, track.lessonCount),
    0,
  );
  if (totalLessons === 0) {
    return 0;
  }

  const weightedProgress = tracks.reduce(
    (total, track) =>
      total + Math.max(0, track.lessonCount) * getTrackProgress(track),
    0,
  );
  return Math.floor(weightedProgress / totalLessons);
}

export function resolveAssignedTrackId(routeValue: string, tracks: LearningTrackCard[]): string {
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(routeValue);
  if (isGuid) {
    return routeValue;
  }

  const matches = tracks.filter((track) => createTrackSlug(track.title) === routeValue);
  return matches.length === 1 ? matches[0].id : routeValue;
}

export function createTrackSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function getLearningErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return 'A reprodução de vídeos não está configurada neste ambiente.';
  }

  return error instanceof Error ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.';
}
