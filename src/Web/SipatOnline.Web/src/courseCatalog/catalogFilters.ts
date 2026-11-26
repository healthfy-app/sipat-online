import type { CourseCategory, GameModule, PlatformCourse, PlatformCourseStatus, PlatformLibraryVideo } from '@/api';

export type StatusFilter = 'all' | PlatformCourseStatus;
/** 'all', 'none' (subjects without a category) or the id of a category. */
export type CategoryFilter = string;

export interface CatalogFilters {
  query: string;
  status: StatusFilter;
  category: CategoryFilter;
  /** 'all', 'models' (the operation's own) or the id of a company: whose trainings to show. */
  owner: string;
}

/** A company's training in the list: whose it is and where it stands (its own status, not the content's). */
export interface CourseOwner { tenantId: string; companyName: string; status: 'Draft' | 'Published' | 'Cancelled' }

const fold = (text: string) => text.toLocaleLowerCase('pt-BR');

export function hasCourseFilters(filters: CatalogFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.category !== 'all' || filters.owner !== 'all';
}

export function filterCourses(courses: PlatformCourse[], categories: CourseCategory[], filters: CatalogFilters, owners: Map<string, CourseOwner> = new Map()): PlatformCourse[] {
  const known = new Set(categories.map((item) => item.id));
  const term = fold(filters.query.trim());
  return courses.filter((course) =>
    (filters.status === 'all' || (owners.get(course.id)?.status ?? course.status) === filters.status)
    && (filters.owner === 'all' || (filters.owner === 'models' ? !owners.has(course.id) : owners.get(course.id)?.tenantId === filters.owner))
    && (filters.category === 'all'
      || (filters.category === 'none' ? !course.categoryId || !known.has(course.categoryId) : course.categoryId === filters.category))
    && (!term || fold(course.title).includes(term) || fold(course.description ?? '').includes(term)));
}

export function filterVideos(library: PlatformLibraryVideo[], query: string): PlatformLibraryVideo[] {
  const term = fold(query.trim());
  return term ? library.filter((item) => fold(item.video.title).includes(term)) : library;
}

/** `subject`: '' every game, 'none' those without an assunto, or one assunto. */
export function filterModules(modules: GameModule[], query: string, subject = '', gameSubjects = new Map<string, string[]>()): GameModule[] {
  const term = fold(query.trim());
  return modules.filter((module) => {
    if (term && !fold(module.title).includes(term)) return false;
    if (!subject) return true;
    const ids = gameSubjects.get(module.id) ?? [];
    return subject === 'none' ? ids.length === 0 : ids.includes(subject);
  });
}
