import type { LearningLessonProgress } from '@/api';
import { houseLessons } from '../learningHelpers';

/** "Extra · YouTube": the quiet mark of a video that is an appendix of the day. */
export function extraLabel(lesson: LearningLessonProgress): string {
  return lesson.provider ? `Extra · ${lesson.provider}` : 'Extra';
}

/** A YouTube or Vimeo video that counts: played in the provider's player, followed like ours. */
export function isExternalLesson(lesson: LearningLessonProgress): boolean {
  return !lesson.isBonus && !!lesson.provider && !!lesson.externalId;
}

/** Where a day stands. Only the house videos count; an extra never does. */
export interface DayStanding {
  /** The videos that count, in order. */
  counted: LearningLessonProgress[];
  hasExtras: boolean;
  completed: number;
  /** Videos finished out of the day's videos: the same count the company's reports use. */
  percentage: number;
  /** Every video that counts is finished. */
  isComplete: boolean;
  /** The number a house video has among the house videos (an extra has none). */
  numberOf: (lesson: LearningLessonProgress) => number;
}

export function dayStanding(lessons: LearningLessonProgress[]): DayStanding {
  const counted = houseLessons(lessons);
  const hasExtras = counted.length !== lessons.length;
  const completed = counted.filter(lesson => lesson.isCompleted).length;
  return {
    counted,
    hasExtras,
    completed,
    percentage: counted.length === 0 ? 0 : Math.round(completed * 100 / counted.length),
    isComplete: counted.length > 0 && completed === counted.length,
    numberOf: lesson => (hasExtras ? counted.findIndex(item => item.id === lesson.id) + 1 : lesson.position),
  };
}

/** The first video after `lesson` not finished yet: the one the countdown over a finished video leads to. */
export function nextUnfinished(lessons: LearningLessonProgress[], lesson: LearningLessonProgress): LearningLessonProgress | undefined {
  return lessons.find(item => item.position > lesson.position && !item.isCompleted);
}
