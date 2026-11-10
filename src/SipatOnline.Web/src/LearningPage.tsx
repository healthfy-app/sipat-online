import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext, useParams } from 'react-router-dom';
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
    <LearningHomePage />
  );
}

function LearningHomePage() {
  const [tracks, setTracks] = useState<LearningTrackCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const nextTrack = getNextTrack(tracks);

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
    <main className="learning-page">
      <header className="learning-page-heading">
        <p className="eyebrow">CONTEÚDOS DA SIPAT</p>
        <h1>Minhas trilhas de aprendizagem</h1>
        <p className="muted-copy">
          Acesse as trilhas incluídas na programação da SIPAT da sua empresa e continue de onde parou.
        </p>
      </header>

      {isLoading && <p className="learning-state" aria-live="polite">Carregando suas trilhas...</p>}
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
      {!isLoading && !error && nextTrack && (
        <Navigate to={getTrackPath(nextTrack, tracks)} replace />
      )}
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
          progressPercentage: totalDuration === 0
            ? 0
            : Math.min(100, Math.floor(watchedDuration * 100 / totalDuration)),
        },
      };
    });
  }, []);

  const persistPlayback = useCallback(async (force: boolean) => {
    const video = videoRef.current;
    const lesson = selectedLesson;
    const session = playbackSession;
    const assignedTrackId = apiTrackId;
    if (!video || !lesson || !session || !assignedTrackId || saveInFlightRef.current) {
      return;
    }

    const positionMilliseconds = Math.min(
      lesson.durationMilliseconds,
      Math.max(0, Math.floor(video.currentTime * 1000)),
    );
    const rangeStart = rangeStartRef.current === null
      ? null
      : Math.min(
          lesson.durationMilliseconds,
          Math.max(0, rangeStartRef.current),
        );
    const hasRange = rangeStart !== null && positionMilliseconds - rangeStart >= 1000;
    const positionChanged = Math.abs(positionMilliseconds - lastSavePositionRef.current) >= 1000;
    if (!hasRange && !positionChanged) {
      return;
    }

    if (!force && hasRange && positionMilliseconds - rangeStart < 8000) {
      return;
    }

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
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
        rangeStartRef.current = positionMilliseconds;
      } else {
        const progress = await saveLearningPosition(assignedTrackId, lesson.id, positionMilliseconds);
        applyProgress(progress);
      }
      lastSavePositionRef.current = positionMilliseconds;
      setSaveMessage('Progresso salvo');
    } catch (saveError) {
      setSaveMessage(getLearningErrorMessage(saveError));
    } finally {
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
      void persistPlayback(true);
    };
  }, [persistPlayback, playbackSession, selectedLesson]);

  function handlePlaying() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

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

  function selectLesson(lesson: LearningLessonProgress) {
    if (lesson.id === selectedLessonId) {
      return;
    }

    void persistPlayback(true);
    setSelectedLessonId(lesson.id);
  }

  if (isLoading) {
    return <p className="learning-state" aria-live="polite">Carregando a trilha...</p>;
  }

  if (error || !experience) {
    return (
      <main className="learning-page">
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
          <strong>{overallProgress}% concluído</strong>
          <ProgressBar value={overallProgress} label="Progresso geral da formação" />
        </div>
      </header>

      <LearningJourney
        activeTrackId={experience.track.id}
        onSelectTrack={(track) => navigate(getTrackPath(track, journeyTracks))}
        tracks={journeyTracks}
      />

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
                  onEnded={() => void persistPlayback(true)}
                  onLoadedMetadata={handleLoadedMetadata}
                  onPause={() => void persistPlayback(true)}
                  onPlaying={handlePlaying}
                  onSeeking={handleSeeking}
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
          </div>

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
                  disabled={!previousLesson}
                  onClick={() => previousLesson && selectLesson(previousLesson)}
                  type="button"
                >
                  ← Vídeo anterior
                </button>
                <button
                  className="button button-primary"
                  disabled={!nextLesson}
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

function LearningJourney({
  activeTrackId,
  onSelectTrack,
  tracks,
}: {
  activeTrackId: string;
  onSelectTrack: (track: LearningTrackCard) => void;
  tracks: LearningTrackCard[];
}) {
  return (
    <nav aria-label="Trilhas da SIPAT" className="learning-journey">
      {tracks.map((track, index) => {
        const isCurrent = track.id === activeTrackId;
        const isComplete = track.progressPercentage >= 100;
        const status = isComplete
          ? 'Concluída'
          : track.progressPercentage > 0
            ? 'Em andamento'
            : 'Não iniciada';

        return (
          <div className="learning-journey-stop" key={track.id}>
            {index < tracks.length - 1 && (
              <svg
                aria-hidden="true"
                className={`learning-journey-connector${isComplete ? ' is-complete' : ''}`}
                preserveAspectRatio="none"
                viewBox="0 0 100 64"
              >
                <path d={index % 2 === 0 ? 'M 0 32 C 38 -8, 62 72, 100 32' : 'M 0 32 C 38 72, 62 -8, 100 32'} />
              </svg>
            )}
            <button
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${track.title}: ${status}`}
              className={`learning-journey-node${isCurrent ? ' is-current' : ''}${
                isComplete ? ' is-complete' : ''
              }`}
              onClick={() => onSelectTrack(track)}
              type="button"
            >
              <span aria-hidden="true" className="learning-journey-indicator-wrap">
                <span className="learning-journey-indicator">{isComplete ? '✓' : ''}</span>
              </span>
              <span className="learning-journey-title">{track.title}</span>
              <span className="learning-journey-status">{status}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
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
      <span style={{ width: `${clampedValue}%` }} />
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

function getNextTrack(tracks: LearningTrackCard[]): LearningTrackCard | null {
  return tracks.find((track) => track.progressPercentage > 0 && track.progressPercentage < 100)
    ?? tracks.find((track) => track.progressPercentage < 100)
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
      total + Math.max(0, track.lessonCount) * Math.min(100, Math.max(0, track.progressPercentage)),
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
