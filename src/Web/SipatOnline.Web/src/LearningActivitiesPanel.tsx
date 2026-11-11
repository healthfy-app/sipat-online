import { useEffect, useRef, useState, type RefObject } from 'react';
import { getLearningActivities, saveLearningActivityOutcome, type LearningActivity } from './api';
import CourseDialog from './CourseDialog';
import GamePlayer from './GamePlayer';
import type { GameOutcome } from './InteractiveGame';

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
  const resume = useRef(false);
  const opened = useRef(new Set<string>());
  const activeRef = useRef<LearningActivity | null>(null);
  const boundary = useRef<number | null>(null);
  useEffect(() => {
    let current = true;
    setError(''); setActivities([]); opened.current.clear();
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
  return <section aria-label="Jogos e questionários" className="learning-lesson-details">
    <h2>Pratique o que aprendeu</h2>
    <p className="muted-copy">Atividades opcionais, sem pontos. Você pode pular e continuar seus vídeos.</p>
    <div className="game-actions">{activities.map(activity => <button className="button button-secondary" key={activity.id}
      onClick={() => open(activity)} type="button">
      {activity.module.title}{activity.outcome === 'completed' ? ' · Concluída' : activity.outcome === 'skipped' ? ' · Pulada' : ''}
    </button>)}</div>
    {notice && <p role="status">{notice}</p>}
    {active && <CourseDialog busy={busy} onClose={() => void close('skipped')} title={active.module.title}>
      <GamePlayer key={active.id} module={active.module} onClose={outcome => void close(outcome)} />
      {saveError && <div role="alert"><p>{saveError}</p>
        <button className="button button-quiet" onClick={() => {
          boundary.current = null; activeRef.current = null; setActive(null);
          setNotice('A atividade não foi registrada. Use Reproduzir para continuar o vídeo.');
        }} type="button">Fechar sem registrar</button>
      </div>}
    </CourseDialog>}
  </section>;
}
