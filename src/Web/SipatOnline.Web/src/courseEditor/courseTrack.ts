import type { GameModule, PlatformCourse, PlatformCourseVideo } from '../api';
import { gameTypeOptions } from '../gamificationGames';

/** A game that pauses a video at a given moment, with its module already resolved. */
export interface PreviewCheckpoint { id: string; timeMilliseconds: number; module: GameModule }

export type TrackItem =
  | { kind: 'video'; key: string; title: string; video: PlatformCourseVideo; videoIndex: number; checkpoints: PreviewCheckpoint[] }
  | { kind: 'activity'; key: string; title: string; module: GameModule; afterVideoCount: number };

/**
 * Builds the learner's sequence: activities placed "after N videos" sit between the videos,
 * the same order the participant will experience.
 */
export function buildTrack(course: PlatformCourse, modules: GameModule[]): TrackItem[] {
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  const lastSlot = course.videos.length;

  const activitiesAt = (slot: number): TrackItem[] =>
    course.modules.flatMap((placement, placementIndex) => {
      const position = Math.min(placement.afterVideoCount, lastSlot);
      const module = moduleById.get(placement.moduleId);
      if (position !== slot || !module) return [];
      return [{
        kind: 'activity' as const,
        key: `activity-${placementIndex}-${module.id}`,
        title: module.title,
        module,
        afterVideoCount: position,
      }];
    });

  const items: TrackItem[] = [];
  course.videos.forEach((video, videoIndex) => {
    items.push(...activitiesAt(videoIndex));
    const checkpoints = video.checkpoints.flatMap((checkpoint, index) => {
      const module = moduleById.get(checkpoint.moduleId);
      return module ? [{ id: `${video.id}-${index}-${module.id}`, timeMilliseconds: checkpoint.timeMilliseconds, module }] : [];
    });
    items.push({ kind: 'video', key: `video-${video.id}`, title: video.title, video, videoIndex, checkpoints });
  });
  items.push(...activitiesAt(lastSlot));
  return items;
}

export function gameTypeLabel(module: GameModule): string {
  return gameTypeOptions.find((option) => option.value === module.gameType)?.label ?? 'Atividade';
}

export interface LessonGroup {
  id: string;
  title: string;
  description: string | null;
  items: TrackItem[];
}

/** Aulas do curso; cursos sem `lessons` (respostas antigas) viram uma única "Aula 1". */
export function courseLessons(course: PlatformCourse) {
  if (course.lessons && course.lessons.length > 0) return course.lessons;
  return course.videos.length > 0
    ? [{ id: course.id, title: 'Aula 1', description: null, videoIds: course.videos.map((video) => video.id) }]
    : [];
}

/**
 * Agrupa a trilha por aula. Uma atividade fica na aula do vídeo que vem logo depois dela
 * (ou na última aula, se vier depois do último vídeo).
 */
export function groupTrackByLesson(course: PlatformCourse, track: TrackItem[]): LessonGroup[] {
  const lessons = courseLessons(course);
  const lessonOfVideo = new Map<string, string>();
  lessons.forEach((lesson) => lesson.videoIds.forEach((id) => lessonOfVideo.set(id, lesson.id)));
  const groups = lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, description: lesson.description, items: [] as TrackItem[] }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  const lastId = groups[groups.length - 1]?.id;

  track.forEach((item, index) => {
    let lessonId: string | undefined;
    if (item.kind === 'video') lessonId = lessonOfVideo.get(item.video.id);
    else {
      const next = track.slice(index + 1).find((candidate) => candidate.kind === 'video');
      lessonId = next?.kind === 'video' ? lessonOfVideo.get(next.video.id) : lastId;
    }
    (byId.get(lessonId ?? lastId ?? '') ?? groups[0])?.items.push(item);
  });
  return groups;
}
