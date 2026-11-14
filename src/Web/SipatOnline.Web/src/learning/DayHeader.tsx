import { BookOpen, Check } from 'lucide-react';
import type { DayGroup } from './learningHelpers';
import ProgressBar from './ProgressBar';

/** Heading of one day of the SIPAT program on "Meus cursos". */
export default function DayHeader({ group, titleId }: { group: DayGroup; titleId: string }) {
  const done = group.total > 0 && group.completed === group.total;
  const started = group.percentage > 0;
  const state = done ? 'is-done' : started ? 'is-progress' : '';
  return <header className="learning-day-header">
    <span aria-hidden="true" className={`learning-day-number ${state}`}>
      {done ? <Check /> : group.position ?? <BookOpen />}
    </span>
    <div className="learning-day-heading">
      <h3 id={titleId}>{group.title}</h3>
      <p>{group.completed} de {group.total} {group.total === 1 ? 'curso concluído' : 'cursos concluídos'}</p>
    </div>
    <div className={`learning-day-progress ${state}`}>
      <ProgressBar label={`Progresso de ${group.title}`} value={group.percentage} />
    </div>
  </header>;
}
