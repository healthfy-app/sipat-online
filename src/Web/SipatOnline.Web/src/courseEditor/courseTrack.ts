import type { GameModule, PlatformCourse, PlatformCourseVideo } from '../api';
import { gameTypeOptions } from '../gamificationGames';

export type TrackItem =
  | { kind: 'video'; key: string; title: string; video: PlatformCourseVideo; videoIndex: number }
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
    items.push({ kind: 'video', key: `video-${video.id}`, title: video.title, video, videoIndex });
  });
  items.push(...activitiesAt(lastSlot));
  return items;
}

export function gameTypeLabel(module: GameModule): string {
  return gameTypeOptions.find((option) => option.value === module.gameType)?.label ?? 'Atividade';
}
