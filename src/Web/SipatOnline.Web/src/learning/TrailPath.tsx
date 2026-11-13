import { BookOpen, Check, Circle, CircleCheck, Play } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import CourseDialog from '@/CourseDialog';
import type { LearningTrackCard } from '@/api';
import {
  getTrackDisplayTitle, getTrackPath, getTrackProgress,
  type DayGroup,
} from './learningHelpers';
import ProgressBar from './ProgressBar';
import './TrailPath.css';

/** Width of one step of the path, the heights of the two lanes the nodes alternate between, and the path height. */
const column = 156;
const lanes = [52, 108];
const height = 232;
const nodeRadius = 26;

type StepState = 'done' | 'current' | 'upcoming';

function stateOf(day: DayGroup, index: number, currentIndex: number): StepState {
  if (day.total > 0 && day.completed === day.total) return 'done';
  return index === currentIndex ? 'current' : 'upcoming';
}

/**
 * "Sua trilha" as a path: one node per day of the SIPAT program, winding along the page. `flow` says which
 * way it walks (left by default: day 1 starts at the right end). Every day is open: tapping one opens a
 * window that only lists the courses of that day, each one a link.
 */
export default function TrailPath({ days, allTracks, flow = 'left' }: {
  days: DayGroup[]; allTracks: LearningTrackCard[]; flow?: 'left' | 'right';
}) {
  const firstOpen = days.findIndex(day => day.completed < day.total);
  const currentIndex = firstOpen >= 0 ? firstOpen : days.length - 1;
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const dir = flow === 'left' ? -1 : 1;
  const centerX = (index: number) => (flow === 'left' ? days.length - 1 - index : index) * column + column / 2;
  const centerY = (index: number) => lanes[index % 2];

  // bring the current day into view inside the strip (without scrolling the page)
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    box.scrollLeft = Math.max(0, centerX(currentIndex) - box.clientWidth / 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, days.length, flow]);

  const segments = days.slice(0, -1).map((_, index) => {
    const x1 = centerX(index); const y1 = centerY(index);
    const x2 = centerX(index + 1); const y2 = centerY(index + 1);
    return { index, d: `M${x1} ${y1}C${x1 + dir * column / 2} ${y1} ${x2 - dir * column / 2} ${y2} ${x2} ${y2}`, walked: index < currentIndex };
  });
  const width = column * days.length;
  const open = modalIndex === null ? null : days[modalIndex];
  const nextCourse = open?.tracks.find(track => getTrackProgress(track) < 100);

  return <section aria-labelledby="learning-trail-title" className="learning-trail">
    <div className="learning-trail-heading">
      <h2 id="learning-trail-title">Sua trilha</h2>
      <p>Toque em um dia para ver os cursos. Você pode ir para qualquer um, na ordem que preferir.</p>
    </div>

    <div className="learning-trail-scroller" ref={scroller}>
      <ol aria-label="Dias da trilha" className="learning-trail-path" style={{ width, height }}>
        <svg aria-hidden="true" className="learning-trail-line" height={height} width={width}>
          {segments.map(segment => <path className={segment.walked ? 'is-walked' : 'is-ahead'} d={segment.d} key={segment.index} />)}
        </svg>
        {days.map((day, index) => {
          const state = stateOf(day, index, currentIndex);
          return <li className={`learning-trail-step is-${state}`} key={day.key}
            style={{ left: centerX(index) - column / 2, width: column, '--node-top': `${centerY(index) - nodeRadius}px` } as CSSProperties}>
            <button aria-current={state === 'current' ? 'step' : undefined} aria-haspopup="dialog" className="learning-trail-button"
              onClick={() => setModalIndex(index)} type="button">
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
    </div>

    {open && <CourseDialog className="learning-dialog learning-trail-dialog" onClose={() => setModalIndex(null)} title={open.title}>
      <p className="learning-trail-dialog-summary">
        {open.completed} de {open.total} {open.total === 1 ? 'curso concluído' : 'cursos concluídos'}
      </p>
      <ProgressBar label={`Progresso de ${open.title}`} value={open.percentage} />
      <ul className="learning-trail-courses">
        {open.tracks.map(track => {
          const percentage = getTrackProgress(track);
          const done = percentage === 100;
          const started = percentage > 0;
          const isNext = track.id === nextCourse?.id;
          const Icon = done ? CircleCheck : started ? Play : Circle;
          return <li key={track.id}>
            <Link className={`learning-trail-course${done ? ' is-done' : isNext ? ' is-next' : ''}`} to={getTrackPath(track, allTracks)}>
              <Icon aria-hidden="true" />
              <span className="learning-trail-course-title">{getTrackDisplayTitle(track.title)}</span>
              <span className="learning-trail-course-state">
                {done ? 'Concluído' : started ? `${track.completedLessonCount} de ${track.lessonCount} aulas` : isNext ? 'Próximo' : 'Para fazer'}
              </span>
            </Link>
          </li>;
        })}
      </ul>
    </CourseDialog>}
  </section>;
}
