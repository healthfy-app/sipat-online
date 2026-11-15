import { describe, expect, it } from 'vitest';
import type { PlatformCourse, PlatformCourseVideo, PlatformLibraryVideo } from '@/api';
import { buildCatalog } from './model';

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
