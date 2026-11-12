import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import './LearningCatalog.css';
import CourseDialog from './CourseDialog';
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
}: {
  participantName?: string;
  tenantName?: string;
}) {
  const { trackId } = useParams();
  const [searchParams] = useSearchParams();
  const setSummary = useOutletContext<((summary: LearningSummary | null) => void) | undefined>();
  return trackId ? (
    <LearningTrackPage
      resumeLessonId={searchParams.get('lesson')}
      setSummary={setSummary}
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
  const [resumeExperience, setResumeExperience] = useState<LearningExperience | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [error, setError] = useState('');
  const [resumeError, setResumeError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'started' | 'completed'>('all');
  const [category, setCategory] = useState<CourseCategory>('all');
  const [sortMode, setSortMode] = useState<CourseSort>('recommended');
  const [shownMilestone, setShownMilestone] = useState<number | null>(null);

  const overallProgress = getOverallProgress(tracks);
  const isFormationComplete = overallProgress >= 100;
  const completedCourses = tracks.filter(track => getTrackProgress(track) === 100).length;
  const totalLessons = tracks.reduce((total, track) => total + track.lessonCount, 0);
  const startedAnyCourse = tracks.some(track => getTrackProgress(track) > 0);
  const resumeTrack = tracks.find(track => getTrackProgress(track) > 0 && getTrackProgress(track) < 100) ?? null;
  const recommendedTrack = tracks.find(track => getTrackProgress(track) < 100) ?? null;
  const continueTrack = resumeTrack ?? recommendedTrack;
  const continueTitle = continueTrack ? getTrackDisplayTitle(continueTrack.title) : null;
  const recommendedTitle = recommendedTrack ? getTrackDisplayTitle(recommendedTrack.title) : null;
  const resumeLesson = resumeExperience
    ? getResumeLesson(resumeExperience.lessons)
    : null;
  const currentStepIndex = tracks.findIndex(track => getTrackProgress(track) > 0 && getTrackProgress(track) < 100);
  const activeStepIndex = currentStepIndex >= 0
    ? currentStepIndex
    : tracks.findIndex(track => getTrackProgress(track) < 100);
  const currentStepNumber = activeStepIndex >= 0 ? activeStepIndex + 1 : tracks.length;
  const milestone = overallProgress >= 100 ? 100 : overallProgress >= 50 ? 50 : overallProgress >= 25 ? 25 : null;
  const statusCounts = {
    all: tracks.length,
    started: tracks.filter(track => getTrackProgress(track) > 0 && getTrackProgress(track) < 100).length,
    completed: completedCourses,
  };
  const statusFilterOptions = [
    { value: 'all' as const, label: 'Todos' },
    ...(statusCounts.started > 0 ? [{ value: 'started' as const, label: 'Em andamento' }] : []),
    ...(statusCounts.completed > 0 ? [{ value: 'completed' as const, label: 'Concluídos' }] : []),
  ];
  const sortOptions: { value: CourseSort; label: string }[] = [{ value: 'recommended', label: 'Recomendados' }];
  if (tracks.length > 0 && tracks.every(track => getTrackDate(track) !== null)) {
    sortOptions.push({ value: 'newest', label: 'Mais recentes' });
  }
  if (tracks.length > 0 && tracks.every(track => getTrackDuration(track) !== null)) {
    sortOptions.push({ value: 'shortest', label: 'Menor duração' });
  }
  const orderedTracks = [...tracks];
  if (sortMode === 'newest' && sortOptions.some(option => option.value === 'newest')) {
    orderedTracks.sort((first, second) => (getTrackDate(second) ?? 0) - (getTrackDate(first) ?? 0));
  } else if (sortMode === 'shortest' && sortOptions.some(option => option.value === 'shortest')) {
    orderedTracks.sort((first, second) => (getTrackDuration(first) ?? 0) - (getTrackDuration(second) ?? 0));
  } else if (recommendedTrack) {
    orderedTracks.sort((first, second) =>
      Number(second.id === recommendedTrack.id) - Number(first.id === recommendedTrack.id));
  }
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleTracks = orderedTracks.filter(track => (
    (filter === 'all' || (filter === 'started'
      ? getTrackProgress(track) > 0 && getTrackProgress(track) < 100
      : getTrackProgress(track) === 100)) &&
    (category === 'all' || getCourseCategory(track) === category) &&
    `${track.title} ${track.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  ));

  useEffect(() => {
    setSummary?.(!isLoading && !error ? {
      percentage: overallProgress,
      completed: completedCourses,
      total: tracks.length,
    } : null);
  }, [setSummary, tracks, isLoading, error, overallProgress, completedCourses]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    setTracks([]);

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

  useEffect(() => {
    if (!resumeTrack) {
      setResumeExperience(null);
      setResumeError('');
      setIsLoadingResume(false);
      return;
    }

    let active = true;
    setResumeExperience(null);
    setResumeError('');
    setIsLoadingResume(true);
    getAssignedLearningTrack(resumeTrack.id)
      .then(experience => {
        if (active) {
          setResumeExperience(experience);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setResumeError(getLearningErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingResume(false);
        }
      });

    return () => {
      active = false;
    };
  }, [resumeTrack?.id]);

  useEffect(() => {
    if (milestone === null || sessionStorage.getItem(`sipat-learning-milestone:${milestone}`)) {
      return;
    }
    sessionStorage.setItem(`sipat-learning-milestone:${milestone}`, 'shown');
    setShownMilestone(milestone);
  }, [milestone]);

  const handleStatusTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const nextIndex = event.key === 'ArrowRight'
      ? (index + 1) % statusFilterOptions.length
      : event.key === 'ArrowLeft'
        ? (index + statusFilterOptions.length - 1) % statusFilterOptions.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? statusFilterOptions.length - 1
            : -1;
    if (nextIndex < 0) {
      return;
    }
    event.preventDefault();
    const nextFilter = statusFilterOptions[nextIndex].value;
    setFilter(nextFilter);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]
      ?.focus();
  };

  const continuePath = continueTrack
    ? `${getTrackPath(continueTrack, tracks)}${resumeTrack && resumeLesson ? `?lesson=${encodeURIComponent(resumeLesson.id)}` : ''}`
    : '';
  const remainingCourseMinutes = resumeExperience && resumeLesson
    ? getRemainingCourseMinutes(resumeExperience.lessons, resumeLesson)
    : null;
  const categoryOptions = [
    { value: 'all', label: 'Todas as categorias' },
    ...courseCategories.map(value => ({ value, label: value })),
  ] as const;

  return (
    <main className={`learning-page learning-catalog${startedAnyCourse ? ' is-returning' : ''}`}>
      <header className="learning-page-heading">
        {participantName && <p className="learning-catalog-greeting">Olá, {participantName.split(' ')[0]}.</p>}
        <h1>{startedAnyCourse ? 'Bom te ver de volta.' : 'Seus cursos. Seu próximo passo.'}</h1>
        <p className="muted-copy">
          {startedAnyCourse
            ? 'Continue de onde parou e avance no seu ritmo.'
            : 'Explore os cursos da sua SIPAT e acompanhe cada conquista, no seu ritmo.'}
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
        {!startedAnyCourse && recommendedTrack && (
          <section aria-label="Comece sua formação" className="learning-catalog-first-hero">
            <div className="learning-catalog-first-progress">
              <div
                aria-label={`Progresso da formação: ${overallProgress}% concluído`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={overallProgress}
                aria-valuetext={`${overallProgress}% concluído`}
                className="learning-catalog-overview-ring"
                role="progressbar"
                style={{ background: `conic-gradient(var(--learner-highlight) ${overallProgress}%, var(--learner-progress-track) 0)` }}
              >
                <span>{overallProgress}%</span>
              </div>
              <div className="learning-catalog-progress">
                <h2>Sua formação</h2>
                <p>{completedCourses} de {tracks.length} cursos concluídos · {totalLessons} aulas</p>
                <p className="learning-catalog-first-note">
                  Dê o primeiro passo. Cada aula é curta e você pode pausar quando quiser.
                </p>
              </div>
            </div>
            <div className="learning-catalog-first-next">
              <p className="learning-catalog-eyebrow">Comece por aqui</p>
              <h2>{recommendedTitle ?? recommendedTrack.title}</h2>
              <p>{getTrackMetadata(recommendedTrack)}</p>
              <Link className="learning-catalog-feature-action" to={getTrackPath(recommendedTrack, tracks)}>
                Começar agora <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>
        )}

        {startedAnyCourse && (
          <section
            aria-label={isFormationComplete ? 'Formação concluída' : 'Formação em andamento'}
            className={`learning-resume-hero learning-formation-hero${isFormationComplete ? '' : ' is-in-progress'}`}
          >
            <div className="learning-resume-content">
              <p className="learning-catalog-eyebrow">Sua trilha</p>
              <h2>{isFormationComplete ? 'Formação concluída' : 'Formação em andamento'}</h2>
              <div className="learning-completion-progress">
                <div className="learning-completion-progress-heading">
                  <span>Passo {currentStepNumber} de {tracks.length}</span>
                  <strong>{overallProgress}% da formação</strong>
                </div>
                <ProgressBar
                  label={`Progresso da formação: ${completedCourses} de ${tracks.length} cursos concluídos`}
                  value={overallProgress}
                />
              </div>
              {!isFormationComplete && continueTrack && (
                <>
                  <p className="learning-formation-current-course">
                    {resumeTrack && resumeLesson ? `Aula ${resumeLesson.position} · ` : ''}
                    {continueTitle ?? continueTrack.title}
                  </p>
                  {resumeTrack && resumeLesson
                    ? <p>
                        Você parou em {formatDuration(resumeLesson.lastPlaybackPositionMilliseconds)}
                        {remainingCourseMinutes !== null && ` · faltam ${remainingCourseMinutes} min para terminar o curso`}
                      </p>
                    : resumeTrack && isLoadingResume
                      ? <p role="status">Carregando o ponto em que você parou...</p>
                      : resumeTrack && resumeError
                        ? <p role="status">{resumeError} Abra o curso para continuar.</p>
                        : <p>{resumeTrack ? 'Continue seu curso no seu ritmo.' : 'Comece por este curso para avançar na formação.'}</p>}
                  <Link className="learning-catalog-feature-action" to={continuePath}>
                    {resumeTrack ? 'Continuar aula' : 'Começar curso'} <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </div>
            <div
              aria-hidden="true"
              className={`learning-completion-illustration${isFormationComplete ? '' : ' is-in-progress'}`}
            >
              <svg viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="62" fill="currentColor" fillOpacity="0.1" stroke="currentColor" strokeOpacity="0.24" />
                {isFormationComplete ? (
                  <>
                    <path d="M48 30h44v24c0 18-9 29-22 29S48 72 48 54V30Z" fill="currentColor" />
                    <path d="M48 39H32v11c0 14 8 22 21 23M92 39h16v11c0 14-8 22-21 23" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
                    <path d="M70 84v17M51 108h38" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
                    <path d="m70 42 3.5 7 7.5 1-5.5 5.2 1.3 7.3-6.8-3.6-6.8 3.6 1.3-7.3-5.5-5.2 7.5-1L70 42Z" fill="var(--learner-deep)" />
                  </>
                ) : (
                  <>
                    <path d="M70 44c-10-7-22-9-34-6v42c12-3 24-1 34 6 10-7 22-9 34-6V38c-12-3-24-1-34 6Z" fill="currentColor" />
                    <path d="M70 44v42M45 51c7-1 13 0 18 2m14-2c5-2 11-3 18-2" fill="none" stroke="var(--learner-deep)" strokeLinecap="round" strokeWidth="5" />
                  </>
                )}
              </svg>
            </div>
          </section>
        )}

        {startedAnyCourse && overallProgress < 100 && (
          <>
            <section aria-labelledby="learning-journey-title" className="learning-journey-card">
              <div className="learning-journey-heading">
                <h2 id="learning-journey-title">Sua trilha</h2>
                <span>Passo {currentStepNumber} de {tracks.length} · {overallProgress}% da formação</span>
              </div>
              <ProgressBar label="Progresso da trilha" value={overallProgress} />
              <ol aria-label="Etapas da formação" className="learning-journey-steps">
                {tracks.map((track, index) => {
                  const percentage = getTrackProgress(track);
                  const isComplete = percentage === 100;
                  const isCurrent = index === activeStepIndex && !isComplete;
                  const title = getTrackDisplayTitle(track.title);
                  return (
                    <li className={`learning-journey-step${isComplete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`} key={track.id}>
                      <Link
                        aria-current={isCurrent ? 'step' : undefined}
                        to={getTrackPath(track, tracks)}
                      >
                        <strong>{index + 1} · {title}</strong>
                        <span>{isComplete
                          ? 'Concluído'
                          : isCurrent
                            ? `Em andamento · ${track.completedLessonCount} de ${track.lessonCount} aulas`
                            : 'A seguir'}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
            {shownMilestone !== null && shownMilestone < 100 && (
              <p className="learning-milestone" role="status">
                {shownMilestone === 25
                  ? completedCourses > 0
                    ? `Você concluiu ${completedCourses} ${completedCourses === 1 ? 'curso' : 'cursos'}. Falta pouco para a metade da formação.`
                    : 'Você já avançou na formação. Continue no seu ritmo.'
                  : 'Você chegou à metade da formação. Continue no seu ritmo.'}
              </p>
            )}
          </>
        )}

        <section aria-labelledby="learning-catalog-title" className="learning-catalog-list-section">
          <div className="learning-catalog-list-heading">
            <h2 id="learning-catalog-title">Meus cursos <span>{tracks.length}</span></h2>
          </div>
          <div className="learning-catalog-toolbar">
            <div aria-label="Filtrar por situação" className="learning-catalog-filters" role="tablist">
              {statusFilterOptions.map(({ value, label }, index) => (
                <button
                  aria-selected={filter === value}
                  aria-controls="learning-status-panel"
                  id={`learning-status-tab-${value}`}
                  key={value}
                  onClick={() => setFilter(value)}
                  onKeyDown={event => handleStatusTabKeyDown(event, index)}
                  role="tab"
                  tabIndex={filter === value ? 0 : -1}
                  type="button"
                >
                  {label} <span>{statusCounts[value]}</span>
                </button>
              ))}
            </div>
            <label className="learning-catalog-search" htmlFor="learning-course-search">
              Buscar curso
              <span className="learning-catalog-search-control">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
                <input
                  id="learning-course-search"
                  onChange={event => setSearch(event.target.value)}
                  placeholder="O que você quer aprender?"
                  type="search"
                  value={search}
                />
              </span>
            </label>
          </div>
          <div className="learning-catalog-category-toolbar">
            <div aria-label="Categorias de cursos" className="learning-catalog-category-list">
              {categoryOptions.map(option => (
                <button
                  aria-pressed={category === option.value}
                  className={`learning-catalog-category-chip${category === option.value ? ' is-active' : ''}`}
                  key={option.value}
                  onClick={() => setCategory(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {sortOptions.length > 1
              ? <label className="learning-catalog-sort">Ordenar
                  <select onChange={event => setSortMode(event.target.value as CourseSort)} value={sortMode}>
                    {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              : <p className="learning-catalog-sort-note">Ordenar: Recomendados</p>}
          </div>
          <div
            aria-labelledby={`learning-status-tab-${filter}`}
            className="learning-catalog-tab-panel"
            id="learning-status-panel"
            role="tabpanel"
            tabIndex={0}
          >
            {visibleTracks.length === 0
              ? <p className="learning-state" role="status">Nenhum curso corresponde à sua busca ou filtro.</p>
              : <div className="learning-catalog-grid">
                  {visibleTracks.map(track => {
                    const percentage = getTrackProgress(track);
                    const completed = percentage === 100;
                    const started = percentage > 0;
                    const isRecommended = !startedAnyCourse && track.id === recommendedTrack?.id;
                    const categoryLabel = getCourseCategory(track);
                    const title = getTrackDisplayTitle(track.title);
                    return <article className="learning-catalog-course" key={track.id}>
                      <div className={`learning-catalog-artwork${isRecommended ? ' is-recommended' : ''}`} data-artwork={getTrackArtwork(track.title)}>
                        <img alt="" decoding="async" loading="lazy" src={track.coverUrl ?? getCourseCover(track.title)} />
                        {isRecommended && <span className="is-recommended">Comece por aqui</span>}
                      </div>
                      <div className="learning-catalog-course-content">
                        <div className="learning-catalog-course-metadata">
                          <span
                            aria-hidden={!categoryLabel}
                            className={`learning-catalog-course-category${categoryLabel ? '' : ' is-empty'}`}
                          >
                            {categoryLabel ?? ''}
                          </span>
                          <span className="learning-catalog-video-count">
                            <svg aria-hidden="true" viewBox="0 0 16 16">
                              <rect height="10" rx="2" width="10" x="1" y="3" />
                              <path d="m11 6 4-2v8l-4-2" />
                            </svg>
                            {track.lessonCount} {track.lessonCount === 1 ? 'vídeo' : 'vídeos'}
                          </span>
                        </div>
                        <h3><Link to={getTrackPath(track, tracks)}>{title}</Link></h3>
                        <div className="learning-catalog-course-progress">
                          <span>{track.completedLessonCount} de {track.lessonCount} aulas{started && !completed ? ` · ${percentage}%` : ''}</span>
                        </div>
                        <ProgressBar value={percentage} label={`Progresso de ${title}`} />
                        <Link
                          aria-label={`${completed ? 'Ver certificado de' : started ? 'Continuar curso' : 'Começar curso'} ${title}`}
                          className={`learning-catalog-course-action${isRecommended && !started ? ' is-primary' : ''}${completed ? ' is-complete' : ''}`}
                          to={completed ? '/learning/certificates' : getTrackPath(track, tracks)}
                        >
                          {completed ? 'Ver certificado' : started ? 'Continuar de onde parou' : 'Começar curso'}
                          <span aria-hidden="true">→</span>
                        </Link>
                      </div>
                    </article>;
                  })}
                </div>}
          </div>
        </section>
      </>}
    </main>
  );
}

function LearningTrackPage({
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
  const [playbackRate, setPlaybackRate] = useState('1');
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
  }, [selectedLessonId]);

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
        <header className="learning-active-lesson-heading">
          <p className="eyebrow">AULA {selectedLesson.position} DE {experience.lessons.length}</p>
          <h2>{selectedLesson.title}</h2>
        </header>
      )}

      <div className="learning-experience-layout">
        <section className="learning-main-column">
          <div className="learning-player-frame">
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
                  onEnded={() => void handleVideoEnded()}
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
        </section>

        <aside aria-label="Conteúdo e avaliação do curso" className="learning-course-sidebar">
          <section aria-labelledby="learning-curriculum-title" className="learning-curriculum-card">
            <div className="learning-curriculum-heading">
              <h2 id="learning-curriculum-title">Conteúdo do curso</h2>
              <span className="learning-curriculum-count">{completedLessons}/{experience.lessons.length}</span>
            </div>
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
          </section>
          <LearningActivitiesPanel
            trackId={apiTrackId ?? experience.track.id}
            lessonId={selectedLesson?.id ?? null}
            lessonPosition={selectedLesson?.position ?? 1}
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
            <CourseDialog onClose={closeLessonDetails} title="Informações da aula" wide>
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

function getTrackDisplayTitle(title: string): string {
  const match = title.match(/^\s*Opção\s+\d+\s*·\s*(.+)$/iu);
  return match ? match[1].trim() : title;
}

function getTrackArtwork(title: string) {
  const normalizedTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/ergonomia|atividade fisica/.test(normalizedTitle)) return 'ergonomics';
  if (/alimentacao|nutricao/.test(normalizedTitle)) return 'nutrition';
  if (/seguranca|comportamento seguro|prevencao/.test(normalizedTitle)) return 'safety';
  if (/higiene mental|saude mental|qualidade do sono/.test(normalizedTitle)) return 'wellbeing';
  if (/habitos de vida|qualidade de vida/.test(normalizedTitle)) return 'habits';
  if (/primeiros socorros|saude/.test(normalizedTitle)) return 'first-aid';
  if (/lideranca/.test(normalizedTitle)) return 'leadership';
  if (/demonstracao|pratica|tecnica/.test(normalizedTitle)) return 'practice';
  return 'course';
}

const courseCategories = [
  'Saúde física',
  'Alimentação',
  'Segurança',
  'Bem-estar mental',
] as const;

type CourseCategory = 'all' | typeof courseCategories[number];
type CourseSort = 'recommended' | 'newest' | 'shortest';
type TrackWithOptionalCatalogMetadata = LearningTrackCard & {
  assignedAt?: string | null;
  category?: string | null;
  durationMilliseconds?: number | null;
  level?: string | null;
  totalDurationMilliseconds?: number | null;
};

function getCourseCategory(track: TrackWithOptionalCatalogMetadata): CourseCategory | null {
  const explicitCategory = track.category?.trim().toLocaleLowerCase('pt-BR');
  const explicitMatch = courseCategories.find(
    value => value.toLocaleLowerCase('pt-BR') === explicitCategory,
  );
  if (explicitMatch) {
    return explicitMatch;
  }

  const title = track.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (/alimentacao|nutricao/.test(title)) return 'Alimentação';
  if (/seguranca|prevencao|primeiros socorros/.test(title)) return 'Segurança';
  if (/bem-estar|saude mental|ansiedade|estresse|emocional/.test(title)) return 'Bem-estar mental';
  if (/saude|ergonomia|atividade fisica|postura/.test(title)) return 'Saúde física';
  return null;
}

function getTrackDuration(track: TrackWithOptionalCatalogMetadata): number | null {
  const duration = track.totalDurationMilliseconds ?? track.durationMilliseconds;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : null;
}

function getTrackDate(track: TrackWithOptionalCatalogMetadata): number | null {
  if (!track.assignedAt) {
    return null;
  }
  const date = Date.parse(track.assignedAt);
  return Number.isFinite(date) ? date : null;
}

function getTrackMetadata(track: TrackWithOptionalCatalogMetadata): string {
  const videoLabel = `${track.lessonCount} ${track.lessonCount === 1 ? 'vídeo' : 'vídeos'}`;
  const duration = getTrackDuration(track);
  const level = track.level?.trim();
  return [videoLabel, duration ? formatCourseDuration(duration) : null, level || null]
    .filter(Boolean)
    .join(' · ');
}

function formatCourseDuration(milliseconds: number): string {
  const minutes = Math.ceil(milliseconds / 60_000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
  }
  return `${minutes} min`;
}

function getResumeLesson(lessons: LearningLessonProgress[]): LearningLessonProgress | null {
  return lessons.find(lesson => !lesson.isCompleted &&
    (lesson.lastPlaybackPositionMilliseconds > 0 || lesson.watchedPercentage > 0))
    ?? lessons.find(lesson => !lesson.isCompleted)
    ?? null;
}

function getRemainingCourseMinutes(
  lessons: LearningLessonProgress[],
  currentLesson: LearningLessonProgress,
): number | null {
  const remainingMilliseconds = lessons.reduce((total, lesson) => {
    if (lesson.isCompleted) {
      return total;
    }
    return total + Math.max(
      0,
      lesson.durationMilliseconds - (lesson.id === currentLesson.id
        ? lesson.lastPlaybackPositionMilliseconds
        : 0),
    );
  }, 0);
  return remainingMilliseconds > 0 ? Math.ceil(remainingMilliseconds / 60_000) : null;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return (
    <div
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={clampedValue}
      aria-valuetext={`${clampedValue}%`}
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
