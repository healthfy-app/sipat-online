import type { ReactNode } from 'react';
import CourseDialog from '@/CourseDialog';

/** One game of the day, as the participant sees it in the list: done, skipped, or still to play. */
export interface DayActivity { id: string; title: string; outcome: 'completed' | 'skipped' | null }

/**
 * "Atividades para praticar": the day's games and the list that starts one. The page decides what starting does
 * (and pauses the video while the list is open); the game being played comes in as `children`.
 */
export default function DayActivities({ activities, listOpen, notice, onOpenList, onCloseList, onStart, children }: {
  activities: DayActivity[];
  listOpen: boolean;
  notice?: string;
  onOpenList: () => void;
  onCloseList: () => void;
  onStart: (activityId: string) => void;
  children?: ReactNode;
}) {
  if (!activities.length) return null;
  return <section aria-labelledby="learning-activities-title" className="learning-lesson-details learning-activities-panel">
    <div className="learning-activities-intro">
      <div className="learning-activities-heading">
        <h2 id="learning-activities-title">Atividades para praticar</h2>
        <span>{activities.length}</span>
      </div>
      <p>Jogos opcionais para praticar. Pular não bloqueia a conclusão do treinamento.</p>
    </div>
    <button aria-expanded={listOpen} aria-haspopup="dialog" className="learning-activities-open"
      onClick={onOpenList} type="button">
      Ver atividades <span aria-hidden="true">→</span>
    </button>
    {notice && <p role="status">{notice}</p>}
    {listOpen && (
      <CourseDialog className="learning-dialog learning-activities-dialog" onClose={onCloseList} title="Atividades para praticar" wide>
        <p className="learning-dialog-intro">Escolha uma atividade para revisar o conteúdo. Todas são opcionais e não bloqueiam seu progresso.</p>
        <div className="learning-activity-grid">
          {activities.map(activity => {
            const status = activity.outcome === 'completed'
              ? 'Concluída'
              : activity.outcome === 'skipped'
                ? 'Pulada'
                : 'Iniciar atividade';
            return (
              <button
                aria-label={`${activity.title} · ${status}`}
                className="learning-activity-card"
                key={activity.id}
                onClick={() => onStart(activity.id)}
                type="button"
              >
                <span className="learning-activity-title">{activity.title}</span>
                <span aria-hidden="true" className={`learning-activity-status${activity.outcome ? ` is-${activity.outcome}` : ' is-available'}`}>
                  {activity.outcome === 'completed' ? '✓' : activity.outcome === 'skipped' ? 'Pulada' : '→'}
                </span>
              </button>
            );
          })}
        </div>
      </CourseDialog>
    )}
    {children}
  </section>;
}
