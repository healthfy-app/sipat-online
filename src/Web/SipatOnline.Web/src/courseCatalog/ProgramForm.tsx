import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { createSipatProgram, updateSipatProgram, type PlatformCourse, type ProgramDay, type SipatProgram } from '@/api';
import { Button } from '@/components/ui/button';
import { DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

const maxDays = 14;
const maxCoursesPerDay = 20;

/** First line of the description, to tell apart courses that share a title. */
export function courseHint(course: PlatformCourse | undefined) {
  const line = course?.description?.split(/\r?\n/)[0]?.trim() ?? '';
  return line.length > 70 ? `${line.slice(0, 67)}...` : line;
}

function move<T>(items: T[], from: number, to: number) {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Builds a program: a title and days, each day with a free title and its courses in order. */
export default function ProgramForm({ program, courses, onBusyChange, onCancel, onSaved }: {
  program: SipatProgram | null; courses: PlatformCourse[];
  onBusyChange: (busy: boolean) => void; onCancel: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(program?.title ?? '');
  const [days, setDays] = useState<ProgramDay[]>(program?.days ?? [{ title: 'Dia 1', courseIds: [] }]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const used = new Set(days.flatMap(day => day.courseIds));
  const available = courses.filter(course => !used.has(course.id));
  const courseById = (id: string) => courses.find(course => course.id === id);
  const updateDay = (index: number, change: Partial<ProgramDay>) =>
    setDays(current => current.map((day, position) => (position === index ? { ...day, ...change } : day)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (days.some(day => day.courseIds.length === 0)) {
      setError('Cada dia precisa de pelo menos um curso. Remova os dias vazios ou adicione cursos a eles.');
      return;
    }
    setIsSaving(true); onBusyChange(true);
    const data = { title: title.trim(), days: days.map(day => ({ title: day.title.trim(), courseIds: day.courseIds })) };
    try {
      if (program) await updateSipatProgram(program.id, data); else await createSipatProgram(data);
      await onSaved(program ? `O programa "${data.title}" foi atualizado.` : `O programa "${data.title}" foi criado.`);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setIsSaving(false); onBusyChange(false); }
  }

  return <form className="grid gap-4" onSubmit={submit}>
    <p className="m-0 text-sm text-muted-foreground">
      Cada dia é um cartão para o participante, com o título que você escolher (por exemplo "Dia 1 · Segurança no chão de fábrica").
      A ordem aqui é a ordem que ele vê.
    </p>
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    <Field htmlFor="program-title" label="Nome do programa">
      <Input data-autofocus id="program-title" maxLength={200} placeholder="Ex.: SIPAT 2026" required value={title} onChange={event => setTitle(event.target.value)} />
    </Field>

    {days.map((day, dayIndex) => <fieldset className="m-0 grid gap-3 rounded-lg border border-border p-4" key={dayIndex}>
      <legend className="px-1 text-[0.8125rem] font-semibold">Dia {dayIndex + 1}</legend>
      <div className="flex items-end gap-2">
        <Field className="min-w-0 flex-1" htmlFor={`program-day-title-${dayIndex}`} label={`Título do dia ${dayIndex + 1}`}>
          <Input id={`program-day-title-${dayIndex}`} maxLength={120} placeholder="Ex.: Dia 1 · Segurança no chão de fábrica" required
            value={day.title} onChange={event => updateDay(dayIndex, { title: event.target.value })} />
        </Field>
        <Button aria-label={`Subir dia ${dayIndex + 1}`} disabled={dayIndex === 0} onClick={() => setDays(current => move(current, dayIndex, dayIndex - 1))} size="icon" variant="ghost"><ArrowUp /></Button>
        <Button aria-label={`Descer dia ${dayIndex + 1}`} disabled={dayIndex === days.length - 1} onClick={() => setDays(current => move(current, dayIndex, dayIndex + 1))} size="icon" variant="ghost"><ArrowDown /></Button>
        <Button aria-label={`Remover dia ${dayIndex + 1}`} disabled={days.length === 1} onClick={() => setDays(current => current.filter((_, position) => position !== dayIndex))} size="icon" variant="ghost"><Trash2 /></Button>
      </div>

      {day.courseIds.length > 0 && <ol className="m-0 grid list-none gap-1.5 p-0">
        {day.courseIds.map((courseId, courseIndex) => {
          const course = courseById(courseId);
          return <li className="flex items-center gap-2 rounded-md bg-muted/60 py-1.5 pr-1.5 pl-3" key={courseId}>
            <span className="min-w-0 flex-1 text-sm font-medium [overflow-wrap:anywhere]">
              {course?.title ?? 'Curso removido'}
              {courseHint(course) && <span className="ml-2 text-xs font-normal text-muted-foreground">{courseHint(course)}</span>}
              {course && course.status !== 'Published' && <span className="ml-2 text-xs font-semibold text-warning">Rascunho: publique antes de aplicar</span>}
            </span>
            <Button aria-label={`Subir ${course?.title ?? 'curso'}`} disabled={courseIndex === 0} onClick={() => updateDay(dayIndex, { courseIds: move(day.courseIds, courseIndex, courseIndex - 1) })} size="icon-sm" variant="ghost"><ArrowUp /></Button>
            <Button aria-label={`Descer ${course?.title ?? 'curso'}`} disabled={courseIndex === day.courseIds.length - 1} onClick={() => updateDay(dayIndex, { courseIds: move(day.courseIds, courseIndex, courseIndex + 1) })} size="icon-sm" variant="ghost"><ArrowDown /></Button>
            <Button aria-label={`Tirar ${course?.title ?? 'curso'} do dia ${dayIndex + 1}`} onClick={() => updateDay(dayIndex, { courseIds: day.courseIds.filter(id => id !== courseId) })} size="icon-sm" variant="ghost"><Trash2 /></Button>
          </li>;
        })}
      </ol>}

      {day.courseIds.length < maxCoursesPerDay && <Field htmlFor={`program-add-course-${dayIndex}`} label={`Adicionar curso ao dia ${dayIndex + 1}`}>
        <NativeSelect disabled={available.length === 0} id={`program-add-course-${dayIndex}`} value=""
          onChange={event => { if (event.target.value) updateDay(dayIndex, { courseIds: [...day.courseIds, event.target.value] }); }}>
          <option value="">{available.length === 0 ? 'Todos os cursos já foram usados' : 'Escolha um curso...'}</option>
          {available.map(course => <option key={course.id} value={course.id}>{course.title}{courseHint(course) ? ` · ${courseHint(course)}` : ''}{course.status !== 'Published' ? ' (rascunho)' : ''}</option>)}
        </NativeSelect>
      </Field>}
    </fieldset>)}

    {days.length < maxDays && <Button className="justify-self-start" onClick={() => setDays(current => [...current, { title: `Dia ${current.length + 1}`, courseIds: [] }])} variant="outline">
      <Plus /> Adicionar dia
    </Button>}

    <DialogActions>
      <Button disabled={isSaving} onClick={onCancel} variant="outline">Cancelar</Button>
      <Button disabled={isSaving} type="submit">{isSaving ? 'Salvando...' : program ? 'Salvar programa' : 'Criar programa'}</Button>
    </DialogActions>
  </form>;
}
