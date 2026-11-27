import type { CourseModulePlacement, GameModule, PlatformCourse, PlatformCourseVideo } from '../api';
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

/** The index of an activity's placement in `course.modules`, from its key in the track. */
export function placementOf(item: Extract<TrackItem, { kind: 'activity' }>): number {
  return Number(/^activity-(\d+)-/.exec(item.key)?.[1] ?? -1);
}

/**
 * The training's activities after one moves a step in the participant's order: past a video it changes place (before
 * or after that video), past another activity the two change turns. Null when it is already at that end.
 */
export function moveActivity(course: PlatformCourse, placementIndex: number, delta: -1 | 1): CourseModulePlacement[] | null {
  const lastSlot = course.videos.length;
  // the order the participant gets them in: by place, then in the training's order
  const steps: ({ kind: 'video' } | { kind: 'activity'; index: number })[] = [];
  const at = (slot: number) => course.modules.forEach((placement, index) => {
    if (Math.min(placement.afterVideoCount, lastSlot) === slot) steps.push({ kind: 'activity', index });
  });
  at(0);
  course.videos.forEach((_, videoIndex) => { steps.push({ kind: 'video' }); at(videoIndex + 1); });
  const from = steps.findIndex(step => step.kind === 'activity' && step.index === placementIndex);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= steps.length) return null;
  [steps[from], steps[to]] = [steps[to], steps[from]];
  // written back in the new order, each after as many videos as come before it
  let videos = 0;
  const placements: CourseModulePlacement[] = [];
  for (const step of steps) {
    if (step.kind === 'video') videos++;
    else placements.push({ moduleId: course.modules[step.index].moduleId, afterVideoCount: videos });
  }
  return placements;
}

/** The training's activities without one placement; the others stay where they are. */
export function removeActivity(course: PlatformCourse, placementIndex: number): CourseModulePlacement[] {
  return course.modules.filter((_, index) => index !== placementIndex)
    .map(placement => ({ moduleId: placement.moduleId, afterVideoCount: Math.min(placement.afterVideoCount, course.videos.length) }));
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

/** Aulas do treinamento; treinamentos sem `lessons` (respostas antigas) viram uma única "Título 1". */
export function courseLessons(course: PlatformCourse) {
  if (course.lessons && course.lessons.length > 0) return course.lessons;
  return course.videos.length > 0
    ? [{ id: course.id, title: 'Título 1', description: null, videoIds: course.videos.map((video) => video.id) }]
    : [];
}

/**
 * Agrupa a trilha por aula, como o servidor entrega os dias: uma atividade fica na aula do vídeo que vem logo antes
 * dela (a atividade "depois do vídeo N" é do dia que tem o vídeo N), e uma atividade antes do primeiro vídeo fica na
 * primeira aula, mesmo sem vídeos. Assim ela não troca de aula quando se põe ou tira um vídeo de uma aula vazia.
 */
export function groupTrackByLesson(course: PlatformCourse, track: TrackItem[]): LessonGroup[] {
  const lessons = courseLessons(course);
  const lessonOfVideo = new Map<string, string>();
  lessons.forEach((lesson) => lesson.videoIds.forEach((id) => lessonOfVideo.set(id, lesson.id)));
  const groups = lessons.map((lesson) => ({ id: lesson.id, title: lesson.title, description: lesson.description, items: [] as TrackItem[] }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  const firstId = groups[0]?.id;

  track.forEach((item, index) => {
    let lessonId: string | undefined;
    if (item.kind === 'video') lessonId = lessonOfVideo.get(item.video.id);
    else {
      const previous = track.slice(0, index).reverse().find((candidate) => candidate.kind === 'video');
      lessonId = previous?.kind === 'video' ? lessonOfVideo.get(previous.video.id) : firstId;
    }
    (byId.get(lessonId ?? firstId ?? '') ?? groups[0])?.items.push(item);
  });
  return groups;
}
