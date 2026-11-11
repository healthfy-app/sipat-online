import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import './LearningCatalog.css';
import { getCourseCover } from './courseCover';
import LearningActivitiesPanel from './LearningActivitiesPanel';
import {
  ApiError,
  getAssignedLearningTrack,
  listAssignedLearningTracks,
  recordLearningPlaybackRange,
  saveLearningPosition,
  startLearningPlayback,
  type LearningExperience,
  type LearningLessonProgress,
  type LearningPlaybackSession,
  type LearningProgress,
  type LearningTrackCard,
} from './api';

export interface LearningSummary {
  percentage: number;
  completed: number;
  total: number;
}

export default function LearningPage({
  participantName,
  tenantName,
}: {
  participantName?: string;
  tenantName?: string;
}) {
  const { trackId } = useParams();
  const setSummary = useOutletContext<((summary: LearningSummary | null) => void) | undefined>();
  return trackId ? (
    <LearningTrackPage
      participantName={participantName}
      setSummary={setSummary}
      tenantName={tenantName}
      trackId={trackId}
    />
  ) : (
    <LearningHomePage participantName={participantName} setSummary={setSummary} />
  );
}

function LearningHomePage({ participantName, setSummary }: {
  participantName?: string;
  setSummary?: (summary: LearningSummary | null) => void;
}) {
  const [tracks, setTracks] = useState<LearningTrackCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'started' | 'completed'>('all');

  const nextTrack = getNextTrack(tracks);
  const overallProgress = getOverallProgress(tracks);
  const completedCourses = tracks.filter(track => getTrackProgress(track) === 100).length;
  const visibleTracks = tracks.filter(track => (
    (filter === 'all' || (filter === 'started' ? getTrackProgress(track) > 0 && getTrackProgress(track) < 100 : getTrackProgress(track) === 100)) &&
    `${track.title} ${track.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
  ));

  useEffect(() => {
    setSummary?.(!isLoading && !error ? {
      percentage: overallProgress,
      completed: tracks.reduce((total, track) => total + track.completedLessonCount, 0),
      total: tracks.reduce((total, track) => total + track.lessonCount, 0),
    } : null);
  }, [setSummary, tracks, isLoading, error, overallProgress]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');

    listAssignedLearningTracks()
      .then((items) => {
        if (active) {
          setTracks(items);
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
  }, [retry]);

  return (
    <main className="learning-page learning-catalog">
      <header className="learning-page-heading">
        {participantName && <p className="learning-catalog-greeting">Olá, {participantName.split(' ')[0]}.</p>}
        <h1>Seus cursos. Seu próximo passo.</h1>
        <p className="muted-copy">
          Explore os cursos da sua SIPAT e acompanhe cada conquista, no seu ritmo.
        </p>
      </header>

      {isLoading && <LoadingState className="learning-state">Carregando suas trilhas...</LoadingState>}
      {error && (
        <div className="learning-state learning-error" role="alert">
          <p>{error}</p>
          <button className="button button-secondary" onClick={() => setRetry((value) => value + 1)} type="button">
            Tentar novamente
          </button>
        </div>
      )}
      {!isLoading && !error && tracks.length === 0 && (
        <section className="learning-empty">
          <span aria-hidden="true" className="learning-empty-mark">✓</span>
          <h2>Você ainda não tem uma trilha atribuída</h2>
          <p>
            Quando a administração da sua empresa disponibilizar uma trilha, ela aparecerá aqui.
          </p>
        </section>
      )}
      {!isLoading && !error && tracks.length > 0 && <>
        <section className="learning-catalog-overview" aria-label="Sua formação">
          <div className="learning-catalog-progress">
            <h2>Sua formação está em movimento</h2>
            <p>{completedCourses} de {tracks.length} cursos concluídos <span aria-hidden="true">·</span> {overallProgress}% da formação</p>
            <ProgressBar value={overallProgress} label="Progresso geral da formação" />
          </div>
          {nextTrack && <Link className="button button-primary" to={getTrackPath(nextTrack, tracks)}>
            {getTrackProgress(nextTrack) === 100 ? 'Rever um curso' : getTrackProgress(nextTrack) > 0 ? 'Continuar aprendendo' : 'Começar a aprender'} <span aria-hidden="true">→</span>
          </Link>}
        </section>
        <section aria-labelledby="learning-catalog-title">
          <div className="learning-catalog-toolbar">
            <h2 id="learning-catalog-title">Meus cursos <span>{tracks.length}</span></h2>
            <label className="learning-catalog-search">Buscar curso
              <input onChange={event => setSearch(event.target.value)} placeholder="O que você quer aprender?" type="search" value={search} />
            </label>
          </div>
          <div className="learning-catalog-filters" aria-label="Filtrar cursos">
            {([
              ['all', 'Todos'], ['started', 'Em andamento'], ['completed', 'Concluídos'],
            ] as const).map(([value, label]) => <button aria-pressed={filter === value} key={value}
              onClick={() => setFilter(value)} type="button">{label}</button>)}
          </div>
          {visibleTracks.length === 0 ? <p className="learning-state" role="status">Nenhum curso corresponde à sua busca ou filtro.</p> :
            <div className="learning-catalog-grid">
              {visibleTracks.map(track => {
                const percentage = getTrackProgress(track);
                const completed = percentage === 100;
                const started = percentage > 0;
                return <article className="learning-catalog-course" key={track.id}>
                  <div className="learning-catalog-artwork" data-artwork={getTrackArtwork(track.title)} aria-hidden="true">
                    <img alt="" decoding="async" loading="lazy" src={track.coverUrl ?? getCourseCover(track.title)} />
                    <span>{completed ? '✓ Concluído' : started ? 'Em andamento' : 'Pronto para começar'}</span>
                  </div>
                  <div className="learning-catalog-course-content">
                    <p className="learning-catalog-course-count">{track.lessonCount} {track.lessonCount === 1 ? 'vídeo' : 'vídeos'}</p>
                    <h3><Link to={getTrackPath(track, tracks)}>{track.title}</Link></h3>
                    <p className="learning-catalog-description">{track.description || 'Um novo aprendizado para levar ao seu dia a dia.'}</p>
                    <div className="learning-catalog-course-progress">
                      <span>{track.completedLessonCount} de {track.lessonCount} concluídos</span>
                      <strong>{percentage}%</strong>
                    </div>
                    <ProgressBar value={percentage} label={`Progresso de ${track.title}`} />
                    <Link aria-label={`${completed ? 'Rever' : started ? 'Continuar' : 'Começar'} curso ${track.title}`}
                      className="learning-catalog-course-link" to={getTrackPath(track, tracks)}>
                      {completed ? 'Rever curso' : started ? 'Continuar curso' : 'Começar curso'} <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </article>;
              })}
            </div>}
        </section>
      </>}
    </main>
  );
}

function LearningTrackPage({
  participantName,
  setSummary,
  tenantName,
  trackId,
}: {
  participantName?: string;
  setSummary?: (summary: LearningSummary | null) => void;
  tenantName?: string;
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
  const [playbackRate, setPlaybackRate] = useState('1');
  const [isSaving, setIsSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rangeStartRef = useRef<number | null>(null);
  const lastSampleRef = useRef<number | null>(null);
  const lastSavePositionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  const playbackIdentityRef = useRef('');
  const switchingLessonRef = useRef(false);
  const [switchingLesson, setSwitchingLesson] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  playbackIdentityRef.current = `${apiTrackId}/${selectedLessonId}/${playbackSession?.sessionId}`;

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
              : getNextLesson(data.lessons)?.id ?? null,
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
  }, [trackId, retry]);

  const selectedLesson = useMemo(
    () => experience?.lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [experience, selectedLessonId],
  );

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
      completed: journeyTracks.reduce((total, track) => total + track.completedLessonCount, 0),
      total: journeyTracks.reduce((total, track) => total + track.lessonCount, 0),
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
        if (playbackIdentityRef.current === identity && rangeStartRef.current === rangeStart)
          rangeStartRef.current = positionMilliseconds;
      } else {
        const progress = await saveLearningPosition(assignedTrackId, lesson.id, positionMilliseconds);
        applyProgress(progress);
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
  }, [apiTrackId, applyProgress, playbackSession, selectedLesson]);

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
    }
    lastSampleRef.current = currentTime;
  }

  function handleSeeking() {
    const video = videoRef.current;
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
    video.playbackRate = Number(playbackRate);
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

  return (
    <main className="learning-page">
      <Link className="learning-back-to-courses" to="/learning">← Meus cursos</Link>
      <header className="learning-student-heading">
        <div>
          <p className="learning-breadcrumb">
            {[tenantName, participantName, experience.track.title].filter(Boolean).join(' · ')}
          </p>
          <h1>{selectedLesson?.title ?? 'Minha formação'}</h1>
          <p className="muted-copy">{experience.track.title}
            {selectedLesson && ` · Vídeo ${selectedLesson.position} de ${experience.lessons.length}`}
          </p>
        </div>
        <div className="learning-student-progress">
          <strong>{getTrackProgress(experience.track)}% concluído</strong>
          <ProgressBar value={getTrackProgress(experience.track)} label="Progresso do curso" />
        </div>
      </header>

      <div className="learning-experience-layout">
        <section className="learning-main-column">
          <div className="learning-player-frame">
            <span className="learning-video-track-label">{experience.track.title}</span>
            {playbackSession ? (
              <>
                <video
                  aria-label={selectedLesson?.title ?? 'Vídeo da trilha'}
                  className="learning-video"
                  controls
                  key={`${selectedLesson?.id}-${playbackSession.sessionId}`}
                  onError={() => {
                    setPlaybackSession(null);
                    setPlaybackError('Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.');
                  }}
                  onEnded={() => void persistPlayback(true)}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPause={() => void persistPlayback(true)}
                  onPlaying={handlePlaying}
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

          <div className="learning-player-tools">
            <label className="learning-speed-control">
              <span>Velocidade</span>
              <select
                aria-label="Velocidade de reprodução"
                disabled={!playbackSession}
                onChange={(event) => {
                  setPlaybackRate(event.target.value);
                  if (videoRef.current) {
                    videoRef.current.playbackRate = Number(event.target.value);
                  }
                }}
                value={playbackRate}
              >
                {['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'].map((rate) => (
                  <option key={rate} value={rate}>{rate.replace('.', ',')}x</option>
                ))}
              </select>
            </label>
            <span className={`learning-save-status${saveMessage && !isSaving ? ' is-visible' : ''}`} role="status">
              {isSaving ? 'Salvando progresso...' : saveMessage}
            </span>
            {saveFailed && <button className="button button-secondary" disabled={isSaving}
              onClick={() => void persistPlayback(true)} type="button">Tentar salvar progresso</button>}
          </div>

          <LearningActivitiesPanel trackId={apiTrackId ?? experience.track.id} lessonId={selectedLesson?.id ?? null}
            lessonPosition={selectedLesson?.position ?? 1} playbackKey={playbackSession?.sessionId} videoRef={videoRef} />

          {selectedLesson && (
            <section aria-labelledby="learning-lesson-title" className="learning-lesson-details">
              <div className="learning-lesson-heading">
                <div>
                  <p className="eyebrow">VÍDEO {selectedLesson.position}</p>
                  <h2 id="learning-lesson-title">Sobre esta aula</h2>
                </div>
                <span className={`learning-status${selectedLesson.isCompleted ? ' is-complete' : ''}`}>
                  <span aria-hidden="true">{selectedLesson.isCompleted ? '✓' : '○'}</span>
                  {selectedLesson.isCompleted ? 'Concluído' : selectedLesson.watchedPercentage > 0 ? 'Em andamento' : 'Não iniciado'}
                </span>
              </div>
              {selectedLesson.description && <p className="learning-lesson-description">{selectedLesson.description}</p>}
              <div className="learning-lesson-footer">
                <span>{formatDuration(selectedLesson.durationMilliseconds)}</span>
                <span>{selectedLesson.watchedPercentage}% assistido</span>
                {selectedLesson.lastPlaybackPositionMilliseconds > 0 && (
                  <span>Retomada em {formatDuration(selectedLesson.lastPlaybackPositionMilliseconds)}</span>
                )}
              </div>
              <div className="learning-lesson-navigation">
                <button
                  className="button button-quiet"
                  disabled={!previousLesson || switchingLesson}
                  onClick={() => previousLesson && selectLesson(previousLesson)}
                  type="button"
                >
                  ← Vídeo anterior
                </button>
                <button
                  className="button button-primary"
                  disabled={!nextLesson || switchingLesson}
                  onClick={() => nextLesson && selectLesson(nextLesson)}
                  type="button"
                >
                  Próximo vídeo <span aria-hidden="true">→</span>
                </button>
              </div>
            </section>
          )}
        </section>

        <aside aria-label="Conteúdo da trilha" className="learning-curriculum">
          <details className="learning-curriculum-details" open>
            <summary>
              <span>Aulas</span>
              <span className="learning-curriculum-count">
                {experience.track.completedLessonCount}/{experience.track.lessonCount}
              </span>
            </summary>
            <ol className="learning-lesson-list">
              {experience.lessons.map((lesson) => {
                const isCurrent = lesson.id === selectedLesson?.id;
                return (
                  <li key={lesson.id}>
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
                      {isCurrent && <span aria-hidden="true" className="learning-current-mark">●</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </details>
          <p className="learning-order-note">
            Você pode assistir aos vídeos na ordem que preferir.
          </p>
        </aside>
      </div>
    </main>
  );
}

function getTrackArtwork(title: string) {
  const normalizedTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/ergonomia|atividade fisica/.test(normalizedTitle)) return 'ergonomics';
  if (/alimentacao|nutricao/.test(normalizedTitle)) return 'nutrition';
  if (/primeiros socorros|saude/.test(normalizedTitle)) return 'first-aid';
  if (/seguranca|comportamento seguro|prevencao/.test(normalizedTitle)) return 'safety';
  if (/demonstracao|pratica|tecnica/.test(normalizedTitle)) return 'practice';
  return 'course';
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clampedValue}
      className="learning-progress-track"
      role="progressbar"
    >
      <span style={{ transform: `scaleX(${clampedValue / 100})` }} />
    </div>
  );
}

function getTrackPath(track: LearningTrackCard, tracks: LearningTrackCard[]): string {
  const slug = createTrackSlug(track.title);
  const duplicateTitle = tracks.some(
    (candidate) => candidate.id !== track.id && createTrackSlug(candidate.title) === slug,
  );
  return `/learning/tracks/${duplicateTitle ? track.id : slug}`;
}

function getTrackProgress(track: LearningTrackCard): number {
  if (track.lessonCount <= 0) {
    return 0;
  }
  return track.completedLessonCount === track.lessonCount
    ? 100
    : Math.min(99, Math.max(0, track.progressPercentage));
}

function getNextTrack(tracks: LearningTrackCard[]): LearningTrackCard | null {
  return tracks.find((track) => getTrackProgress(track) > 0 && getTrackProgress(track) < 100)
    ?? tracks.find((track) => getTrackProgress(track) < 100)
    ?? tracks[0]
    ?? null;
}

function getNextLesson(lessons: LearningLessonProgress[]): LearningLessonProgress | null {
  return lessons.find((lesson) => !lesson.isCompleted && lesson.watchedPercentage > 0)
    ?? lessons.find((lesson) => !lesson.isCompleted)
    ?? lessons[0]
    ?? null;
}

function getOverallProgress(tracks: LearningTrackCard[]): number {
  const totalLessons = tracks.reduce(
    (total, track) => total + Math.max(0, track.lessonCount),
    0,
  );
  if (totalLessons === 0) {
    return 0;
  }

  const weightedProgress = tracks.reduce(
    (total, track) =>
      total + Math.max(0, track.lessonCount) * getTrackProgress(track),
    0,
  );
  return Math.floor(weightedProgress / totalLessons);
}

function resolveAssignedTrackId(routeValue: string, tracks: LearningTrackCard[]): string {
  const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(routeValue);
  if (isGuid) {
    return routeValue;
  }

  const matches = tracks.filter((track) => createTrackSlug(track.title) === routeValue);
  return matches.length === 1 ? matches[0].id : routeValue;
}

function createTrackSlug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getLearningErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 503) {
    return 'A reprodução de vídeos não está configurada neste ambiente.';
  }

  return error instanceof Error ? error.message : 'Não foi possível concluir a solicitação. Tente novamente.';
}
import LoadingState from './LoadingState';
