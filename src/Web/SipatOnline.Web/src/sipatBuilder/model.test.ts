import { describe, expect, it } from 'vitest';
import type { PlatformCourse, PlatformCourseVideo, PlatformLibraryVideo } from '@/api';
import { buildCatalog, dayDuration } from './model';

function libraryVideo(id: string, status: PlatformCourseVideo['status']): PlatformLibraryVideo {
  return {
    courseCount: 1,
    video: {
      id, title: `Vídeo ${id}`, contentType: 'video/mp4', sizeBytes: 1, durationMilliseconds: 60000,
      createdAt: '2026-11-10T12:00:00Z', fileUrl: `/videos/${id}`, checkpoints: [],
      status, processingError: status === 'Failed' ? 'falhou' : null, hasSd480: status === 'Ready',
    },
  };
}

describe('day planner catalog', () => {
  it('leaves videos that are not ready out of the day planner', () => {
    const library = [libraryVideo('ok', 'Ready'), libraryVideo('busy', 'Processing'), libraryVideo('bad', 'Failed')];
    const course = { id: 'c-1', title: 'Ergonomia', videos: [library[0].video, library[1].video, library[2].video], modules: [] } as unknown as PlatformCourse;

    const catalog = buildCatalog([course], library, []);

    expect([...catalog.videos.keys()]).toEqual(['ok']);
    expect(catalog.subjects.flatMap(subject => subject.videoIds)).toEqual(['ok']);
  });
});

describe('extras in the day planner catalog', () => {
  const external = (id: string, ms: number): PlatformLibraryVideo => ({
    ...libraryVideo(id, 'Ready'),
    video: { ...libraryVideo(id, 'Ready').video, provider: 'Vimeo', externalId: '123456789', fileUrl: '', durationMilliseconds: ms },
  });

  it('keeps the provider of each video and reads an old payload as house', () => {
    const catalog = buildCatalog([], [libraryVideo('h', 'Ready'), external('x', 0)], []);
    expect(catalog.videos.get('h')?.provider).toBe('Sipat');
    expect(catalog.videos.get('x')?.provider).toBe('Vimeo');
  });

  it('sums only house videos in a subject and in a day', () => {
    // an external video without a length is an extra; with its length it counts like a house video
    const library = [libraryVideo('h', 'Ready'), external('x', 0)];
    const course = { id: 'c-1', title: 'Ergonomia', videos: [library[0].video, library[1].video], modules: [] } as unknown as PlatformCourse;
    const catalog = buildCatalog([course], library, []);

    expect(catalog.subjects[0].totalMs).toBe(60000);
    expect(catalog.subjects[0].extraCount).toBe(1);
    const day = { key: 'k', title: 'Dia', date: '', subject: '', videos: ['h', 'x', null], games: [] };
    expect(dayDuration(day, catalog)).toBe(60000);
  });
});
