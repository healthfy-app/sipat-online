import type { CourseCategory, GameModule, PlatformCourse, PlatformCourseStatus, PlatformLibraryVideo } from '@/api';

export type StatusFilter = 'all' | PlatformCourseStatus;
/** 'all', 'none' (subjects without a category) or the id of a category. */
export type CategoryFilter = string;

export interface CatalogFilters {
  query: string;
  status: StatusFilter;
  category: CategoryFilter;
}

const fold = (text: string) => text.toLocaleLowerCase('pt-BR');

export function hasCourseFilters(filters: CatalogFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.category !== 'all';
}

export function filterCourses(courses: PlatformCourse[], categories: CourseCategory[], filters: CatalogFilters): PlatformCourse[] {
  const known = new Set(categories.map((item) => item.id));
  const term = fold(filters.query.trim());
  return courses.filter((course) =>
    (filters.status === 'all' || course.status === filters.status)
    && (filters.category === 'all'
      || (filters.category === 'none' ? !course.categoryId || !known.has(course.categoryId) : course.categoryId === filters.category))
    && (!term || fold(course.title).includes(term) || fold(course.description ?? '').includes(term)));
}

export function filterVideos(library: PlatformLibraryVideo[], query: string): PlatformLibraryVideo[] {
  const term = fold(query.trim());
  return term ? library.filter((item) => fold(item.video.title).includes(term)) : library;
}

export function filterModules(modules: GameModule[], query: string): GameModule[] {
  const term = fold(query.trim());
  return term ? modules.filter((module) => fold(module.title).includes(term)) : modules;
}
