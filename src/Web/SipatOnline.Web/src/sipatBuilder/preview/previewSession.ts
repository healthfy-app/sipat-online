import { useMemo, useReducer, useRef } from 'react';
import type { GameModule, LearningLessonProgress } from '@/api';
import type { GameOutcome } from '@/games/gameKit';
import type { DayActivity } from '@/learning/day/DayActivities';
import { dayStanding, nextUnfinished } from '@/learning/day/dayLessons';
import type { PlayerEvent, SipatVideoPlayerHandle } from '@sipat/video-player';
import type { PreviewDay } from './previewModel';

/*
 * The preview plays the participant's day without the server: what was watched, the countdown to the next video and
 * the games all live here, in memory, and are gone when the preview closes. Nothing is ever sent.
 */

/** How far one video went in this preview. */
export interface Watched { positionMs: number; furthestMs: number; completed: boolean }

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
  /** The game over the page. `chain`: opened at the end of the day's videos, so the next one still to play follows it. */
  game: { id: string; chain: boolean } | null;
  /** The list of the day's games is open. */
  listOpen: boolean;
}

export type PreviewAction =
  | { type: 'openDay'; dayKey: string }
  | { type: 'select'; dayKey: string; lessonId: string }
  | { type: 'progress'; lessonId: string; positionMs: number | null; reachedMs: number; durationMs: number }
  | { type: 'ended'; lessonId: string; durationMs: number; upNext: string | null; game: string | null }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'cancelUpNext' }
  | { type: 'openList' }
  | { type: 'closeList' }
  | { type: 'startGame'; id: string }
  | { type: 'closeGame'; outcome: GameOutcome; next: string | null };

/** The preview opens on the first day that has videos (the first day when none has). */
export function startPreview(days: PreviewDay[]): PreviewState {
  return {
    dayKey: (days.find(day => day.lessons.length > 0) ?? days[0])?.key ?? null,
    stage: {}, watched: {}, upNext: null, playing: false, outcomes: {}, game: null, listOpen: false,
  };
}

const clamp = (value: number, durationMs: number) => Math.max(0, durationMs > 0 ? Math.min(value, durationMs) : value);

export function reducePreview(state: PreviewState, action: PreviewAction): PreviewState {
  switch (action.type) {
    case 'openDay':
      return action.dayKey === state.dayKey ? state
        : { ...state, dayKey: action.dayKey, upNext: null, playing: false, game: null, listOpen: false };
    case 'select':
      return { ...state, stage: { ...state.stage, [action.dayKey]: action.lessonId }, upNext: null, playing: false };
    case 'progress': {
      const seen = state.watched[action.lessonId] ?? { positionMs: 0, furthestMs: 0, completed: false };
      const furthestMs = Math.max(seen.furthestMs, clamp(action.reachedMs, action.durationMs));
      const positionMs = action.positionMs === null ? seen.positionMs : clamp(action.positionMs, action.durationMs);
      if (furthestMs === seen.furthestMs && positionMs === seen.positionMs) return state;
      return { ...state, watched: { ...state.watched, [action.lessonId]: { ...seen, positionMs, furthestMs } } };
    }
    case 'ended':
      return {
        ...state, playing: false, upNext: action.upNext,
        game: action.game ? { id: action.game, chain: true } : state.game,
        watched: { ...state.watched, [action.lessonId]: { positionMs: action.durationMs, furthestMs: action.durationMs, completed: true } },
      };
    case 'playing':
      // playing again (the finished video, say) calls the countdown off, as for the participant
      return { ...state, playing: true, upNext: null };
    case 'paused':
      return state.playing ? { ...state, playing: false } : state;
    case 'cancelUpNext':
      return state.upNext === null ? state : { ...state, upNext: null };
    case 'openList':
      return { ...state, listOpen: true };
    case 'closeList':
      return { ...state, listOpen: false };
    case 'startGame':
      return { ...state, listOpen: false, game: { id: action.id, chain: false } };
    case 'closeGame': {
      if (!state.game) return state;
      // a game once completed stays completed, even when played again and skipped
      const outcome: GameOutcome = state.outcomes[state.game.id] === 'completed' ? 'completed' : action.outcome;
      const outcomes = { ...state.outcomes, [state.game.id]: outcome };
      return { ...state, outcomes, game: state.game.chain && action.next ? { id: action.next, chain: true } : null };
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
export function dayActivities(day: PreviewDay, outcomes: Record<string, GameOutcome>): (DayActivity & { module: GameModule })[] {
  return day.games.map((module, index) => {
    const id = `${day.key}/${index}/${module.id}`;
    return { id, title: module.title, outcome: outcomes[id] ?? null, module };
  });
}

/**
 * The preview of one training: the day open, its lessons with what was watched, the video on stage, the countdown and
 * the games, with what the screen and the player can do to them. `player` reaches the video on stage, to pause it
 * while a game or the list of games is open.
 */
export function usePreviewSession(days: PreviewDay[]) {
  const [state, dispatch] = useReducer(reducePreview, days, startPreview);
  const player = useRef<SipatVideoPlayerHandle>(null);
  // the video was playing when the list of games opened: it plays on when the list (or the game started from it) closes
  const resumeAfter = useRef(false);
  const resume = () => {
    if (resumeAfter.current) void player.current?.play().catch(() => undefined);
    resumeAfter.current = false;
  };
  const day = days.find(item => item.key === state.dayKey) ?? days[0] ?? null;
  const lessons = useMemo(() => (day ? withWatched(day.lessons, state.watched) : []), [day, state.watched]);
  const activities = useMemo(() => (day ? dayActivities(day, state.outcomes) : []), [day, state.outcomes]);
  const current = lessons.find(lesson => lesson.id === (day && state.stage[day.key])) ?? lessons[0] ?? null;
  const upNext = state.upNext ? lessons.find(lesson => lesson.id === state.upNext) ?? null : null;
  const game = state.game ? activities.find(item => item.id === state.game?.id) ?? null : null;
  const pending = (except?: string) => activities.find(item => item.outcome === null && item.id !== except)?.id ?? null;

  function select(lessonId: string) {
    if (day && lessonId !== current?.id) dispatch({ type: 'select', dayKey: day.key, lessonId });
  }

  /** What the player of `lesson` reports: how far it went, playing or not, and its end. Nothing leaves the page. */
  function onPlayerEvent(lesson: LearningLessonProgress, event: PlayerEvent): void | Promise<boolean> {
    const durationMs = lesson.durationMilliseconds;
    switch (event.type) {
      case 'playing': dispatch({ type: 'playing' }); return;
      case 'paused': case 'error': dispatch({ type: 'paused' }); return;
      case 'range': dispatch({ type: 'progress', lessonId: lesson.id, positionMs: null, reachedMs: event.range.endMs, durationMs }); return;
      case 'save':
        dispatch({ type: 'progress', lessonId: lesson.id, positionMs: event.positionMs, reachedMs: Math.max(event.positionMs, event.range?.endMs ?? 0), durationMs });
        // the player waits for the page to keep what was watched: here it is kept at once
        return Promise.resolve(true);
      case 'ended': {
        if (!day) return;
        const finished = withWatched(day.lessons, { ...state.watched, [lesson.id]: { positionMs: durationMs, furthestMs: durationMs, completed: true } });
        // the games of the day come after its last video, as for the participant; then the countdown to the next one
        const isLast = !lesson.isBonus && dayStanding(finished).counted.at(-1)?.id === lesson.id;
        const gameDue = isLast ? pending() : null;
        const next = gameDue ? null : nextUnfinished(finished, lesson)?.id ?? null;
        dispatch({ type: 'ended', lessonId: lesson.id, durationMs, upNext: next, game: gameDue });
        return;
      }
    }
  }

  return {
    day, lessons, current, upNext, activities, game, player,
    playing: state.playing,
    listOpen: state.listOpen,
    openDay: (dayKey: string) => dispatch({ type: 'openDay', dayKey }),
    select,
    playUpNext: () => { if (upNext) select(upNext.id); },
    cancelUpNext: () => dispatch({ type: 'cancelUpNext' }),
    onPlayerEvent,
    openList: () => { resumeAfter.current = state.playing; player.current?.pause(); dispatch({ type: 'openList' }); },
    closeList: () => { dispatch({ type: 'closeList' }); resume(); },
    startGame: (id: string) => { player.current?.pause(); dispatch({ type: 'startGame', id }); },
    closeGame: (outcome: GameOutcome) => {
      const next = state.game?.chain ? pending(state.game.id) : null;
      dispatch({ type: 'closeGame', outcome, next });
      if (!next) resume();
    },
  };
}

export type PreviewSession = ReturnType<typeof usePreviewSession>;
