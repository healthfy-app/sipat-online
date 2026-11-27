import { describe, expect, it } from 'vitest';
import type { GameModule, PlatformCourse } from '@/api';
import { buildTrack, groupTrackByLesson, moveActivity, removeActivity } from './courseTrack';

const game = { id: 'g', title: 'Caça aos riscos' } as GameModule;
const video = (id: string) => ({ id, title: `Vídeo ${id}`, checkpoints: [] });
const course = (lessons: { id: string; videoIds: string[] }[], afterVideoCount: number) => ({
  id: 'c',
  videos: lessons.flatMap(lesson => lesson.videoIds.map(video)),
  lessons: lessons.map(lesson => ({ ...lesson, title: lesson.id, description: null })),
  modules: [{ moduleId: 'g', afterVideoCount }],
}) as unknown as PlatformCourse;
const shape = (training: PlatformCourse) =>
  groupTrackByLesson(training, buildTrack(training, [game])).map(group => group.items.map(item => (item.kind === 'video' ? item.video.id : 'jogo')));

describe('the Títulos of a training, as the server delivers its days', () => {
  it('keeps a game after the last video of a Título at the end of that Título', () => {
    expect(shape(course([{ id: 'Aula 1', videoIds: ['A'] }, { id: 'Aula 2', videoIds: ['B'] }], 1))).toEqual([['A', 'jogo'], ['B']]);
  });

  it('keeps a game before the first video in the first Título, even with no videos in it', () => {
    expect(shape(course([{ id: 'Aula 1', videoIds: [] }, { id: 'Aula 2', videoIds: ['B'] }], 0))).toEqual([['jogo'], ['B']]);
  });
});

describe('moving the activities of a training', () => {
  // two games before the first video, as after the videos they came after were taken out
  const training = {
    ...course([{ id: 'Aula 1', videoIds: ['A', 'B'] }], 0),
    modules: [{ moduleId: 'g1', afterVideoCount: 0 }, { moduleId: 'g2', afterVideoCount: 0 }],
  } as PlatformCourse;

  it('past another game changes turns, past a video changes place, and stops at the ends', () => {
    expect(moveActivity(training, 0, 1)).toEqual([{ moduleId: 'g2', afterVideoCount: 0 }, { moduleId: 'g1', afterVideoCount: 0 }]);
    expect(moveActivity(training, 1, 1)).toEqual([{ moduleId: 'g1', afterVideoCount: 0 }, { moduleId: 'g2', afterVideoCount: 1 }]);
    expect(moveActivity(training, 0, -1)).toBeNull();
  });

  it('takes one out and keeps the others where they are', () => {
    expect(removeActivity(training, 0)).toEqual([{ moduleId: 'g2', afterVideoCount: 0 }]);
  });
});
