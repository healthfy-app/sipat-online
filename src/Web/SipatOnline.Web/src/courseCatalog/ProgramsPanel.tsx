import { CalendarDays } from 'lucide-react';
import type { PlatformCourse, SipatProgram } from '@/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { pluralize } from '@/courseEditor/courseFormat';
import { courseHint } from './ProgramForm';

export default function ProgramsPanel({ programs, courses, busy, onCreate, onEdit, onDelete }: {
  programs: SipatProgram[]; courses: PlatformCourse[]; busy: boolean;
  onCreate: () => void; onEdit: (program: SipatProgram) => void; onDelete: (program: SipatProgram) => void;
}) {
  const titleOf = (id: string) => {
    const course = courses.find(item => item.id === id);
    if (!course) return 'Curso removido';
    const hint = courseHint(course);
    return hint ? `${course.title} (${hint})` : course.title;
  };
  return <section aria-label="Programas da SIPAT" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <p className="m-0 text-sm text-muted-foreground">
        Um programa organiza os cursos em dias. Monte uma vez e aplique à SIPAT de qualquer empresa.
      </p>
      <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{pluralize(programs.length, 'programa', 'programas')}</span>
    </div>

    {programs.length === 0
      ? <EmptyState action={<Button onClick={onCreate}>Criar o primeiro programa</Button>} title="Nenhum programa ainda." />
      : <ul className="m-0 grid list-none gap-3 p-0">
        {programs.map(program => {
          const courseCount = program.days.reduce((total, day) => total + day.courseIds.length, 0);
          return <li className="grid gap-3 rounded-lg bg-card p-4 shadow-card" key={program.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-0.5">
                <strong className="text-base font-semibold">{program.title}</strong>
                <span className="text-[0.8125rem] text-muted-foreground">{pluralize(program.days.length, 'dia', 'dias')} · {pluralize(courseCount, 'curso', 'cursos')}</span>
              </div>
              <div className="flex gap-1.5">
                <Button aria-label={`Editar programa ${program.title}`} disabled={busy} onClick={() => onEdit(program)} size="sm" variant="outline">Editar</Button>
                <Button aria-label={`Remover programa ${program.title}`} disabled={busy} onClick={() => onDelete(program)} size="sm" variant="destructive">Remover</Button>
              </div>
            </div>
            <ol className="m-0 grid list-none gap-2 p-0">
              {program.days.map((day, index) => <li className="flex items-start gap-3 rounded-md bg-muted/60 px-3 py-2.5" key={index}>
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><CalendarDays className="size-4" /></span>
                <div className="grid min-w-0 gap-0.5">
                  <span className="text-sm font-semibold">{day.title}</span>
                  <span className="text-[0.8125rem] text-muted-foreground [overflow-wrap:anywhere]">{day.courseIds.map(titleOf).join(' · ')}</span>
                </div>
              </li>)}
            </ol>
          </li>;
        })}
      </ul>}
  </section>;
}
