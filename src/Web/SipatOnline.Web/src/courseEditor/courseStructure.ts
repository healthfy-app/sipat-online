import type { CourseLessonDraft, PlatformCourse } from '../api';
import { courseLessons } from './courseTrack';

/** Estrutura editável (aulas > vídeos) montada a partir do curso salvo. */
export function toDrafts(course: PlatformCourse): CourseLessonDraft[] {
  const videoById = new Map(course.videos.map((video) => [video.id, video]));
  return courseLessons(course).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    videos: lesson.videoIds.flatMap((videoId) => {
      const video = videoById.get(videoId);
      if (!video) return [];
      const overridden = video.libraryTitle != null && video.title !== video.libraryTitle;
      return [{ videoId, title: overridden ? video.title : null }];
    }),
  }));
}

const mapLesson = (drafts: CourseLessonDraft[], id: string | null, change: (lesson: CourseLessonDraft) => CourseLessonDraft) =>
  drafts.map((lesson) => (lesson.id === id ? change(lesson) : lesson));

export const renameLesson = (drafts: CourseLessonDraft[], id: string, title: string) =>
  mapLesson(drafts, id, (lesson) => ({ ...lesson, title }));

export const describeLesson = (drafts: CourseLessonDraft[], id: string, description: string) =>
  mapLesson(drafts, id, (lesson) => ({ ...lesson, description: description.trim() || null }));

export const addLesson = (drafts: CourseLessonDraft[]) => [
  ...drafts,
  { id: null, title: `Aula ${drafts.length + 1}`, description: null, videos: [] },
];

export const removeLesson = (drafts: CourseLessonDraft[], id: string) => drafts.filter((lesson) => lesson.id !== id);

export function moveLesson(drafts: CourseLessonDraft[], id: string, offset: -1 | 1) {
  const index = drafts.findIndex((lesson) => lesson.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= drafts.length) return drafts;
  const next = [...drafts];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const addVideoToLesson = (drafts: CourseLessonDraft[], lessonId: string | null, videoId: string) =>
  mapLesson(drafts, lessonId, (lesson) => ({ ...lesson, videos: [...lesson.videos, { videoId, title: null }] }));

export const retitleVideo = (drafts: CourseLessonDraft[], videoId: string, title: string | null) =>
  drafts.map((lesson) => ({
    ...lesson,
    videos: lesson.videos.map((video) => (video.videoId === videoId ? { ...video, title } : video)),
  }));

export const removeVideo = (drafts: CourseLessonDraft[], videoId: string) =>
  drafts.map((lesson) => ({ ...lesson, videos: lesson.videos.filter((video) => video.videoId !== videoId) }));

/** Sobe/desce um vídeo; passando da ponta de uma aula ele muda para a aula vizinha. */
export function moveVideoInStructure(drafts: CourseLessonDraft[], videoId: string, offset: -1 | 1) {
  const lessonIndex = drafts.findIndex((lesson) => lesson.videos.some((video) => video.videoId === videoId));
  if (lessonIndex < 0) return drafts;
  const next = drafts.map((lesson) => ({ ...lesson, videos: [...lesson.videos] }));
  const list = next[lessonIndex].videos;
  const index = list.findIndex((video) => video.videoId === videoId);
  const target = index + offset;
  if (target >= 0 && target < list.length) {
    [list[index], list[target]] = [list[target], list[index]];
    return next;
  }
  const neighbour = next[lessonIndex + offset];
  if (!neighbour) return drafts;
  const [moved] = list.splice(index, 1);
  if (offset === -1) neighbour.videos.push(moved);
  else neighbour.videos.unshift(moved);
  return next;
}
