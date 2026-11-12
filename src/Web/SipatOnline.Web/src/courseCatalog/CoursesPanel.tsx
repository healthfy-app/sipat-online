import { useMemo, useState } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '../api';
import { getCourseOption, pluralize, type CourseOption } from '../courseEditor/courseFormat';
import CourseCard from './CourseCard';

type StatusFilter = 'all' | PlatformCourseStatus;
type OptionFilter = 'all' | CourseOption;

const optionFilters: { value: OptionFilter; label: string }[] = [
  { value: 'all', label: 'Todas as opções' },
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

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setOption('all');
  }

  return (
    <section aria-label="Cursos cadastrados" className="cat-panel">
      <div className="cat-toolbar">
        <label className="cat-search">
          <SearchIcon />
          <input
            aria-label="Buscar curso"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou descrição"
            type="search"
            value={search}
          />
        </label>
        <select aria-label="Status" className="cat-select" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}>
          <option value="all">Todos os status</option>
          <option value="Draft">Rascunho</option>
          <option value="Published">Publicado</option>
        </select>
        <div aria-label="Opções de grade" className="cat-segmented" role="group">
          {optionFilters.map((item) => (
            <button aria-pressed={option === item.value} key={item.value} onClick={() => setOption(item.value)} type="button">
              {item.value === 'all' ? <>Todas<span className="cat-hide-narrow"> as opções</span></> : item.label}
            </button>
          ))}
        </div>
        <span aria-live="polite" className="cat-result-count">
          {hasFilters ? `${filtered.length} de ${courses.length}` : pluralize(courses.length, 'curso', 'cursos')}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="cat-empty">
          <p>Nenhum curso corresponde aos filtros.</p>
          <button className="cat-btn" onClick={clearFilters} type="button">Limpar filtros</button>
        </div>
      ) : (
        <div className="cat-grid">
          {filtered.map((course) => (
            <CourseCard busy={busy} course={course} key={course.id}
              onDuplicate={() => onDuplicate(course)} onOpen={() => onOpen(course)} />
          ))}
        </div>
      )}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="m10.5 10.5 3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
