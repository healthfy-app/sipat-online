import { useMemo } from 'react';
import type { CourseCategory, PlatformCourse } from '@/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import CourseCard from './CourseCard';

/** The subjects of the library as cards. The list arrives already filtered by the toolbar above the tabs. */
export default function CoursesPanel({
  courses,
  categories,
  onClearFilters,
  busy,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  courses: PlatformCourse[];
  categories: CourseCategory[];
  onClearFilters: () => void;
  busy: boolean;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onDelete: (course: PlatformCourse) => void;
}) {
  const categoryNames = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);

  return (
    <section aria-label="Cursos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {courses.length === 0 ? (
        <EmptyState
          action={<Button onClick={onClearFilters} variant="outline">Limpar filtros</Button>}
          title="Nenhum curso corresponde aos filtros."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CourseCard busy={busy} categoryName={course.categoryId ? categoryNames.get(course.categoryId) : null} course={course} key={course.id}
              onDelete={() => onDelete(course)} onDuplicate={() => onDuplicate(course)} onOpen={() => onOpen(course)} />
          ))}
        </div>
      )}
    </section>
  );
}
