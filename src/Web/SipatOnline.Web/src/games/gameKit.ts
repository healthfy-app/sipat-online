import { useCallback, useEffect, useRef, useState } from 'react';

export type GameOutcome = 'completed' | 'skipped';

export interface GameResult {
  score: number;
  stars: 1 | 2 | 3;
  hits: number;
  misses: number;
  seconds: number;
}

/** Each game reports this when the player finishes the board. */
export type FinishGame = (result: Omit<GameResult, 'seconds'>) => void;

/** Motion is off when the user asks for it, and when the browser cannot tell (tests, old engines). */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function shuffled(size: number) {
  const values = Array.from({ length: size }, (_, index) => index);
  for (let index = values.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  if (size > 1 && values.every((value, index) => value === index)) values.push(values.shift()!);
  return values;
}

/** Accuracy-based stars: finishing always earns at least one. */
export function starsFor(hits: number, misses: number): 1 | 2 | 3 {
  const total = hits + misses;
  const accuracy = total === 0 ? 1 : hits / total;
  if (accuracy >= 0.9) return 3;
  if (accuracy >= 0.6) return 2;
  return 1;
}

export interface ScoreState { score: number; streak: number; hits: number; misses: number; lastGain: number; gainId: number }

/**
 * Points with a combo: every hit in a row multiplies the base (x1, x2, x3 at most).
 * A miss only resets the combo; points are never taken away.
 */
export function useGameScore() {
  const [state, setState] = useState<ScoreState>({ score: 0, streak: 0, hits: 0, misses: 0, lastGain: 0, gainId: 0 });
  const ref = useRef(state);
  ref.current = state;
  const hit = useCallback((base = 100) => {
    const current = ref.current;
    const streak = current.streak + 1;
    const gain = base * Math.min(streak, 3);
    const next = { score: current.score + gain, streak, hits: current.hits + 1, misses: current.misses, lastGain: gain, gainId: current.gainId + 1 };
    ref.current = next; setState(next);
    return next;
  }, []);
  const miss = useCallback(() => {
    const current = ref.current;
    const next = { ...current, streak: 0, misses: current.misses + 1, lastGain: 0 };
    ref.current = next; setState(next);
    return next;
  }, []);
  const bonus = useCallback((points: number) => {
    const current = ref.current;
    const next = { ...current, score: current.score + points, lastGain: current.lastGain + points };
    ref.current = next; setState(next);
    return next;
  }, []);
  return { ...state, multiplier: Math.min(Math.max(state.streak, 1), 3), hit, miss, bonus, current: () => ref.current };
}

/** Whole seconds since the clock started; stops while `running` is false. */
export function useElapsedSeconds(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);
  return seconds;
}

export function formatSeconds(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
