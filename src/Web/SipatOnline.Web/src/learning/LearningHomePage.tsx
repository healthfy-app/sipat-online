import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { getCourseCover } from '@/courseCover';
import {
  getAssignedLearningTrack,
  listAssignedLearningTracks,
  type LearningExperience,
  type LearningTrackCard,
} from '@/api';
import {
  getTrackDisplayTitle,
  getTrackArtwork,
  courseCategories,
  getCourseCategory,
  getTrackDuration,
  getTrackDate,
  getTrackMetadata,
  getResumeLesson,
  getRemainingCourseMinutes,
  getTrackPath,
  getTrackProgress,
  getOverallProgress,
  formatDuration,
  getLearningErrorMessage,
  type CourseCategory,
  type CourseSort,
  type LearningSummary,
} from './learningHelpers';
import LoadingState from '@/LoadingState';
import ProgressBar from './ProgressBar';
import './CourseCards.css';

export default function LearningHomePage({ participantName, setSummary }: {
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
                        {isRecommended
                          ? <span className="is-recommended">Comece por aqui</span>
                          : <span aria-hidden="true" className={`learning-catalog-course-state is-${completed ? 'done' : started ? 'progress' : 'new'}`}>
                              {completed ? 'Concluído' : started ? 'Em andamento' : 'Para fazer'}
                            </span>}
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
                          className={`learning-catalog-course-action${isRecommended && !started ? ' is-primary' : ''}${completed ? ' is-complete' : ''}${started && !completed ? ' is-started' : ''}`}
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
