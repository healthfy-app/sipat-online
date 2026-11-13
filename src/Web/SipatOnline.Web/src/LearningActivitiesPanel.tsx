import { useEffect, useRef, useState, type RefObject } from 'react';
import { getLearningActivities, saveLearningActivityOutcome, type LearningActivity } from './api';
import CourseDialog from './CourseDialog';
import GamePlayer from '@/games/LazyGamePlayer';
import { Button } from '@/components/ui/button';
import type { GameOutcome } from '@/games/gameKit';
import GameStage from '@/games/GameStage';

export default function LearningActivitiesPanel({ trackId, lessonId, lessonPosition, playbackKey, videoRef }: {
  trackId: string; lessonId: string | null; playbackKey: string | undefined;
  lessonPosition: number;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const [active, setActive] = useState<LearningActivity | null>(null);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const resume = useRef(false);
  const opened = useRef(new Set<string>());
  const activeRef = useRef<LearningActivity | null>(null);
  const boundary = useRef<number | null>(null);
  useEffect(() => {
    let current = true;
    setError(''); setActivities([]); setActivitiesOpen(false); opened.current.clear();
    getLearningActivities(trackId).then(result => { if (current) setActivities(result.items); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as atividades.'); });
    return () => { current = false; };
  }, [trackId, retry]);

  function open(activity: LearningActivity, shouldResume?: boolean) {
    if (activeRef.current) return;
    resume.current = shouldResume ?? (!!videoRef.current && !videoRef.current.paused && !videoRef.current.ended);
    activeRef.current = activity;
    videoRef.current?.pause();
    opened.current.add(activity.id); setSaveError(''); setActive(activity);
  }

  function openActivityList() {
    resume.current = !!videoRef.current && !videoRef.current.paused && !videoRef.current.ended;
    videoRef.current?.pause();
    setActivitiesOpen(true);
  }

  function closeActivityList() {
    setActivitiesOpen(false);
    const shouldResume = resume.current;
    resume.current = false;
    if (shouldResume && videoRef.current) {
      void videoRef.current.play().catch(() => {
        setNotice('Use Reproduzir para continuar o vídeo.');
      });
    }
  }

  function startFromList(activity: LearningActivity) {
    const shouldResume = resume.current;
    setActivitiesOpen(false);
    open(activity, shouldResume);
  }
  useEffect(() => {
    const video = videoRef.current;
    if (!video || active) return;
    const atBoundary = (count: number, shouldResume: boolean) => {
      if (activeRef.current) return;
      const due = activities.find(item => !item.outcome && !opened.current.has(item.id) &&
        item.timeMilliseconds === null && item.afterVideoCount === count);
      if (due) { boundary.current = count; open(due, shouldResume); }
    };
    const onPlaying = () => atBoundary(lessonPosition - 1, true);
    const onEnded = () => atBoundary(lessonPosition, false);
    const onTime = () => {
      if (activeRef.current || video.paused || video.seeking) return;
      const due = activities.find(item => !item.outcome && !opened.current.has(item.id) &&
        item.lessonId === lessonId && item.timeMilliseconds !== null &&
        video.currentTime * 1000 >= item.timeMilliseconds);
      if (due) open(due);
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEnded);
    if (!video.paused) { onPlaying(); onTime(); }
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEnded);
    };
  }, [activities, lessonId, lessonPosition, active, playbackKey, videoRef]);

  async function close(outcome: GameOutcome = 'skipped') {
    if (!active || busy) return;
    setBusy(true); setSaveError('');
    try {
      await saveLearningActivityOutcome(trackId, active.id, outcome);
      setActivities(items => items.map(item => item.id === active.id
        ? { ...item, outcome: item.outcome === 'completed' ? 'completed' : outcome } : item));
      const next = boundary.current === null ? undefined : activities.find(item => !item.outcome &&
        !opened.current.has(item.id) && item.timeMilliseconds === null && item.afterVideoCount === boundary.current);
      if (next) {
        opened.current.add(next.id); activeRef.current = next; setActive(next);
        return;
      }
      boundary.current = null; activeRef.current = null; setActive(null);
      if (resume.current && videoRef.current) {
        try { await videoRef.current.play(); }
        catch { setNotice('Atividade registrada. Use Reproduzir para continuar o vídeo.'); }
      }
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'Não foi possível registrar a atividade. Tente novamente.');
    } finally { setBusy(false); }
  }

  if (error) return <section className="learning-lesson-details" role="alert">
    <p>{error}</p><button className="button button-secondary" onClick={() => setRetry(value => value + 1)} type="button">Recarregar atividades</button>
  </section>;
  if (!activities.length) return null;
  return <section aria-labelledby="learning-activities-title" className="learning-lesson-details learning-activities-panel">
    <div className="learning-activities-intro">
      <div className="learning-activities-heading">
        <h2 id="learning-activities-title">Atividades para praticar</h2>
        <span>{activities.length}</span>
      </div>
      <p>Quizzes opcionais, sem pontos. Pular não bloqueia a conclusão do curso.</p>
    </div>
    <button aria-expanded={activitiesOpen} aria-haspopup="dialog" className="learning-activities-open"
      onClick={openActivityList} type="button">
      Ver atividades <span aria-hidden="true">→</span>
    </button>
    {notice && <p role="status">{notice}</p>}
    {activitiesOpen && (
      <CourseDialog className="learning-dialog learning-activities-dialog" onClose={closeActivityList} title="Atividades para praticar" wide>
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
                aria-label={`${activity.module.title} · ${status}`}
                className="learning-activity-card"
                key={activity.id}
                onClick={() => startFromList(activity)}
                type="button"
              >
                <span className="learning-activity-title">{activity.module.title}</span>
                <span aria-hidden="true" className={`learning-activity-status${activity.outcome ? ` is-${activity.outcome}` : ' is-available'}`}>
                  {activity.outcome === 'completed' ? '✓' : activity.outcome === 'skipped' ? 'Pulada' : '→'}
                </span>
              </button>
            );
          })}
        </div>
      </CourseDialog>
    )}
    {active && <GameStage busy={busy} label={active.module.title} onClose={() => void close('skipped')}>
      <GamePlayer key={active.id} module={active.module} onClose={outcome => void close(outcome)} />
      {saveError && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-destructive-soft px-4 py-3 font-sans text-sm text-destructive" role="alert">
        <p className="m-0">{saveError}</p>
        <Button onClick={() => {
          boundary.current = null; activeRef.current = null; setActive(null);
          setNotice('A atividade não foi registrada. Use Reproduzir para continuar o vídeo.');
        }} size="sm" variant="outline">Fechar sem registrar</Button>
      </div>}
    </GameStage>}
  </section>;
}
