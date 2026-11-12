import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '@/api';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/page';
import { getCourseOption, pluralize, type CourseOption } from '@/courseEditor/courseFormat';
import CourseCard from './CourseCard';
import { SegmentedControl } from './SegmentedControl';

type StatusFilter = 'all' | PlatformCourseStatus;
type OptionFilter = 'all' | CourseOption;

const optionFilters: { value: OptionFilter; label: string; short?: string }[] = [
  { value: 'all', label: 'Todas as opções', short: 'Todas' },
  { value: '1', label: 'Opção 1' },
  { value: '2', label: 'Opção 2' },
  { value: '3', label: 'Opção 3' },
];

export default function CoursesPanel({
  courses,
  busy,
  onOpen,
  onDuplicate,
}: {
  courses: PlatformCourse[];
  busy: boolean;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [option, setOption] = useState<OptionFilter>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return courses.filter((course) =>
      (status === 'all' || course.status === status)
      && (option === 'all' || getCourseOption(course.description) === option)
      && (!term
        || course.title.toLocaleLowerCase('pt-BR').includes(term)
        || (course.description ?? '').toLocaleLowerCase('pt-BR').includes(term)));
  }, [courses, option, search, status]);

  const hasFilters = search.trim() !== '' || status !== 'all' || option !== 'all';

  return (
    <section aria-label="Cursos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
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
        <SegmentedControl
          className="max-sm:order-3 max-sm:w-full"
          label="Opções de grade"
          onChange={setOption}
          options={optionFilters}
          value={option}
        />
        <span aria-live="polite" className="ml-auto whitespace-nowrap text-[0.8125rem] tabular-nums text-muted-foreground max-sm:ml-0">
          {hasFilters ? `${filtered.length} de ${courses.length}` : pluralize(courses.length, 'curso', 'cursos')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          action={(
            <Button onClick={() => { setSearch(''); setStatus('all'); setOption('all'); }} variant="outline">
              Limpar filtros
            </Button>
          )}
          title="Nenhum curso corresponde aos filtros."
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] gap-4">
          {filtered.map((course) => (
            <CourseCard busy={busy} course={course} key={course.id}
              onDuplicate={() => onDuplicate(course)} onOpen={() => onOpen(course)} />
          ))}
        </div>
      )}
    </section>
  );
}
