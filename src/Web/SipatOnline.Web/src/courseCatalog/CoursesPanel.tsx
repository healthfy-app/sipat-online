import { Search, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CourseCategory, PlatformCourse, PlatformCourseStatus } from '@/api';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/page';
import { pluralize } from '@/courseEditor/courseFormat';
import CourseCard from './CourseCard';

type StatusFilter = 'all' | PlatformCourseStatus;
type CategoryFilter = 'all' | 'none' | string;

export default function CoursesPanel({
  courses,
  categories,
  onManageCategories,
  busy,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  courses: PlatformCourse[];
  categories: CourseCategory[];
  onManageCategories: () => void;
  busy: boolean;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onDelete: (course: PlatformCourse) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const categoryNames = useMemo(() => new Map(categories.map((item) => [item.id, item.name])), [categories]);
  const hasUncategorized = courses.some((course) => !course.categoryId || !categoryNames.has(course.categoryId));

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return courses.filter((course) =>
      (status === 'all' || course.status === status)
      && (category === 'all' || (category === 'none' ? !course.categoryId || !categoryNames.has(course.categoryId) : course.categoryId === category))
      && (!term
        || course.title.toLocaleLowerCase('pt-BR').includes(term)
        || (course.description ?? '').toLocaleLowerCase('pt-BR').includes(term)));
  }, [categoryNames, courses, category, search, status]);

  const hasFilters = search.trim() !== '' || status !== 'all' || category !== 'all';

  return (
    <section aria-label="Cursos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="library-filters flex flex-wrap items-center gap-2.5 rounded-[1.25rem] border border-[#dfe6e3] bg-white p-4">
        <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 size-4" />
          <Input
            aria-label="Buscar curso"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou descrição"
            type="search"
            value={search}
          />
        </label>
        <NativeSelect aria-label="Status" className="w-auto max-sm:flex-1" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
          <option value="all">Todos os status</option>
          <option value="Draft">Rascunho</option>
          <option value="Published">Publicado</option>
        </NativeSelect>
        <NativeSelect aria-label="Filtrar por categoria" className="w-auto max-sm:flex-1" onChange={(event) => setCategory(event.target.value)} value={category}>
          <option value="all">Todas as categorias</option>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          {hasUncategorized && categories.length > 0 && <option value="none">Sem categoria</option>}
        </NativeSelect>
        <Button className="max-sm:order-3" onClick={onManageCategories} size="sm" variant="outline"><Settings2 /> Gerenciar categorias</Button>
        <span aria-live="polite" className="ml-auto whitespace-nowrap text-[0.8125rem] tabular-nums text-muted-foreground max-sm:ml-0">
          {hasFilters ? `${filtered.length} de ${courses.length}` : pluralize(courses.length, 'curso', 'cursos')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          action={(
            <Button onClick={() => { setSearch(''); setStatus('all'); setCategory('all'); }} variant="outline">
              Limpar filtros
            </Button>
          )}
          title="Nenhum curso corresponde aos filtros."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard busy={busy} categoryName={course.categoryId ? categoryNames.get(course.categoryId) : null} course={course} key={course.id}
              onDelete={() => onDelete(course)} onDuplicate={() => onDuplicate(course)} onOpen={() => onOpen(course)} />
          ))}
        </div>
      )}
    </section>
  );
}
