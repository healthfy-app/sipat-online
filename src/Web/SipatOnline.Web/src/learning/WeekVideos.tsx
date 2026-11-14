import { Check, ChevronDown, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAssignedLearningTrack, type LearningLessonProgress, type LearningTrackCard } from '@/api';
import { getCourseCover } from '@/courseCover';
import { formatDuration, getTrackDisplayTitle, getTrackPath, type DayGroup } from './learningHelpers';
import ProgressBar from './ProgressBar';
import './WeekVideos.css';

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** "2026-11-09" -> "segunda-feira, 09/11". */
export function formatDayDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? null : weekday.format(value);
}

type LessonsByTrack = Record<string, LearningLessonProgress[] | 'error'>;

/**
 * The videos of the SIPAT week, day by day, three to a row. With a day chosen on the trail only that day shows;
 * with none, the whole week does. Each video opens the day at that video.
 */
export default function WeekVideos({ days, allTracks, selectedKey, onShowAll }: {
  days: DayGroup[]; allTracks: LearningTrackCard[]; selectedKey: string | null; onShowAll: () => void;
}) {
  const [lessons, setLessons] = useState<LessonsByTrack>({});
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => setClosed(known => { const next = new Set(known); if (!next.delete(key)) next.add(key); return next; });
  const trackIds = days.flatMap(day => day.tracks.map(track => track.id)).join(',');

  useEffect(() => {
    let current = true;
    for (const id of trackIds.split(',').filter(Boolean)) {
      getAssignedLearningTrack(id)
        .then(result => { if (current) setLessons(known => ({ ...known, [id]: result.lessons })); })
        .catch(() => { if (current) setLessons(known => ({ ...known, [id]: 'error' })); });
    }
    return () => { current = false; };
  }, [trackIds]);

  const shown = selectedKey ? days.filter(day => day.key === selectedKey) : days;
  const selected = selectedKey ? shown[0] : undefined;

  return <section aria-labelledby="week-videos-title" className="week-videos">
    <div className="week-videos-heading">
      <h2 id="week-videos-title">{selected ? selected.title : 'Vídeos da semana'}</h2>
      {selected
        ? <button className="week-videos-all" onClick={onShowAll} type="button">Ver a semana toda</button>
        : <p>Toque em um dia no caminho para ver só os vídeos dele.</p>}
    </div>

    <div className="week-videos-days">
      {shown.map((day, dayIndex) => {
        const total = day.tracks.reduce((sum, track) => sum + track.lessonCount, 0);
        const done = day.tracks.reduce((sum, track) => sum + track.completedLessonCount, 0);
        const date = formatDayDate(day.tracks[0]?.dayDate);
        const complete = total > 0 && done === total;
        const headingId = `week-day-${dayIndex}`;
        const bodyId = `week-day-body-${dayIndex}`;
        const open = !closed.has(day.key);
        return <section aria-labelledby={headingId} className={`week-day${open ? '' : ' is-collapsed'}`} key={day.key}>
          <header className="week-day-header">
            <span aria-hidden="true" className={`week-day-number${complete ? ' is-done' : done > 0 ? ' is-progress' : ''}`}>
              {complete ? <Check /> : day.position ?? '•'}
            </span>
            <div className="week-day-heading">
              <h3 id={headingId}>{day.position ? `Dia ${day.position} · ` : ''}{day.title}</h3>
              <p>{date ? `${date} · ` : ''}{done} de {total} {total === 1 ? 'vídeo assistido' : 'vídeos assistidos'}</p>
            </div>
            <div className="week-day-progress">
              <ProgressBar label={`Progresso de ${day.title}`} value={total === 0 ? 0 : Math.round((done / total) * 100)} />
            </div>
            <button
              aria-controls={bodyId}
              aria-expanded={open}
              aria-label={`${open ? 'Recolher' : 'Abrir'} ${day.position ? `Dia ${day.position}` : day.title}`}
              className="week-day-toggle"
              onClick={() => toggle(day.key)}
              type="button"
            ><ChevronDown aria-hidden="true" /></button>
          </header>
          <div className="week-day-body" id={bodyId} inert={!open}>
          <div className="week-day-body-inner">

          {day.tracks.map(track => {
            const items = lessons[track.id];
            const path = getTrackPath(track, allTracks);
            const cover = track.coverUrl ?? getCourseCover(track.title);
            const subject = getTrackDisplayTitle(track.title);
            const nextId = Array.isArray(items) ? items.find(lesson => !lesson.isCompleted)?.id : undefined;
            return <div className="week-day-track" key={track.id}>
              {(day.tracks.length > 1 || subject !== day.title) && <p className="week-day-subject">{subject}</p>}
              {items === undefined && <p className="week-videos-note" role="status">Carregando os vídeos...</p>}
              {items === 'error' && <p className="week-videos-note">
                Não foi possível listar os vídeos. <Link to={path}>Abrir o dia</Link>
              </p>}
              {Array.isArray(items) && <ol className="week-video-grid">
                {items.map((lesson, index) => {
                  const state = lesson.isCompleted ? 'done' : lesson.watchedPercentage > 0 ? 'progress' : lesson.id === nextId ? 'next' : 'todo';
                  return <li key={lesson.id}>
                    <Link className={`week-video is-${state}`} to={`${path}?video=${encodeURIComponent(lesson.id)}`}>
                      <span className="week-video-cover">
                        <img alt="" decoding="async" loading="lazy" src={cover} />
                        <span aria-hidden="true" className="week-video-play">{lesson.isCompleted ? <Check /> : <Play />}</span>
                        <span className="week-video-time">{formatDuration(lesson.durationMilliseconds)}</span>
                        {state === 'progress' && <span aria-hidden="true" className="week-video-bar"><span style={{ width: `${lesson.watchedPercentage}%` }} /></span>}
                      </span>
                      <span className="week-video-body">
                        <span className="week-video-kicker">Vídeo {index + 1}</span>
                        <strong>{lesson.title}</strong>
                        <span className="week-video-state">
                          {state === 'done' ? 'Assistido' : state === 'progress' ? `Continuar · ${Math.round(lesson.watchedPercentage)}%` : state === 'next' ? 'Próximo' : 'Para assistir'}
                        </span>
                      </span>
                    </Link>
                  </li>;
                })}
              </ol>}
            </div>;
          })}
          </div>
          </div>
        </section>;
      })}
    </div>
  </section>;
}
