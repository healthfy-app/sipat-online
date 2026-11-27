import { useMemo, useReducer, useRef } from 'react';
import type { GameModule, LearningLessonProgress } from '@/api';
import type { GameOutcome } from '@/games/gameKit';
import type { DayActivity } from '@/learning/day/DayActivities';
import { dayStanding, nextUnfinished } from '@/learning/day/dayLessons';
import type { PlayerEvent, SipatVideoPlayerHandle } from '@sipat/video-player';
import type { PreviewDay } from './previewModel';

/*
 * The preview plays the participant's day without the server: what was watched, the games where they open, and the
 * countdown to the next video all live here, in memory, and are gone when the preview closes. Nothing is ever sent.
 */

/** How far one video went in this preview. */
export interface Watched { positionMs: number; furthestMs: number; completed: boolean }

/** A game of the day as the participant's list shows it, with when it opens (see `PreviewGame`). */
export type PreviewActivity = DayActivity & { module: GameModule; afterHouse: number };

export interface PreviewState {
  dayKey: string | null;
  /** The video on stage in each day already opened, by day key. */
  stage: Record<string, string>;
  /** By lesson id. */
  watched: Record<string, Watched>;
  /** The video the countdown over a finished one leads to. */
  upNext: string | null;
  playing: boolean;
  /** How each game ended, by activity id. */
  outcomes: Record<string, GameOutcome>;
  /** The games already opened by the videos: each opens once, as for the participant. */
  opened: Record<string, true>;
  /**
   * The game over the page. `at`: the point of the day that opened it (null: picked from the list), where the next
   * game still to play follows it; `resume`: the video was playing, and plays on when the games close.
   */
  game: { id: string; at: number | null; resume: boolean } | null;
  /** The countdown that waits for the games opened at the end of a video to close. */
  afterGames: string | null;
  /** The list of the day's games is open; `resume` as for a game. */
  list: { resume: boolean } | null;
}

export type PreviewAction =
  | { type: 'openDay'; dayKey: string }
  | { type: 'select'; dayKey: string; lessonId: string }
  | { type: 'progress'; lessonId: string; positionMs: number | null; reachedMs: number; durationMs: number }
  | { type: 'ended'; lessonId: string; durationMs: number; upNext: string | null }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'cancelUpNext' }
  | { type: 'openList'; resume: boolean }
  | { type: 'closeList' }
  | { type: 'openGame'; id: string; at: number | null; resume: boolean }
  | { type: 'closeGame'; outcome: GameOutcome; next: string | null };

/** The preview opens on the first day that has videos (the first day when none has). */
export function startPreview(days: PreviewDay[]): PreviewState {
  return {
    dayKey: (days.find(day => day.lessons.length > 0) ?? days[0])?.key ?? null,
    stage: {}, watched: {}, upNext: null, playing: false, outcomes: {}, opened: {}, game: null, afterGames: null, list: null,
  };
}

const clamp = (value: number, durationMs: number) => Math.max(0, durationMs > 0 ? Math.min(value, durationMs) : value);

export function reducePreview(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'openDay':
      return action.dayKey === state.dayKey ? state
        : { ...state, dayKey: action.dayKey, upNext: null, playing: false, game: null, afterGames: null, list: null };
    case 'select':
      return { ...state, stage: { ...state.stage, [action.dayKey]: action.lessonId }, upNext: null, afterGames: null, playing: false };
    case 'progress': {
      const seen = state.watched[action.lessonId] ?? { positionMs: 0, furthestMs: 0, completed: false };
      const furthestMs = Math.max(seen.furthestMs, clamp(action.reachedMs, action.durationMs));
      const positionMs = action.positionMs === null ? seen.positionMs : clamp(action.positionMs, action.durationMs);
      if (furthestMs === seen.furthestMs && positionMs === seen.positionMs) return state;
      return { ...state, watched: { ...state.watched, [action.lessonId]: { ...seen, positionMs, furthestMs } } };
    }
    case 'ended': {
      const watched = { ...state.watched, [action.lessonId]: { positionMs: action.durationMs, furthestMs: action.durationMs, completed: true } };
      // games that opened with the end of the video go first; the countdown waits for them
      return state.game
        ? { ...state, watched, playing: false, upNext: null, afterGames: action.upNext }
        : { ...state, watched, playing: false, upNext: action.upNext };
    }
    case 'playing':
      // playing again (the finished video, say) calls the countdown off, as for the participant
      return { ...state, playing: true, upNext: null };
    case 'paused':
      return state.playing ? { ...state, playing: false } : state;
    case 'cancelUpNext':
      return state.upNext === null ? state : { ...state, upNext: null };
    case 'openList':
      return { ...state, list: { resume: action.resume } };
    case 'closeList':
      return { ...state, list: null };
    case 'openGame':
      return { ...state, list: null, upNext: null, opened: { ...state.opened, [action.id]: true }, game: { id: action.id, at: action.at, resume: action.resume } };
    case 'closeGame': {
      if (!state.game) return state;
      // a game once completed stays completed, even when played again and skipped
      const outcome: GameOutcome = state.outcomes[state.game.id] === 'completed' ? 'completed' : action.outcome;
      const outcomes = { ...state.outcomes, [state.game.id]: outcome };
      if (action.next) {
        return { ...state, outcomes, opened: { ...state.opened, [action.next]: true }, game: { ...state.game, id: action.next } };
      }
      return { ...state, outcomes, game: null, upNext: state.afterGames ?? state.upNext, afterGames: null };
    }
  }
}

/** The lessons of a day with what this preview watched of them: the same fields the participant's page reads. */
export function withWatched(lessons: LearningLessonProgress[], watched: Record<string, Watched>): LearningLessonProgress[] {
  return lessons.map(lesson => {
    const seen = watched[lesson.id];
    // an extra plays in the provider's frame and never counts
    if (!seen || lesson.isBonus) return lesson;
    const percentage = seen.completed ? 100
      : lesson.durationMilliseconds > 0 ? Math.min(99, Math.floor(seen.furthestMs * 100 / lesson.durationMilliseconds)) : 0;
    return { ...lesson, lastPlaybackPositionMilliseconds: seen.positionMs, watchedPercentage: percentage, isCompleted: seen.completed };
  });
}

/** The day's games as the participant's list shows them. The index keeps a game put twice on a day apart. */
export function dayActivities(day: PreviewDay, outcomes: Record<string, GameOutcome>): PreviewActivity[] {
  return day.games.map(({ module, afterHouse }, index) => {
    const id = `${day.key}/${index}/${module.id}`;
    return { id, title: module.title, outcome: outcomes[id] ?? null, module, afterHouse };
  });
}

/** The first game still to play that opens at `at` (after that many videos that count), other than `except`. */
export function gameDue(activities: PreviewActivity[], state: Pick<PreviewState, 'opened'>, at: number, except?: string): string | null {
  return activities.find(item => item.afterHouse === at && item.outcome === null && !state.opened[item.id] && item.id !== except)?.id ?? null;
}

/**
 * The preview of one training: the day open, its lessons with what was watched, the video on stage, its games and the
 * countdown, with what the screen and the player can do to them. `player` reaches the video on stage, to pause it while
 * a game or the list of games is open and to play it on after.
 */
export function usePreviewSession(days: PreviewDay[]) {
  const [state, dispatch] = useReducer(reducePreview, days, startPreview);
  const player = useRef<SipatVideoPlayerHandle>(null);
  const day = days.find(item => item.key === state.dayKey) ?? days[0] ?? null;
  const lessons = useMemo(() => (day ? withWatched(day.lessons, state.watched) : []), [day, state.watched]);
  const activities = useMemo(() => (day ? dayActivities(day, state.outcomes) : []), [day, state.outcomes]);
  const standing = dayStanding(lessons);
  const current = lessons.find(lesson => lesson.id === (day && state.stage[day.key])) ?? lessons[0] ?? null;
  const upNext = state.upNext ? lessons.find(lesson => lesson.id === state.upNext) ?? null : null;
  const game = state.game ? activities.find(item => item.id === state.game?.id) ?? null : null;
  const playOn = () => { void player.current?.play().catch(() => undefined); };

  function select(lessonId: string) {
    if (day && lessonId !== current?.id) dispatch({ type: 'select', dayKey: day.key, lessonId });
  }

  /** A game due at this point of the day opens over the page, with the video paused, as for the participant. */
  function openDue(at: number, resume: boolean): boolean {
    const id = state.game ? null : gameDue(activities, state, at);
    if (!id) return false;
    player.current?.pause();
    dispatch({ type: 'openGame', id, at, resume });
    return true;
  }

  /** What the player of `lesson` reports: how far it went, playing or not, and its end. Nothing leaves the page. */
  function onPlayerEvent(lesson: LearningLessonProgress, event: PlayerEvent): void | Promise<boolean> {
    const durationMs = lesson.durationMilliseconds;
    switch (event.type) {
      case 'playing':
        dispatch({ type: 'playing' });
        // a game placed before this video opens as it starts (an extra has no place of its own)
        if (!lesson.isBonus) openDue(standing.numberOf(lesson) - 1, true);
        return;
      case 'paused': case 'error': dispatch({ type: 'paused' }); return;
      case 'range': dispatch({ type: 'progress', lessonId: lesson.id, positionMs: null, reachedMs: event.range.endMs, durationMs }); return;
      case 'save':
        dispatch({ type: 'progress', lessonId: lesson.id, positionMs: event.positionMs, reachedMs: Math.max(event.positionMs, event.range?.endMs ?? 0), durationMs });
        // the player waits for the page to keep what was watched: here it is kept at once
        return Promise.resolve(true);
      case 'ended': {
        if (!day) return;
        const finished = withWatched(day.lessons, { ...state.watched, [lesson.id]: { positionMs: durationMs, furthestMs: durationMs, completed: true } });
        // the games placed after this video open first; the countdown to the next one waits for them
        if (!lesson.isBonus) openDue(standing.numberOf(lesson), false);
        dispatch({ type: 'ended', lessonId: lesson.id, durationMs, upNext: nextUnfinished(finished, lesson)?.id ?? null });
        return;
      }
    }
  }

  return {
    day, lessons, standing, current, upNext, activities, game, player,
    playing: state.playing,
    listOpen: state.list !== null,
    openDay: (dayKey: string) => dispatch({ type: 'openDay', dayKey }),
    select,
    playUpNext: () => { if (upNext) select(upNext.id); },
    cancelUpNext: () => dispatch({ type: 'cancelUpNext' }),
    onPlayerEvent,
    openList: () => { player.current?.pause(); dispatch({ type: 'openList', resume: state.playing }); },
    closeList: () => { const resume = state.list?.resume; dispatch({ type: 'closeList' }); if (resume) playOn(); },
    /** From the list: the video, if it was playing when the list opened, plays on when the game closes. */
    startGame: (id: string) => dispatch({ type: 'openGame', id, at: null, resume: state.list?.resume ?? false }),
    closeGame: (outcome: GameOutcome) => {
      const open = state.game;
      if (!open) return;
      // the next game due at the same point follows; then the video plays on, or the countdown shows
      const next = open.at === null ? null : gameDue(activities, state, open.at, open.id);
      dispatch({ type: 'closeGame', outcome, next });
      if (!next && open.resume) playOn();
    },
  };
}

export type PreviewSession = ReturnType<typeof usePreviewSession>;
