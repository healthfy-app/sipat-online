import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CourseDialog from '@/CourseDialog';
import LearningActivitiesPanel from '@/LearningActivitiesPanel';
import {
  getAssignedLearningTrack,
  listAssignedLearningTracks,
  recordLearningPlaybackRange,
  saveLearningPosition,
  startLearningPlayback,
  type LearningActivity,
  type LearningExperience,
  type LearningLessonProgress,
  type LearningPlaybackSession,
  type LearningProgress,
  type LearningTrackCard,
} from '@/api';
import {
  getTrackDisplayTitle,
  getTrackProgress,
  getNextLesson,
  getOverallProgress,
  resolveAssignedTrackId,
  formatDuration,
  getLearningErrorMessage,
  type LearningSummary,
} from './learningHelpers';
import LoadingState from '@/LoadingState';
import ProgressBar from './ProgressBar';
import LessonPlayer from './LessonPlayer';
import './LearningMotion.css';

export default function LearningTrackPage({
  resumeLessonId,
  setSummary,
  trackId,
}: {
  resumeLessonId: string | null;
  setSummary?: (summary: LearningSummary | null) => void;
  trackId: string;
}) {
  const navigate = useNavigate();
  const [assignedTracks, setAssignedTracks] = useState<LearningTrackCard[]>([]);
  const [experience, setExperience] = useState<LearningExperience | null>(null);
  const [apiTrackId, setApiTrackId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [playbackSession, setPlaybackSession] = useState<LearningPlaybackSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [error, setError] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [playbackRetry, setPlaybackRetry] = useState(0);
  const [seekNotice, setSeekNotice] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activities, setActivities] = useState<LearningActivity[]>([]);
  const furthestRef = useRef(0);
  const [activeLessonTab, setActiveLessonTab] = useState<'about' | 'notes' | 'materials'>('about');
  const [isLessonDetailsOpen, setLessonDetailsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resumeAfterLessonInfoRef = useRef(false);
  const rangeStartRef = useRef<number | null>(null);
  const lastSampleRef = useRef<number | null>(null);
  const lastSavePositionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  const playbackIdentityRef = useRef('');
  const advanceAfterCompletionRef = useRef(false);
  const switchingLessonRef = useRef(false);
  const [switchingLesson, setSwitchingLesson] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  playbackIdentityRef.current = `${apiTrackId}/${selectedLessonId}/${playbackSession?.sessionId}`;

  useEffect(() => {
    setLessonDetailsOpen(false);
    setIsPlaying(false);
  }, [selectedLessonId]);

  useEffect(() => {
    if (!seekNotice) return;
    const timer = window.setTimeout(() => setSeekNotice(false), 5000);
    return () => window.clearTimeout(timer);
  }, [seekNotice]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    setExperience(null);
    setApiTrackId(null);
    setAssignedTracks([]);
    setSelectedLessonId(null);

    listAssignedLearningTracks()
      .then(async (tracks) => {
        if (active) {
          setAssignedTracks(tracks);
        }

        const resolvedTrackId = resolveAssignedTrackId(trackId, tracks);
        const data = await getAssignedLearningTrack(resolvedTrackId);
        return { resolvedTrackId, data };
      })
      .then(({ resolvedTrackId, data }) => {
        if (active) {
          setApiTrackId(resolvedTrackId);
          setExperience(data);
          setSelectedLessonId((current) =>
            data.lessons.some((lesson) => lesson.id === current)
              ? current
              : data.lessons.find((lesson) => lesson.id === resumeLessonId)?.id
                ?? getNextLesson(data.lessons)?.id
                ?? null,
          );
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getLearningErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [trackId, retry, resumeLessonId]);

  const selectedLesson = useMemo(
    () => experience?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [experience, selectedLessonId],
  );
  const experienceRef = useRef(experience);
  const selectedLessonRef = useRef(selectedLesson);
  const completedLessonIdsRef = useRef(new Set<string>());
  experienceRef.current = experience;
  selectedLessonRef.current = selectedLesson;

  const journeyTracks = useMemo(
    () => experience
      ? assignedTracks.map((track) => track.id === experience.track.id
        ? {
            ...track,
            completedLessonCount: experience.track.completedLessonCount,
            progressPercentage: experience.track.progressPercentage,
          }
        : track)
      : assignedTracks,
    [assignedTracks, experience],
  );
  const overallProgress = useMemo(
    () => getOverallProgress(journeyTracks),
    [journeyTracks],
  );

  useEffect(() => {
    if (!setSummary) {
      return;
    }
    if (!experience) {
      setSummary(null);
      return;
    }
    setSummary({
      percentage: overallProgress,
      completed: journeyTracks.filter(track => getTrackProgress(track) === 100).length,
      total: journeyTracks.length,
    });
  }, [setSummary, experience, journeyTracks, overallProgress]);

  useEffect(() => () => setSummary?.(null), [setSummary]);

  useEffect(() => {
    if (!selectedLesson || !apiTrackId) {
      setPlaybackSession(null);
      setPlaybackError('');
      return;
    }

    let active = true;
    setIsStartingPlayback(true);
    setPlaybackSession(null);
    setPlaybackError('');
    setSaveMessage('');
    rangeStartRef.current = null;
    lastSampleRef.current = null;
    lastSavePositionRef.current = selectedLesson.lastPlaybackPositionMilliseconds;
    // aula já concluída pode ser revista livremente; as demais só andam até onde a pessoa já assistiu
    furthestRef.current = selectedLesson.isCompleted ? Number.POSITIVE_INFINITY : selectedLesson.lastPlaybackPositionMilliseconds / 1000;
    setSeekNotice(false);

    startLearningPlayback(apiTrackId, selectedLesson.id)
      .then((session) => {
        if (active) {
          setPlaybackSession(session);
        }
      })
      .catch((playbackErrorValue: unknown) => {
        if (active) {
          setPlaybackError(getLearningErrorMessage(playbackErrorValue));
        }
      })
      .finally(() => {
        if (active) {
          setIsStartingPlayback(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiTrackId, selectedLesson?.id, playbackRetry]);

  const applyProgress = useCallback((progress: LearningProgress) => {
    if (progress.isCompleted) {
      completedLessonIdsRef.current.add(progress.lessonId);
    }
    setExperience((current) => {
      if (!current) {
        return current;
      }

      const lessons = current.lessons.map((lesson) =>
        lesson.id === progress.lessonId
          ? {
              ...lesson,
              lastPlaybackPositionMilliseconds: progress.lastPlaybackPositionMilliseconds,
              watchedPercentage: progress.watchedPercentage,
              isCompleted: progress.isCompleted,
              completedAt: progress.completedAt,
            }
          : lesson,
      );
      const completedLessonCount = lessons.filter((lesson) => lesson.isCompleted).length;
      const totalDuration = lessons.reduce((total, lesson) => total + lesson.durationMilliseconds, 0);
      const watchedDuration = lessons.reduce(
        (total, lesson) => total + lesson.durationMilliseconds * lesson.watchedPercentage / 100,
        0,
      );

      return {
        ...current,
        lessons,
        track: {
          ...current.track,
          completedLessonCount,
          progressPercentage: lessons.length > 0 && completedLessonCount === lessons.length
            ? 100
            : totalDuration === 0 ? 0 : Math.min(99, Math.floor(watchedDuration * 100 / totalDuration)),
        },
      };
    });
  }, []);

  const persistPlayback = useCallback(async function save(
    force: boolean, snapshot?: { position: number; rangeStart: number | null },
  ): Promise<boolean> {
    const video = videoRef.current;
    const lesson = selectedLesson;
    const session = playbackSession;
    const assignedTrackId = apiTrackId;
    if (!video || !lesson || !session || !assignedTrackId) {
      return true;
    }
    const identity = `${assignedTrackId}/${lesson.id}/${session.sessionId}`;
    const captured = snapshot ?? { position: Math.floor(video.currentTime * 1000), rangeStart: rangeStartRef.current };
    if (pendingSaveRef.current) {
      await pendingSaveRef.current;
      return playbackIdentityRef.current === identity && videoRef.current === video ? save(force, captured) : true;
    }
    if (playbackIdentityRef.current !== identity) return true;

    const positionMilliseconds = Math.min(
      lesson.durationMilliseconds,
      Math.max(0, captured.position),
    );
    const rangeStart = captured.rangeStart === null
      ? null
      : Math.min(
          lesson.durationMilliseconds,
          Math.max(0, captured.rangeStart),
        );
    const hasRange = rangeStart !== null && positionMilliseconds - rangeStart >= (force ? 1 : 1000);
    const positionChanged = Math.abs(positionMilliseconds - lastSavePositionRef.current) >= (force ? 1 : 1000);
    if (!hasRange && !positionChanged) {
      return true;
    }

    if (!force && hasRange && positionMilliseconds - rangeStart < 8000) {
      return true;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    const work = (async () => { try {
      if (hasRange) {
        const progress = await recordLearningPlaybackRange(
          assignedTrackId,
          lesson.id,
          session.sessionId,
          rangeStart,
          positionMilliseconds,
          positionMilliseconds,
        );
        applyProgress(progress);
        advanceToNextLessonIfCompleted(progress);
        if (playbackIdentityRef.current === identity && rangeStartRef.current === rangeStart)
          rangeStartRef.current = positionMilliseconds;
      } else {
        const progress = await saveLearningPosition(assignedTrackId, lesson.id, positionMilliseconds);
        applyProgress(progress);
        advanceToNextLessonIfCompleted(progress);
      }
      if (playbackIdentityRef.current === identity) {
        lastSavePositionRef.current = positionMilliseconds;
        setSaveMessage('Progresso salvo');
        setSaveFailed(false);
      }
      return true;
    } catch (saveError) {
      setSaveMessage(getLearningErrorMessage(saveError));
      setSaveFailed(true);
      return false;
    } })();
    pendingSaveRef.current = work;
    try { return await work; } finally {
      if (pendingSaveRef.current === work) pendingSaveRef.current = null;
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [apiTrackId, applyProgress, experience, playbackSession, selectedLesson]);

  useEffect(() => {
    if (!playbackSession || !selectedLesson) {
      return;
    }

    const interval = window.setInterval(() => {
      void persistPlayback(false);
    }, 10000);
    return () => {
      window.clearInterval(interval);
    };
  }, [persistPlayback, playbackSession, selectedLesson]);

  useEffect(() => {
    function leave(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || link.target || link.hasAttribute('download') || !videoRef.current) return;
      const destination = new URL(link.href, location.href);
      if (destination.origin !== location.origin || destination.pathname === location.pathname) return;
      event.preventDefault();
      if (switchingLessonRef.current) return;
      switchingLessonRef.current = true; setSwitchingLesson(true);
      videoRef.current.pause();
      void persistPlayback(true).then(saved => {
        if (saved) navigate(`${destination.pathname}${destination.search}${destination.hash}`);
      }).finally(() => { switchingLessonRef.current = false; setSwitchingLesson(false); });
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!videoRef.current || (videoRef.current.paused && !saveInFlightRef.current && !saveFailed)) return;
      event.preventDefault(); event.returnValue = '';
    }
    function visibility() { if (document.visibilityState === 'hidden') void persistPlayback(true); }
    document.addEventListener('click', leave, true);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('click', leave, true);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [navigate, persistPlayback, saveFailed]);

  function handlePlaying() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playbackSession?.expiresAt && Date.parse(playbackSession.expiresAt) <= Date.now()) {
      video.pause();
      setPlaybackError('Sua sessão de vídeo expirou. Inicie uma nova sessão para continuar.');
      setPlaybackSession(null);
      return;
    }

    if (rangeStartRef.current === null || lastSampleRef.current === null ||
      Math.abs(video.currentTime - lastSampleRef.current) > 0.5)
      rangeStartRef.current = Math.floor(video.currentTime * 1000);
    lastSampleRef.current = video.currentTime;
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video || video.paused || video.seeking) {
      return;
    }

    const currentTime = video.currentTime;
    const previousTime = lastSampleRef.current;
    if (previousTime === null) {
      rangeStartRef.current = Math.floor(currentTime * 1000);
      lastSampleRef.current = currentTime;
      return;
    }

    if (currentTime < previousTime || currentTime - previousTime > 5) {
      rangeStartRef.current = Math.floor(currentTime * 1000);
    } else if (currentTime > furthestRef.current) {
      furthestRef.current = currentTime;
    }
    lastSampleRef.current = currentTime;
  }

  function handleSeeking() {
    const video = videoRef.current;
    if (video && video.currentTime > furthestRef.current + 1) {
      // tentativa de pular o que ainda não foi assistido: volta ao ponto liberado
      video.currentTime = furthestRef.current;
      setSeekNotice(true);
      return;
    }
    if (video) {
      if (lastSampleRef.current !== null && rangeStartRef.current !== null)
        void persistPlayback(true, { position: Math.floor(lastSampleRef.current * 1000), rangeStart: rangeStartRef.current });
      rangeStartRef.current = Math.floor(video.currentTime * 1000);
      lastSampleRef.current = video.currentTime;
    }
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video || !selectedLesson) {
      return;
    }

    const resumeAt = selectedLesson.lastPlaybackPositionMilliseconds / 1000;
    if (resumeAt > 0 && resumeAt < video.duration) {
      video.currentTime = resumeAt;
    }
    video.playbackRate = 1;
  }

  async function selectLesson(lesson: LearningLessonProgress) {
    if (lesson.id === selectedLessonId || switchingLessonRef.current) {
      return;
    }
    switchingLessonRef.current = true; setSwitchingLesson(true);
    videoRef.current?.pause();
    try {
      if (await persistPlayback(true)) setSelectedLessonId(lesson.id);
    } finally { switchingLessonRef.current = false; setSwitchingLesson(false); }
  }

  function openLessonDetails() {
    const video = videoRef.current;
    resumeAfterLessonInfoRef.current = Boolean(video && !video.paused && !video.ended);
    if (resumeAfterLessonInfoRef.current) video?.pause();
    setLessonDetailsOpen(true);
  }

  function closeLessonDetails() {
    setLessonDetailsOpen(false);
    const video = videoRef.current;
    const shouldResume = resumeAfterLessonInfoRef.current;
    resumeAfterLessonInfoRef.current = false;
    if (shouldResume && video) {
      void video.play().catch(() => setSaveMessage('Use Reproduzir para continuar o vídeo.'));
    }
  }

  function advanceToNextLessonIfCompleted(progress: LearningProgress) {
    if (!progress.isCompleted || !advanceAfterCompletionRef.current || !selectedLesson) {
      return;
    }
    advanceAfterCompletionRef.current = false;
    moveToNextIncompleteLesson(selectedLesson.id);
  }

  function moveToNextIncompleteLesson(lessonId: string) {
    const currentLesson = experienceRef.current?.lessons.find(lesson => lesson.id === lessonId)
      ?? selectedLessonRef.current;
    const next = currentLesson && experienceRef.current?.lessons.find(
      lesson => lesson.position > currentLesson.position && !lesson.isCompleted,
    );
    if (next) {
      setSelectedLessonId(next.id);
    }
  }

  async function handleVideoEnded() {
    const endedLessonId = selectedLesson?.id;
    if (!endedLessonId) {
      return;
    }
    advanceAfterCompletionRef.current = true;
    const saved = await persistPlayback(true);
    if (!saved) {
      advanceAfterCompletionRef.current = false;
      return;
    }
    if (advanceAfterCompletionRef.current && (
      completedLessonIdsRef.current.has(endedLessonId) ||
      (selectedLessonRef.current?.id === endedLessonId && selectedLessonRef.current.isCompleted)
    )) {
      moveToNextIncompleteLesson(endedLessonId);
    }
    advanceAfterCompletionRef.current = false;
  }

  if (isLoading) {
    return <LoadingState className="learning-state">Carregando a trilha...</LoadingState>;
  }

  if (error || !experience) {
    return (
      <main className="learning-page">
        <Link className="learning-back-to-courses" to="/learning">← Meus cursos</Link>
        <div className="learning-state learning-error" role="alert">
          <p>{error || 'Não foi possível carregar esta trilha.'}</p>
          <div className="learning-state-actions">
            <button className="button button-secondary" onClick={() => setRetry((value) => value + 1)} type="button">
              Tentar novamente
            </button>
            <Link className="button button-quiet" to="/learning">Voltar à formação</Link>
          </div>
        </div>
      </main>
    );
  }

  const currentIndex = experience.lessons.findIndex((lesson) => lesson.id === selectedLesson?.id);
  const previousLesson = currentIndex > 0 ? experience.lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 ? experience.lessons[currentIndex + 1] ?? null : null;
  const completedLessons = experience.lessons.filter(lesson => lesson.isCompleted).length;
  const hasSections = new Set(experience.lessons.map((lesson) => lesson.sectionTitle).filter(Boolean)).size > 1;
  const isTrackComplete = completedLessons === experience.lessons.length && experience.lessons.length > 0;
  const lessonTabs = [
    { id: 'about', label: 'Sobre a aula' },
    { id: 'notes', label: 'Minhas anotações' },
    { id: 'materials', label: 'Materiais' },
  ] as const;
  const handleLessonTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % lessonTabs.length
      : event.key === 'ArrowLeft'
        ? (index + lessonTabs.length - 1) % lessonTabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lessonTabs.length - 1
            : -1;
    if (nextIndex < 0) {
      return;
    }
    event.preventDefault();
    setActiveLessonTab(lessonTabs[nextIndex].id);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  };

  const trackTitle = getTrackDisplayTitle(experience.track.title);
  const markers = activities
    .filter(item => item.lessonId === selectedLesson?.id && item.timeMilliseconds !== null)
    .map(item => ({ id: item.id, seconds: item.timeMilliseconds! / 1000, title: item.module.title, done: item.outcome !== null }));

  return (
    <main className="learning-page learning-track-page">
      <header className="learning-course-header">
        <Link className="learning-back-to-courses" to="/learning">← Minha formação</Link>
        <div className="learning-course-header-progress">
          <div className="learning-course-header-copy">
            <h1>{trackTitle}</h1>
            <span>{completedLessons} de {experience.lessons.length} aulas · {getTrackProgress(experience.track)}%</span>
          </div>
          <ProgressBar value={getTrackProgress(experience.track)} label="Progresso do curso" />
        </div>
      </header>

      {selectedLesson && (
        <header className="learning-active-lesson-heading" key={selectedLesson.id}>
          <p className="eyebrow">AULA {selectedLesson.position} DE {experience.lessons.length}</p>
          <h2>{selectedLesson.title}</h2>
        </header>
      )}

      <div className="learning-experience-layout">
        <section className="learning-main-column">
          <div className="learning-player-frame">
            {playbackSession ? (
              <>
                <LessonPlayer furthestRef={furthestRef} key={`${selectedLesson?.id}-${playbackSession.sessionId}`} markers={markers}
                  onLockedSeek={() => setSeekNotice(true)} videoRef={videoRef}>
                <video
                  aria-label={selectedLesson?.title ?? 'Vídeo da trilha'}
                  className="learning-video"
                  disablePictureInPicture
                  slot="media"
                  onError={() => {
                    setPlaybackSession(null);
                    setPlaybackError('Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.');
                  }}
                  onEnded={() => { setIsPlaying(false); void handleVideoEnded(); }}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPause={() => { setIsPlaying(false); void persistPlayback(true); }}
                  onPlaying={() => { setIsPlaying(true); handlePlaying(); }}
                  onRateChange={(event) => { if (event.currentTarget.playbackRate !== 1) event.currentTarget.playbackRate = 1; }}
                  onSeeking={handleSeeking}
                  onSeeked={() => void persistPlayback(true)}
                  onTimeUpdate={handleTimeUpdate}
                  playsInline
                  preload="metadata"
                  ref={videoRef}
                  src={playbackSession.url}
                >
                  Seu navegador não oferece suporte à reprodução deste vídeo.
                </video>
                </LessonPlayer>
                {playbackSession.isDevelopmentDemo && (
                  <p className="learning-demo-notice" role="note">
                    Vídeo de demonstração. O progresso registrado aqui não comprova participação oficial.
                  </p>
                )}
              </>
            ) : (
              <div className="learning-player-state" aria-live="polite" role={playbackError ? 'alert' : 'status'}>
                <span aria-hidden="true" className="learning-player-icon">
                  {playbackError ? '!' : '▶'}
                </span>
                <h2>{playbackError ? 'Vídeo indisponível' : 'Preparando seu vídeo'}</h2>
                <p>
                  {playbackError || (isStartingPlayback
                    ? 'Estamos preparando uma sessão segura de reprodução.'
                    : 'Selecione um vídeo para começar.')}
                </p>
                {playbackError && (
                  <button
                    className="button button-secondary"
                    onClick={() => setPlaybackRetry((value) => value + 1)}
                    type="button"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>

          {selectedLesson && (
            <div className="learning-lesson-navigation">
              <button
                className="button button-quiet"
                disabled={!previousLesson || switchingLesson}
                onClick={() => previousLesson && selectLesson(previousLesson)}
                type="button"
              >
                ← Aula anterior
              </button>
              <span className={`learning-status${selectedLesson.isCompleted ? ' is-complete' : ''}`}>
                <span aria-hidden="true">{selectedLesson.isCompleted ? '✓' : '○'}</span>
                {selectedLesson.isCompleted
                  ? 'Concluída'
                  : selectedLesson.watchedPercentage > 0
                    ? 'Em andamento'
                    : 'Conclusão verificada ao assistir'}
              </span>
              <button
                className="button button-primary"
                disabled={!nextLesson || switchingLesson}
                onClick={() => nextLesson && selectLesson(nextLesson)}
                type="button"
              >
                Próxima aula <span aria-hidden="true">→</span>
              </button>
            </div>
          )}

          <div className="learning-player-tools">
            {seekNotice && (
              <span className="learning-seek-notice" role="status">
                Assista ao vídeo em sequência: não é possível avançar além do que você já viu.
              </span>
            )}
            <span className={`learning-save-status${saveMessage && !isSaving ? ' is-visible' : ''}`} role="status">
              {isSaving ? 'Salvando progresso...' : saveMessage}
            </span>
            {saveFailed && <button className="button button-secondary" disabled={isSaving}
              onClick={() => void persistPlayback(true)} type="button">Tentar salvar progresso</button>}
          </div>
        </section>

        <aside aria-label="Conteúdo e avaliação do curso" className="learning-course-sidebar">
          <section aria-labelledby="learning-curriculum-title" className="learning-curriculum-card">
            <div className="learning-curriculum-heading">
              <h2 id="learning-curriculum-title">Conteúdo do curso</h2>
              <span className="learning-curriculum-count">{completedLessons}/{experience.lessons.length}</span>
            </div>
            <ol className="learning-lesson-list">
              {experience.lessons.map((lesson, lessonIndex) => {
                const isCurrent = lesson.id === selectedLesson?.id;
                const showSection = hasSections && lesson.sectionTitle
                  && lesson.sectionTitle !== experience.lessons[lessonIndex - 1]?.sectionTitle;
                return (
                  <li key={lesson.id}>
                    {showSection && <p className="learning-section-heading">{lesson.sectionTitle}</p>}
                    <button
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`learning-lesson-item${isCurrent ? ' is-current' : ''}${lesson.isCompleted ? ' is-complete' : ''}`}
                      disabled={switchingLesson}
                      onClick={() => selectLesson(lesson)}
                      type="button"
                    >
                      <span aria-hidden="true" className="learning-lesson-indicator">
                        {lesson.isCompleted ? '✓' : lesson.position.toString().padStart(2, '0')}
                      </span>
                      <span className="learning-lesson-item-copy">
                        <span className="learning-lesson-item-title">{lesson.title}</span>
                        <span className="learning-lesson-item-meta">
                          {formatDuration(lesson.durationMilliseconds)}
                          <span aria-hidden="true">·</span>
                          {lesson.isCompleted ? 'Concluído' : lesson.watchedPercentage > 0 ? `${lesson.watchedPercentage}% assistido` : 'Não iniciado'}
                        </span>
                        <span aria-hidden="true" className="learning-lesson-progress">
                          <span style={{ width: `${Math.min(100, Math.max(0, lesson.watchedPercentage))}%` }} />
                        </span>
                      </span>
                      {isCurrent && (isPlaying
                        ? <span aria-hidden="true" className="learning-playing-bars"><i /><i /><i /></span>
                        : <span aria-hidden="true" className="learning-current-mark">●</span>)}
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          <LearningActivitiesPanel
            trackId={apiTrackId ?? experience.track.id}
            lessonId={selectedLesson?.id ?? null}
            lessonPosition={selectedLesson?.position ?? 1}
            onActivities={setActivities}
            playbackKey={playbackSession?.sessionId}
            videoRef={videoRef}
          />
          {selectedLesson && (
            <section aria-label="Informações da aula" className="learning-lesson-details learning-lesson-info-launcher">
              <div className="learning-lesson-info-intro">
                <h2>Sobre a aula</h2>
                <p>Descrição, anotações e materiais</p>
              </div>
              <button
                aria-expanded={isLessonDetailsOpen}
                aria-haspopup="dialog"
                aria-label="Ver detalhes da aula"
                className="learning-activities-open"
                onClick={openLessonDetails}
                type="button"
              >
                Ver conteúdo <span aria-hidden="true">→</span>
              </button>
            </section>
          )}
          {selectedLesson && isLessonDetailsOpen && (
            <CourseDialog className="learning-dialog learning-details-dialog" onClose={closeLessonDetails} title="Informações da aula" wide>
              <div aria-label="Informações e recursos da aula" className="learning-lesson-tabs" role="tablist">
                {lessonTabs.map((tab, index) => (
                  <button
                    aria-controls="learning-lesson-tab-panel"
                    aria-selected={activeLessonTab === tab.id}
                    id={`learning-lesson-tab-${tab.id}`}
                    key={tab.id}
                    onClick={() => setActiveLessonTab(tab.id)}
                    onKeyDown={event => handleLessonTabKeyDown(event, index)}
                    role="tab"
                    tabIndex={activeLessonTab === tab.id ? 0 : -1}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div
                aria-labelledby={`learning-lesson-tab-${activeLessonTab}`}
                className="learning-lesson-tab-panel"
                id="learning-lesson-tab-panel"
                role="tabpanel"
                tabIndex={0}
              >
                {activeLessonTab === 'about' && (
                  <>
                    <div className="learning-lesson-heading">
                      <h3>Sobre a aula</h3>
                    </div>
                    {selectedLesson.description && <p className="learning-lesson-description">{selectedLesson.description}</p>}
                    <div className="learning-lesson-footer">
                      <span>{formatDuration(selectedLesson.durationMilliseconds)}</span>
                      <span>{selectedLesson.watchedPercentage}% assistido</span>
                      {selectedLesson.lastPlaybackPositionMilliseconds > 0 && (
                        <span>Retomada em {formatDuration(selectedLesson.lastPlaybackPositionMilliseconds)}</span>
                      )}
                    </div>
                  </>
                )}
                {activeLessonTab === 'notes' && (
                  <p className="learning-resource-unavailable">Anotações ainda não estão disponíveis para esta aula.</p>
                )}
                {activeLessonTab === 'materials' && (
                  <p className="learning-resource-unavailable">Materiais ainda não estão disponíveis para esta aula.</p>
                )}
              </div>
            </CourseDialog>
          )}
          <section aria-labelledby="learning-final-quiz-title" className="learning-quiz-card">
            <h2 id="learning-final-quiz-title">Quiz final</h2>
            <p>{isTrackComplete
              ? 'O quiz ainda não está disponível para este curso.'
              : 'Conclua todas as aulas para liberar o quiz final.'}</p>
            <button className="button button-secondary" disabled type="button">
              {isTrackComplete ? 'Quiz indisponível' : 'Libera ao concluir as aulas'}
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}
