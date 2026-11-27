import { isExtra, isExternal, type GameModule, type LearningLessonProgress } from '@/api';
import { placedGames, type Catalog, type DaySlots } from '../model';

/** How one video of the preview plays: our player with its file, or the provider's frame. */
export type PreviewSource =
  | { kind: 'house'; url: string }
  | { kind: 'external'; provider: 'YouTube' | 'Vimeo'; externalId: string }
  | { kind: 'unavailable' };

/** One day of the training the way the participant gets it, made from the board as it is now. */
export interface PreviewDay {
  key: string;
  /** 1-based: "Dia 3". */
  position: number;
  /** yyyy-MM-dd, or null for a training without dates. */
  date: string | null;
  /** The slogan of the day, or "Dia 3" while it has none (the name the server gives it). */
  title: string;
  /** Its videos in order, as lessons nobody watched yet. */
  lessons: LearningLessonProgress[];
  /** How each lesson plays, by lesson id. */
  sources: Record<string, PreviewSource>;
  /** In the order they open. */
  games: PreviewGame[];
}

/**
 * A game of the day and when it opens: after `afterHouse` of the day's videos that count (0: as the first one starts).
 * Extras do not count, as for the participant: a game put after one opens after the last video before it that counts.
 */
export interface PreviewGame { module: GameModule; afterHouse: number }

/**
 * The board's days as the participant's days. Videos the catalog no longer has are left out, as the server would refuse
 * them; an extra (a YouTube or Vimeo video with no length) is marked as one, so it never counts. `games`: whether the
 * company's plan has games (Diamante); without them the server delivers none, and neither does the preview.
 */
export function buildPreviewDays(days: DaySlots[], catalog: Catalog, word: string, { games: withGames }: { games: boolean }): PreviewDay[] {
  return days.map((day, index) => {
    const lessons: LearningLessonProgress[] = [];
    const sources: Record<string, PreviewSource> = {};
    // how many videos that count come before the end of each of the board's videos (by its count on the day)
    const houseAfter = [0];
    for (const videoId of day.videos) {
      if (!videoId) continue;
      const video = catalog.videos.get(videoId);
      houseAfter.push(houseAfter[houseAfter.length - 1] + (video && !isExtra(video) ? 1 : 0));
      if (!video) continue;
      const position = lessons.length + 1;
      // the same video may sit twice on a board being built: the position keeps each one apart
      const id = `${day.key}/${position}/${video.id}`;
      const external = video.source && isExternal(video.source) && video.source.externalId
        ? { provider: video.source.provider === 'Vimeo' ? 'Vimeo' as const : 'YouTube' as const, externalId: video.source.externalId }
        : null;
      lessons.push({
        id, title: video.title, description: null, position, durationMilliseconds: video.durationMs,
        lastPlaybackPositionMilliseconds: 0, watchedPercentage: 0, isCompleted: false, completedAt: null,
        isBonus: isExtra(video), provider: external?.provider ?? null, externalId: external?.externalId ?? null,
        thumbnailUrl: video.source?.thumbnailUrl ?? null,
      });
      sources[id] = external ? { kind: 'external', ...external }
        : video.source?.fileUrl ? { kind: 'house', url: video.source.fileUrl } : { kind: 'unavailable' };
    }
    // each game where the participant gets it, in the order they open
    const games = !withGames ? [] : placedGames(day)
      .flatMap(game => { const module = catalog.games.get(game.id); return module ? [{ module, afterHouse: houseAfter[game.afterVideo] ?? 0 }] : []; })
      .sort((a, b) => a.afterHouse - b.afterHouse);
    const position = index + 1;
    return { key: day.key, position, date: day.date || null, title: day.title.trim() || `${word} ${position}`, lessons, sources, games };
  });
}
