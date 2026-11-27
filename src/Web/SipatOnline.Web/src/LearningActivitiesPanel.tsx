import { useEffect, useRef, useState, type RefObject } from 'react';
import { getLearningActivities, saveLearningActivityOutcome, type LearningActivity } from './api';
import DayActivities from '@/learning/day/DayActivities';
import GamePlayer from '@/games/LazyGamePlayer';
import { Button } from '@/components/ui/button';
import type { GameOutcome } from '@/games/gameKit';
import GameStage from '@/games/GameStage';
import { createCheckpointWatcher, watchCheckpoints, type Checkpoint } from '@sipat/video-player';

export default function LearningActivitiesPanel({ trackId, lessonId, lessonPosition, boundaryBefore, playbackKey, videoRef, onActivities }: {
  trackId: string; lessonId: string | null; playbackKey: string | undefined;
  lessonPosition: number;
  /** Position of the house video before this one (0 if none): extras in between are skipped. Defaults to `lessonPosition - 1`. */
  boundaryBefore?: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Lets the page draw the activities on the video timeline. */
  onActivities?: (activities: LearningActivity[]) => void;
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

  useEffect(() => { onActivities?.(activities); }, [activities, onActivities]);

  function open(activity: LearningActivity, shouldResume?: boolean) {
    if (activeRef.current) return;
    // the game opens over the page, which a fullscreen player would hide
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
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
    const onPlaying = () => atBoundary(boundaryBefore ?? lessonPosition - 1, true);
    const onEnded = () => atBoundary(lessonPosition, false);
    // activities at a moment of this video; none is due while another one is open
    const checkpoints = (): Checkpoint[] => activeRef.current ? [] : activities
      .filter(item => item.lessonId === lessonId && item.timeMilliseconds !== null)
      .map(item => ({ id: item.id, seconds: item.timeMilliseconds! / 1000, title: item.module.title,
        done: !!item.outcome || opened.current.has(item.id) }));
    const onDue = (checkpoint: Checkpoint) => {
      const due = activities.find(item => item.id === checkpoint.id);
      if (due) open(due);
    };
    const watcher = createCheckpointWatcher({ reopenOnRewind: false });
    const stopWatching = watchCheckpoints(video, { checkpoints, reopenOnRewind: false, onDue }, watcher);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('ended', onEnded);
    if (!video.paused) {
      onPlaying();
      const due = watcher.due(checkpoints(), video.currentTime, true, video.seeking);
      if (due) { watcher.fire(due.id); onDue(due); }
    }
    return () => {
      stopWatching();
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('ended', onEnded);
    };
  }, [activities, lessonId, lessonPosition, boundaryBefore, active, playbackKey, videoRef]);

  async function close(outcome: GameOutcome = 'skipped') {
    if (!active || busy) return;
    setBusy(true); setSaveError('');
    try {
      // only a checkpoint (a moment of one video) names its lesson, so the server can refuse a list that went stale
      if (active.lessonId && active.timeMilliseconds !== null) await saveLearningActivityOutcome(trackId, active.id, outcome, active.lessonId);
      else await saveLearningActivityOutcome(trackId, active.id, outcome);
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
      if ((failure as { code?: string } | null)?.code === 'learning.activity.stale') {
        // the list changed under this page: drop the game, show what the server said and read the list again
        boundary.current = null; activeRef.current = null; setActive(null);
        setNotice(failure instanceof Error ? failure.message : 'A lista de atividades mudou. Atualize a página.');
        setRetry(value => value + 1);
        return;
      }
      setSaveError(failure instanceof Error ? failure.message : 'Não foi possível registrar a atividade. Tente novamente.');
    } finally { setBusy(false); }
  }

  if (error) return <section className="learning-lesson-details" role="alert">
    <p>{error}</p><button className="button button-secondary" onClick={() => setRetry(value => value + 1)} type="button">Recarregar atividades</button>
  </section>;
  return <DayActivities
    activities={activities.map(item => ({ id: item.id, title: item.module.title, outcome: item.outcome }))}
    listOpen={activitiesOpen}
    notice={notice}
    onCloseList={closeActivityList}
    onOpenList={openActivityList}
    onStart={id => { const activity = activities.find(item => item.id === id); if (activity) startFromList(activity); }}
  >
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
  </DayActivities>;
}
