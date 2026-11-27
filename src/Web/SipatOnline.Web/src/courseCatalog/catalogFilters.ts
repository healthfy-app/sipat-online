import type { CourseCategory, GameModule, PlatformCourse, PlatformLibraryVideo } from '@/api';
import { sipatPhase, type SipatPhase } from '@/sipatBuilder/sipatPhase';

/** 'active' (what the list opens on: everything but the ended and the finished), 'all', or one phase. */
export type StatusFilter = 'active' | 'all' | SipatPhase;
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
export interface CourseOwner {
  tenantId: string; companyName: string; status: 'Draft' | 'Published' | 'Cancelled';
  /** The company's training this content belongs to, with its period and how many days it has. */
  sipatEventId: string; startsAt?: string; endsAt?: string; days?: number;
}

const fold = (text: string) => text.toLocaleLowerCase('pt-BR');

/** Where a training stands. A company's follows its dates; a template (no company) is only a draft or published. */
export function coursePhase(course: Pick<PlatformCourse, 'status'>, owner?: CourseOwner, now: Date = new Date()): SipatPhase {
  if (!owner) return course.status === 'Published' ? 'published' : 'draft';
  if (!owner.startsAt || !owner.endsAt) return owner.status === 'Cancelled' ? 'cancelled' : owner.status === 'Published' ? 'published' : 'draft';
  return sipatPhase({ status: owner.status, startsAt: owner.startsAt, endsAt: owner.endsAt }, owner.days ?? 0, now);
}

export function hasCourseFilters(filters: CatalogFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'active' || filters.category !== 'all' || filters.owner !== 'all';
}

export function filterCourses(courses: PlatformCourse[], categories: CourseCategory[], filters: CatalogFilters, owners: Map<string, CourseOwner> = new Map()): PlatformCourse[] {
  const known = new Set(categories.map((item) => item.id));
  const term = fold(filters.query.trim());
  const inPhase = (course: PlatformCourse) => {
    if (filters.status === 'all') return true;
    const phase = coursePhase(course, owners.get(course.id));
    return filters.status === 'active' ? phase !== 'cancelled' && phase !== 'finished' : phase === filters.status;
  };
  return courses.filter((course) =>
    inPhase(course)
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
