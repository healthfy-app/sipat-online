import { ArrowLeft, ArrowRight, CalendarDays, Check, Play, Trophy } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { LearningLessonProgress } from '@/api';
import { formatDuration } from '../learningHelpers';
import { extraLabel, type DayStanding } from './dayLessons';
import '../DayPage.css';

/*
 * The pieces of the day the participant watches, as they look on the screen. They only show what they are given:
 * the participant's page feeds them from the server, and the training's preview from the board being built.
 */

/** The top of the day: the way back, which day it is, its name, and how far the participant got. */
export function DayTop({ back, word, position, date, title, subtitle, standing, currentId }: {
  back: ReactNode;
  /** "Dia" or "Módulo". */
  word: string;
  position: number | null;
  /** Already written out ("sexta-feira, 4 de dezembro"). */
  date: string | null;
  title: string;
  subtitle: string | null;
  standing: DayStanding;
  currentId: string | null;
}) {
  return <header className="day-top">
    {back}
    <div className="day-heading">
      {(position !== null || date) && <p className="day-kicker">
        {position !== null && <span className="day-chip">{word} {position}</span>}
        {date && <span className="day-date"><CalendarDays aria-hidden="true" />{date}</span>}
      </p>}
      <h1>{title}</h1>
      {subtitle && <p className="day-subject">{subtitle}</p>}
    </div>
    <div className="day-progress">
      <span className="day-progress-text">{standing.completed} de {standing.counted.length} vídeos · {standing.percentage}%</span>
      <div aria-label="Progresso do dia" aria-valuemax={100} aria-valuemin={0} aria-valuenow={standing.percentage} className="day-progress-steps" role="progressbar">
        {standing.counted.map(lesson => <span className={lesson.isCompleted ? 'is-done' : lesson.id === currentId ? 'is-current' : ''} key={lesson.id}>
          {!lesson.isCompleted && <i style={{ width: `${Math.min(100, Math.max(0, lesson.watchedPercentage))}%` }} />}
        </span>)}
      </div>
    </div>
  </header>;
}

/** Every video of the day watched: the trophy, and where to go next. */
export function DayDone({ word, position, action }: { word: string; position: number | null; action: ReactNode }) {
  return <section aria-label={position !== null ? `${word} concluído` : 'Tudo assistido'} className="day-done" role="status">
    <span aria-hidden="true" className="day-done-icon"><Trophy /></span>
    <div>
      <strong>{position !== null ? `${word} ${position} concluído!` : 'Tudo assistido!'}</strong>
      <p>Você assistiu a todos os vídeos. Pode rever qualquer um quando quiser.</p>
    </div>
    {action}
  </section>;
}

/** The name of the video on stage, under "Vídeo 2 de 5" (or the mark of an extra). Give it the lesson as `key`. */
export function DayStageHead({ lesson, standing }: { lesson: LearningLessonProgress; standing: DayStanding }) {
  return <header className="day-stage-head">
    <p>{lesson.isBonus ? extraLabel(lesson) : `Vídeo ${standing.numberOf(lesson)} de ${standing.counted.length}`}</p>
    <h2>{lesson.title}</h2>
  </header>;
}

/** Back and forward between the videos of the day, with a quiet word on the one on stage in between. */
export function DayControls({ lesson, canGoBack, canGoForward, busy = false, onBack, onForward }: {
  lesson: LearningLessonProgress;
  canGoBack: boolean;
  canGoForward: boolean;
  /** A video is being changed: both wait. */
  busy?: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return <div className="day-controls">
    <button className="day-control" disabled={!canGoBack || busy} onClick={onBack} type="button">
      <ArrowLeft aria-hidden="true" /> <span>Vídeo anterior</span>
    </button>
    {lesson.isBonus
      ? <span className="day-status">{extraLabel(lesson)}</span>
      // a quiet line: done, or how much was watched; nothing before the video starts
      : <span className={`day-status${lesson.isCompleted ? ' is-complete' : ''}`}>
        {lesson.isCompleted
          ? <><Check aria-hidden="true" />Concluído</>
          : lesson.watchedPercentage > 0 ? `${lesson.watchedPercentage}% assistido` : null}
      </span>}
    <button className="day-control is-next" disabled={!canGoForward || busy} onClick={onForward} type="button">
      <span>Próximo<span className="day-control-long"> vídeo</span></span> <ArrowRight aria-hidden="true" />
    </button>
  </div>;
}

/** What the video is about, under the stage. Give it the lesson as `key`. */
export function DayAbout({ description }: { description: string }) {
  return <section aria-label="Sobre o vídeo" className="day-about">
    <h3>Sobre o vídeo</h3>
    <p>{description}</p>
  </section>;
}

/** "Vídeos do dia": every video in order, each with its number (or check) and how much of it was watched. */
export function DayPlaylist({ lessons, standing, currentId, playing, busy = false, onSelect }: {
  lessons: LearningLessonProgress[];
  standing: DayStanding;
  currentId: string | null;
  /** The video on stage is playing: its mark becomes moving bars. */
  playing: boolean;
  busy?: boolean;
  onSelect: (lesson: LearningLessonProgress) => void;
}) {
  const hasSections = new Set(lessons.map(lesson => lesson.sectionTitle).filter(Boolean)).size > 1;
  return <section aria-labelledby="learning-curriculum-title" className="day-playlist">
    <div className="day-playlist-head">
      <h2 id="learning-curriculum-title">Vídeos do dia</h2>
      <span>{standing.completed}/{standing.counted.length}</span>
    </div>
    <ol>
      {lessons.map((lesson, lessonIndex) => {
        const isCurrent = lesson.id === currentId;
        const showSection = hasSections && lesson.sectionTitle && lesson.sectionTitle !== lessons[lessonIndex - 1]?.sectionTitle;
        return (
          <li key={lesson.id} style={{ '--i': lessonIndex } as CSSProperties}>
            {showSection && <p className="day-section">{lesson.sectionTitle}</p>}
            <button
              aria-current={isCurrent ? 'step' : undefined}
              className={`day-item${isCurrent ? ' is-current' : ''}${lesson.isCompleted ? ' is-complete' : ''}${lesson.isBonus ? ' is-extra' : ''}`}
              disabled={busy}
              onClick={() => onSelect(lesson)}
              type="button"
            >
              <span aria-hidden="true" className="day-item-mark">
                {lesson.isBonus ? <Play /> : lesson.isCompleted ? <Check /> : isCurrent && playing
                  ? <span className="learning-playing-bars"><i /><i /><i /></span>
                  : standing.numberOf(lesson)}
              </span>
              <span className="day-item-copy">
                <span className="day-item-title">{lesson.title}</span>
                {lesson.isBonus
                  ? <span className="day-item-meta">{extraLabel(lesson)}</span>
                  : <span className="day-item-meta">
                    {formatDuration(lesson.durationMilliseconds)}
                    <span aria-hidden="true">·</span>
                    {lesson.isCompleted ? 'Concluído' : lesson.watchedPercentage > 0 ? `${lesson.watchedPercentage}% assistido` : 'Não iniciado'}
                  </span>}
                {!lesson.isBonus && !lesson.isCompleted && lesson.watchedPercentage > 0 && <span aria-hidden="true" className="day-item-progress">
                  <span style={{ width: `${Math.min(100, Math.max(0, lesson.watchedPercentage))}%` }} />
                </span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  </section>;
}
