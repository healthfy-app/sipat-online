import { ArrowRight, BookOpen, Check, Circle, CircleCheck, Play } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { LearningTrackCard } from '@/api';
import {
  getTrackDisplayTitle, getTrackPath, getTrackProgress,
  type DayGroup,
} from './learningHelpers';
import ProgressBar from './ProgressBar';
import './TrailPath.css';

/** Height of one step of the path and where its node sits (the line is drawn between node centers). */
const row = 112;
const nodeX = [60, 110];
const lineWidth = 170;

type StepState = 'done' | 'current' | 'upcoming';

function stateOf(day: DayGroup, index: number, currentIndex: number): StepState {
  if (day.total > 0 && day.completed === day.total) return 'done';
  return index === currentIndex ? 'current' : 'upcoming';
}

/**
 * "Sua trilha" as a path: one node per day of the SIPAT program, winding down the left.
 * Every day is open: tapping one shows its courses on the right, and the next course to do is one tap away.
 */
export default function TrailPath({ days, allTracks }: { days: DayGroup[]; allTracks: LearningTrackCard[] }) {
  const firstOpen = days.findIndex(day => day.completed < day.total);
  const currentIndex = firstOpen >= 0 ? firstOpen : days.length - 1;
  const [openIndex, setOpenIndex] = useState(currentIndex);
  // a new day becoming current (the participant finished one) moves the panel along with the path
  useEffect(() => { setOpenIndex(currentIndex); }, [currentIndex, days.length]);

  const open = days[Math.min(openIndex, days.length - 1)];
  const openState = stateOf(open, openIndex, currentIndex);
  const nextCourse = open.tracks.find(track => getTrackProgress(track) < 100);
  const nextStarted = nextCourse ? getTrackProgress(nextCourse) > 0 : false;

  const center = (index: number) => ({ x: nodeX[index % 2], y: row * index + row / 2 });
  const segments = days.slice(0, -1).map((_, index) => {
    const from = center(index); const to = center(index + 1);
    return { index, d: `M${from.x} ${from.y}C${from.x} ${from.y + row / 2} ${to.x} ${to.y - row / 2} ${to.x} ${to.y}`, walked: index < currentIndex };
  });

  return <section aria-labelledby="learning-trail-title" className="learning-trail">
    <div className="learning-trail-heading">
      <h2 id="learning-trail-title">Sua trilha</h2>
      <p>Toque em um dia para ver os cursos. Você pode ir para qualquer um, na ordem que preferir.</p>
    </div>

    <div className="learning-trail-body">
      <ol aria-label="Dias da trilha" className="learning-trail-path" style={{ height: row * days.length }}>
        <svg aria-hidden="true" className="learning-trail-line" height={row * days.length} width={lineWidth}>
          {segments.map(segment => <path className={segment.walked ? 'is-walked' : 'is-ahead'} d={segment.d} key={segment.index} />)}
        </svg>
        {days.map((day, index) => {
          const state = stateOf(day, index, currentIndex);
          const isOpen = index === openIndex;
          return <li className={`learning-trail-step is-${state}${isOpen ? ' is-open' : ''}`} key={day.key}
            style={{ '--node-x': `${nodeX[index % 2] - 26}px`, top: row * index, height: row } as CSSProperties}>
            <button aria-controls="learning-trail-panel" aria-current={state === 'current' ? 'step' : undefined} aria-pressed={isOpen}
              className="learning-trail-button" onClick={() => setOpenIndex(index)} type="button">
              <span aria-hidden="true" className="learning-trail-node">
                {state === 'done' ? <Check /> : day.position ?? <BookOpen />}
              </span>
              <span className="learning-trail-label">
                <strong>{day.title}</strong>
                <small>{day.completed} de {day.total} {day.total === 1 ? 'curso' : 'cursos'}</small>
              </span>
            </button>
          </li>;
        })}
      </ol>

      <div aria-live="polite" className={`learning-trail-panel is-${openState}`} id="learning-trail-panel" key={open.key}>
        <header>
          <span aria-hidden="true" className="learning-trail-panel-number">{openState === 'done' ? <Check /> : open.position ?? <BookOpen />}</span>
          <div>
            <h3>{open.title}</h3>
            <p>{open.completed} de {open.total} {open.total === 1 ? 'curso concluído' : 'cursos concluídos'}</p>
          </div>
        </header>
        <ProgressBar label={`Progresso de ${open.title}`} value={open.percentage} />
        <ul className="learning-trail-courses">
          {open.tracks.map(track => {
            const percentage = getTrackProgress(track);
            const done = percentage === 100;
            const started = percentage > 0;
            const Icon = done ? CircleCheck : started ? Play : Circle;
            return <li key={track.id}>
              <Link className={`learning-trail-course${done ? ' is-done' : started ? ' is-started' : ''}`} to={getTrackPath(track, allTracks)}>
                <Icon aria-hidden="true" />
                <span className="learning-trail-course-title">{getTrackDisplayTitle(track.title)}</span>
                <span className="learning-trail-course-state">
                  {done ? 'Concluído' : started ? `${track.completedLessonCount} de ${track.lessonCount} aulas` : 'Para fazer'}
                </span>
              </Link>
            </li>;
          })}
        </ul>
        {nextCourse
          ? <Link className="learning-trail-action" to={getTrackPath(nextCourse, allTracks)}>
              <span>{nextStarted ? 'Continuar' : 'Começar'}: {getTrackDisplayTitle(nextCourse.title)}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          : <Link className="learning-trail-action is-done" to="/learning/certificates">
              <span>Dia concluído. Ver certificados</span>
              <ArrowRight aria-hidden="true" />
            </Link>}
      </div>
    </div>
  </section>;
}
