import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import LearningActivitiesPanel from '@/LearningActivitiesPanel';
import {
  getAssignedLearningTrack,
  listAssignedLearningTracks,
  primeAntiforgeryToken,
  recordLearningPlaybackRange,
  sendPlaybackQuality,
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
  getTrackPath,
  getTrackProgress,
  getNextLesson,
  getOverallProgress,
  houseLessons,
  resolveAssignedTrackId,
  getLearningErrorMessage,
  type LearningSummary,
} from './learningHelpers';
import LoadingState from '@/LoadingState';
import {
  ExternalVideoLink,
  ExternalVideoPlayer,
  SipatVideoPlayer,
  type PlayerEvent,
  type PlayerQualitySummary,
  type SaveReason,
  type SipatVideoPlayerHandle,
  type WatchedRange,
} from '@sipat/video-player';
import { partWord } from '@/trainings/partWord';
import { formatDayDate } from './WeekVideos';
import UpNextCard from './UpNextCard';
import { DayAbout, DayControls, DayDone, DayPlaylist, DayStageHead, DayTop } from './day/DayParts';
import { dayStanding, isExternalLesson, nextUnfinished } from './day/dayLessons';
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
  const [query] = useSearchParams();
  const askedVideoId = query.get('video');
  // the session remembers its lesson, so a player never mounts with one lesson's session under another lesson
  const [playbackSession, setPlaybackSession] = useState<(LearningPlaybackSession & { lessonId: string }) | null>(null);
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
  const [isSaving, setIsSaving] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<SipatVideoPlayerHandle>(null);
  const lastSavePositionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  const playbackIdentityRef = useRef('');
  const advanceAfterCompletionRef = useRef(false);
  // what the save of the end of the video did: the 'ended' event that follows only advances when neither happened
  const endedSaveRef = useRef<'failed' | 'moved' | null>(null);
  const switchingLessonRef = useRef(false);
  const [switchingLesson, setSwitchingLesson] = useState(false);
  /** The video that starts by itself when the countdown over the finished one closes. */
  const [upNextId, setUpNextId] = useState<string | null>(null);
  useEffect(() => { setUpNextId(null); }, [selectedLessonId]);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
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
              : data.lessons.find((lesson) => lesson.id === askedVideoId)?.id
                ?? data.lessons.find((lesson) => lesson.id === resumeLessonId)?.id
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
  const activeSession = playbackSession && playbackSession.lessonId === selectedLesson?.id ? playbackSession : null;
  playbackIdentityRef.current = `${apiTrackId}/${selectedLessonId}/${activeSession?.sessionId}`;

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
    // an extra plays in the provider's player: no session, no resume, nothing to save
    if (!selectedLesson || !apiTrackId || selectedLesson.isBonus) {
      setPlaybackSession(null);
      setPlaybackError('');
      setIsStartingPlayback(false);
      setSaveMessage('');
      setSeekNotice(false);
      return;
    }

    let active = true;
    setIsStartingPlayback(true);
    setPlaybackSession(null);
    setPlaybackError('');
    setSaveMessage('');
    lastSavePositionRef.current = selectedLesson.lastPlaybackPositionMilliseconds;
    endedSaveRef.current = null;
    setSeekNotice(false);

    const lessonId = selectedLesson.id;
    startLearningPlayback(apiTrackId, lessonId)
      .then((session) => {
        if (active) {
          setPlaybackSession({ ...session, lessonId });
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
      // an extra never counts: only the house videos make the numbers of the day
      const counted = houseLessons(lessons);
      const completedLessonCount = counted.filter((lesson) => lesson.isCompleted).length;
      const totalDuration = counted.reduce((total, lesson) => total + lesson.durationMilliseconds, 0);
      const watchedDuration = counted.reduce(
        (total, lesson) => total + lesson.durationMilliseconds * lesson.watchedPercentage / 100,
        0,
      );

      return {
        ...current,
        lessons,
        track: {
          ...current.track,
          completedLessonCount,
          progressPercentage: counted.length > 0 && completedLessonCount === counted.length
            ? 100
            : totalDuration === 0 ? 0 : Math.min(99, Math.floor(watchedDuration * 100 / totalDuration)),
        },
      };
    });
  }, []);

  /** Sends one save the player asked for. One at a time; the range is clamped to the lesson's duration. */
  const savePlayback = useCallback(async function save(
    reason: SaveReason, positionMs: number, range: WatchedRange | null,
  ): Promise<boolean> {
    const lesson = selectedLesson;
    const session = activeSession;
    const assignedTrackId = apiTrackId;
    if (!lesson || !session || !assignedTrackId) {
      return true;
    }
    const identity = `${assignedTrackId}/${lesson.id}/${session.sessionId}`;
    while (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }
    if (playbackIdentityRef.current !== identity) return true;

    const clamp = (value: number) => Math.min(lesson.durationMilliseconds, Math.max(0, value));
    const positionMilliseconds = clamp(positionMs);
    const rangeStart = range === null ? null : clamp(range.startMs);
    // a provider video that ended was watched to its end, even when the length typed in the editor was a bit longer
    const rangeEnd = range === null ? null
      : reason === 'ended' && isExternalLesson(lesson) ? lesson.durationMilliseconds : clamp(range.endMs);
    // a range that clamping leaves under 1 ms is saved as a position only
    const hasRange = rangeStart !== null && rangeEnd !== null && rangeEnd - rangeStart >= 1;
    if (!hasRange && Math.abs(positionMilliseconds - lastSavePositionRef.current) < 1) {
      return true;
    }

    if (reason === 'ended') {
      advanceAfterCompletionRef.current = true;
      endedSaveRef.current = null;
    }
    saveInFlightRef.current = true;
    setIsSaving(true);
    const work = (async () => { try {
      const progress = hasRange
        ? await recordLearningPlaybackRange(
          assignedTrackId,
          lesson.id,
          session.sessionId,
          rangeStart,
          rangeEnd,
          positionMilliseconds,
        )
        : await saveLearningPosition(assignedTrackId, lesson.id, positionMilliseconds);
      applyProgress(progress);
      advanceToNextLessonIfCompleted(progress);
      if (playbackIdentityRef.current === identity) {
        lastSavePositionRef.current = positionMilliseconds;
        setSaveMessage('Progresso salvo');
        setSaveFailed(false);
      }
      return true;
    } catch (saveError) {
      if (reason === 'ended') {
        advanceAfterCompletionRef.current = false;
        endedSaveRef.current = 'failed';
      }
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
  }, [activeSession, apiTrackId, applyProgress, experience, selectedLesson]);

  const activeSessionId = activeSession?.sessionId;
  useEffect(() => {
    if (activeSessionId) void primeAntiforgeryToken();
  }, [activeSessionId]);

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
      const player = playerRef.current;
      player?.pause();
      // the player sends the quality report first, then the last range
      void (player?.requestSave('leave') ?? Promise.resolve(true)).then(saved => {
        if (saved) navigate(`${destination.pathname}${destination.search}${destination.hash}`);
      }).finally(() => { switchingLessonRef.current = false; setSwitchingLesson(false); });
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!videoRef.current || (videoRef.current.paused && !saveInFlightRef.current && !saveFailed)) return;
      event.preventDefault(); event.returnValue = '';
    }
    document.addEventListener('click', leave, true);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      document.removeEventListener('click', leave, true);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [navigate, saveFailed]);

  function sendQuality(summary: PlayerQualitySummary) {
    const lessonId = selectedLesson?.id;
    const sessionId = activeSession?.sessionId;
    if (!apiTrackId || !lessonId || !sessionId) return;
    // the measurement never disturbs the video: a failed report is dropped
    try {
      void Promise.resolve(sendPlaybackQuality(apiTrackId, { ...summary, lessonId, playbackSessionId: sessionId }))
        .catch(() => undefined);
    } catch {
      // ignore
    }
  }

  function handlePlayerEvent(event: PlayerEvent): void | Promise<boolean> {
    switch (event.type) {
      case 'save':
        return savePlayback(event.reason, event.positionMs, event.range);
      case 'playing':
        setIsPlaying(true);
        // watching the finished video again cancels the countdown
        setUpNextId(null);
        if (activeSession?.expiresAt && Date.parse(activeSession.expiresAt) <= Date.now()) {
          playerRef.current?.pause();
          setPlaybackError('Sua sessão de vídeo expirou. Inicie uma nova sessão para continuar.');
          setPlaybackSession(null);
        }
        return;
      case 'paused':
        setIsPlaying(false);
        return;
      case 'ended':
        setIsPlaying(false);
        handleVideoEnded();
        return;
      case 'seekBlocked':
        setSeekNotice(true);
        return;
      case 'error':
        setPlaybackSession(null);
        setPlaybackError('Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.');
        return;
      case 'quality':
        sendQuality(event.summary);
        return;
    }
  }

  async function selectLesson(lesson: LearningLessonProgress) {
    if (lesson.id === selectedLessonId || switchingLessonRef.current) {
      return;
    }
    switchingLessonRef.current = true; setSwitchingLesson(true);
    const player = playerRef.current;
    player?.pause();
    try {
      if (await (player?.requestSave('pause') ?? Promise.resolve(true))) setSelectedLessonId(lesson.id);
    } finally { switchingLessonRef.current = false; setSwitchingLesson(false); }
  }

  function advanceToNextLessonIfCompleted(progress: LearningProgress) {
    if (!progress.isCompleted || !advanceAfterCompletionRef.current || !selectedLesson) {
      return;
    }
    advanceAfterCompletionRef.current = false;
    endedSaveRef.current = 'moved';
    moveToNextIncompleteLesson(selectedLesson.id);
  }

  function moveToNextIncompleteLesson(lessonId: string) {
    const currentLesson = experienceRef.current?.lessons.find(lesson => lesson.id === lessonId)
      ?? selectedLessonRef.current;
    const next = currentLesson && experienceRef.current ? nextUnfinished(experienceRef.current.lessons, currentLesson) : undefined;
    // not at once: a countdown over the finished video, then the next one starts by itself
    if (next) {
      setUpNextId(next.id);
    }
  }

  /** The player saved the end of the video before this: advance only if that save worked and did not advance already. */
  function handleVideoEnded() {
    const endedLessonId = selectedLesson?.id;
    const outcome = endedSaveRef.current;
    endedSaveRef.current = null;
    advanceAfterCompletionRef.current = false;
    if (!endedLessonId || outcome !== null) {
      return;
    }
    if (completedLessonIdsRef.current.has(endedLessonId) ||
      (selectedLessonRef.current?.id === endedLessonId && selectedLessonRef.current.isCompleted)) {
      moveToNextIncompleteLesson(endedLessonId);
    }
  }

  if (isLoading) {
    return <LoadingState className="learning-state">Carregando o dia...</LoadingState>;
  }

  if (error || !experience) {
    return (
      <main className="learning-page">
        <Link className="learning-back-to-courses" to="/learning">← Seu treinamento</Link>
        <div className="learning-state learning-error" role="alert">
          <p>{error || 'Não foi possível carregar este dia.'}</p>
          <div className="learning-state-actions">
            <button className="button button-secondary" onClick={() => setRetry((value) => value + 1)} type="button">
              Tentar novamente
            </button>
            <Link className="button button-quiet" to="/learning">Voltar ao treinamento</Link>
          </div>
        </div>
      </main>
    );
  }

  const currentIndex = experience.lessons.findIndex((lesson) => lesson.id === selectedLesson?.id);
  const previousLesson = currentIndex > 0 ? experience.lessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 ? experience.lessons[currentIndex + 1] ?? null : null;
  const upNextLesson = upNextId ? experience.lessons.find(lesson => lesson.id === upNextId) ?? null : null;
  const standing = dayStanding(experience.lessons);
  // the house video before the one on stage: a game placed there opens when this one starts
  const boundaryBefore = standing.hasExtras && selectedLesson && !selectedLesson.isBonus
    ? standing.counted.filter(item => item.position < selectedLesson.position).at(-1)?.position ?? 0
    : undefined;
  const trackTitle = getTrackDisplayTitle(experience.track.title);
  const dayTitle = experience.track.dayTitle ?? null;
  const dayPosition = experience.track.dayPosition ?? null;
  // "Dia" when the training has dates, "Módulo" when none of its parts has one
  const word = partWord(assignedTracks.filter(track => track.sipatEventId === experience.track.sipatEventId).map(track => track.dayDate).concat(experience.track.dayDate));
  const dayDate = formatDayDate(experience.track.dayDate);
  const markers = activities
    .filter(item => item.lessonId === selectedLesson?.id && item.timeMilliseconds !== null)
    .map(item => ({ id: item.id, seconds: item.timeMilliseconds! / 1000, title: item.module.title, done: item.outcome !== null }));
  // where to go when the day is over: the next day of the same SIPAT, or back to the week
  const nextDay = dayPosition === null ? undefined : assignedTracks.find(track =>
    track.sipatEventId === experience.track.sipatEventId && track.dayPosition === dayPosition + 1);

  return (
    <main className="learning-page day-page">
      <DayTop
        back={<Link className="day-back" to="/learning"><ArrowLeft aria-hidden="true" /> Seu treinamento</Link>}
        currentId={selectedLesson?.id ?? null}
        date={dayDate}
        position={dayPosition}
        standing={standing}
        subtitle={dayTitle && dayTitle !== trackTitle ? trackTitle : null}
        title={dayTitle ?? trackTitle}
        word={word}
      />

      {standing.isComplete && (
        <DayDone
          action={nextDay
            ? <Link className="day-done-action" to={getTrackPath(nextDay, assignedTracks)}>Ir para o {word} {nextDay.dayPosition} <ArrowRight aria-hidden="true" /></Link>
            : <Link className="day-done-action" to="/learning">Voltar ao seu treinamento <ArrowRight aria-hidden="true" /></Link>}
          position={dayPosition}
          word={word}
        />
      )}

      <div className="day-layout">
        <section aria-label="Vídeo" className="day-stage">
          {selectedLesson && <DayStageHead key={selectedLesson.id} lesson={selectedLesson} standing={standing} />}

          <div className="learning-player-frame day-player">
            {selectedLesson?.isBonus ? (
              selectedLesson.provider && selectedLesson.externalId
                ? <ExternalVideoPlayer externalId={selectedLesson.externalId} key={selectedLesson.id}
                  provider={selectedLesson.provider} title={selectedLesson.title} />
                : <div className="learning-player-state" role="alert">
                  <span aria-hidden="true" className="learning-player-icon">!</span>
                  <h2>Vídeo indisponível</h2>
                  <p>Este vídeo extra não pôde ser aberto. Siga para o próximo.</p>
                </div>
            ) : activeSession && selectedLesson && isExternalLesson(selectedLesson) ? (
              <ExternalVideoPlayer
                externalId={selectedLesson.externalId!}
                // aula já concluída pode ser revista livremente; as demais só andam até onde a pessoa já assistiu
                furthest={selectedLesson.isCompleted ? Number.POSITIVE_INFINITY : selectedLesson.lastPlaybackPositionMilliseconds / 1000}
                key={`${selectedLesson.id}-${activeSession.sessionId}`}
                onEvent={handlePlayerEvent}
                provider={selectedLesson.provider!}
                ref={playerRef}
                resumeAt={selectedLesson.lastPlaybackPositionMilliseconds / 1000}
                rules={{ watchInOrder: true, fixedSpeed: true }}
                title={selectedLesson.title}
              />
            ) : activeSession && selectedLesson ? (
              <>
                <SipatVideoPlayer
                  checkpoints={markers}
                  // aula já concluída pode ser revista livremente; as demais só andam até onde a pessoa já assistiu
                  furthest={selectedLesson.isCompleted ? Number.POSITIVE_INFINITY : selectedLesson.lastPlaybackPositionMilliseconds / 1000}
                  key={`${selectedLesson.id}-${activeSession.sessionId}`}
                  onEvent={handlePlayerEvent}
                  pauseAtCheckpoints={false}
                  ref={playerRef}
                  resumeAt={selectedLesson.lastPlaybackPositionMilliseconds / 1000}
                  rules={{ watchInOrder: true, fixedSpeed: true }}
                  sources={(activeSession.sources ?? [{ url: activeSession.url, quality: null }]).map(source => ({ src: source.url, quality: source.quality ?? undefined }))}
                  title={selectedLesson.title}
                  videoRef={videoRef}
                />
                {upNextLesson && (
                  <UpNextCard
                    key={upNextLesson.id}
                    onCancel={() => setUpNextId(null)}
                    onPlay={() => { setUpNextId(null); setSelectedLessonId(upNextLesson.id); }}
                    title={upNextLesson.title}
                  />
                )}
                {activeSession.isDevelopmentDemo && (
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
            <DayControls
              busy={switchingLesson}
              canGoBack={!!previousLesson}
              canGoForward={!!nextLesson}
              lesson={selectedLesson}
              onBack={() => { if (previousLesson) void selectLesson(previousLesson); }}
              onForward={() => { if (nextLesson) void selectLesson(nextLesson); }}
            />
          )}

          {selectedLesson?.isBonus && selectedLesson.provider && selectedLesson.externalId && (
            <div className="day-outside">
              <ExternalVideoLink externalId={selectedLesson.externalId} provider={selectedLesson.provider} />
            </div>
          )}

          <div className="day-notices">
            {seekNotice && (
              <span className="day-notice" role="status">
                Assista ao vídeo em sequência: não é possível avançar além do que você já viu.
              </span>
            )}
            <span className={`day-save${saveMessage && !isSaving ? ' is-visible' : ''}`} role="status">
              {isSaving ? 'Salvando progresso...' : saveMessage}
            </span>
            {saveFailed && <button className="button button-secondary" disabled={isSaving}
              onClick={() => void playerRef.current?.requestSave('pause')} type="button">Tentar salvar progresso</button>}
          </div>

          {selectedLesson?.description && <DayAbout description={selectedLesson.description} key={`about-${selectedLesson.id}`} />}
        </section>

        <aside aria-label="Conteúdo do dia" className="day-rail">
          <DayPlaylist
            busy={switchingLesson}
            currentId={selectedLesson?.id ?? null}
            lessons={experience.lessons}
            onSelect={lesson => void selectLesson(lesson)}
            playing={isPlaying}
            standing={standing}
          />
          <LearningActivitiesPanel
            trackId={apiTrackId ?? experience.track.id}
            lessonId={selectedLesson?.id ?? null}
            lessonPosition={selectedLesson?.position ?? 1}
            boundaryBefore={boundaryBefore}
            onActivities={setActivities}
            playbackKey={activeSession?.sessionId}
            videoRef={videoRef}
          />
        </aside>
      </div>
    </main>
  );
}
