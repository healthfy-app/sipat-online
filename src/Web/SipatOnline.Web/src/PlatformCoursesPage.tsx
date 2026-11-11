import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createPlatformCourse,
  duplicatePlatformCourse,
  listGameModules,
  listPlatformCourses,
  listPlatformLibraryVideos,
  removePlatformCourseCover,
  setPlatformCourseCover,
  setPlatformCourseVideos,
  updatePlatformCourse,
  uploadPlatformVideo,
  type GameModule,
  type GamificationGameType,
  type PlatformCourse,
  type PlatformCourseStatus,
  type PlatformCourseVideo,
  type PlatformLibraryVideo,
} from './api';
import CourseGamesSection from './CourseGamesSection';
import FilePicker from './FilePicker';
import GameModulesPanel from './GameModulesPanel';
import './PlatformCourses.css';
import { gameTypeOptions } from './gamificationGames';
import CourseEditorFrame, { type CourseEditorStep } from './CourseEditorFrame';
import VideoPreview from './VideoPreview';
import { getCourseCover } from './courseCover';
import CourseDialog from './CourseDialog';

type Tab = 'courses' | 'library' | 'modules';
type StatusFilter = 'all' | PlatformCourseStatus;
type CourseOptionFilter = 'all' | '1' | '2' | '3';

const emptyCourse = { title: '', description: '' };
const maxVideoBytes = 250 * 1024 * 1024;
const maxCoverBytes = 2 * 1024 * 1024;
const statusLabels: Record<PlatformCourseStatus, string> = {
  Draft: 'Rascunho',
  Published: 'Publicado',
};

export default function PlatformCoursesPage() {
  const navigate = useNavigate();
  const { courseId: selectedCourseId } = useParams();
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [library, setLibrary] = useState<PlatformLibraryVideo[]>([]);
  const [modules, setModules] = useState<GameModule[]>([]);
  const [tab, setTab] = useState<Tab>('courses');
  const setSelectedCourseId = (id: string | null) => navigate(id ? `/platform/courses/${id}/edit` : '/platform/courses');
  const [isCreating, setIsCreating] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isLibraryBusy, setIsLibraryBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [courseOption, setCourseOption] = useState<CourseOptionFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async (propagateError = false) => {
    setError('');
    setIsLoading(true);
    try {
      const [courseList, libraryList, moduleList] = await Promise.all([
        listPlatformCourses(),
        listPlatformLibraryVideos(),
        listGameModules(),
      ]);
      setModules(moduleList);
      setCourses(courseList);
      setLibrary(libraryList);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      if (propagateError) throw loadError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredCourses = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return courses.filter(
      (course) =>
        (statusFilter === 'all' || course.status === statusFilter) &&
        (courseOption === 'all' || getCourseOption(course.description) === courseOption) &&
        (!term ||
          course.title.toLocaleLowerCase('pt-BR').includes(term) ||
          (course.description ?? '').toLocaleLowerCase('pt-BR').includes(term)),
    );
  }, [courses, courseOption, search, statusFilter]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const LibraryContainer = isLibraryOpen ? CourseDialog : InlineCatalog;

  function report(message: string) {
    setNotice(message);
  }

  async function handleDuplicate(course: PlatformCourse) {
    setError('');
    setNotice('');
    try {
      const copy = await duplicatePlatformCourse(course.id);
      await refresh();
      setSelectedCourseId(copy.id);
      setTab('courses');
      setIsLibraryOpen(false);
      report(`O curso "${copy.title}" foi criado como rascunho, usando os mesmos vídeos.`);
    } catch (duplicateError) {
      setError(getErrorMessage(duplicateError));
    }
  }

  return (
    <div className="page-content course-workspace">
      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && !isLibraryOpen && !selectedCourse && (
        <div><p className="form-error page-error" role="alert">{error}</p>
          <button className="button button-secondary" disabled={isLoading} onClick={() => void refresh()} type="button">Tentar novamente</button>
        </div>
      )}

      {selectedCourseId && isLoading && !selectedCourse ? <LoadingState>Carregando curso...</LoadingState> : selectedCourseId && !selectedCourse ? (
        <div className="empty-state"><p>{error ? 'Não foi possível carregar o curso.' : 'Curso não encontrado.'}</p>
          <button className="button" onClick={() => setSelectedCourseId(null)} type="button">Voltar aos cursos</button>
        </div>
      ) : selectedCourse ? (
        <CourseDetail
          course={selectedCourse}
          error={error}
          key={selectedCourse.id}
          library={library}
          modules={modules}
          onBack={() => { setSelectedCourseId(null); setError(''); setNotice(''); }}
          onChanged={async (message) => { await refresh(true); report(message); }}
          onDuplicate={() => handleDuplicate(selectedCourse)}
          onError={setError}
        />
      ) : (
        <>
          <div className="course-content-heading">
            <div>
              <div className="course-page-title">
                <h1>Cursos</h1>
                {import.meta.env.DEV && <span className="demo-presentation-badge">Apresentação demo</span>}
              </div>
              <p className="muted-copy">
                {courses.length.toLocaleString('pt-BR')} {courses.length === 1 ? 'curso' : 'cursos'} no catálogo da plataforma
              </p>
            </div>
            <div className="course-heading-actions">
              <button className="button button-secondary" onClick={() => setIsLibraryOpen(true)} type="button">
                Pesquisar biblioteca
              </button>
              <button className="button course-primary" onClick={() => setIsCreating(true)} type="button">
                + Criar curso
              </button>
            </div>
          </div>
          {isLoading ? <LoadingState className="list-state">Carregando catálogo...</LoadingState> : !error && courses.length === 0 && (
          <section aria-label="Como deseja começar?" className="course-start-options">
            <button
              className="course-start-option"
              onClick={() => { setTab('courses'); setIsLibraryOpen(true); }}
              type="button"
            >
              <CourseStartIcon kind="folder" />
              <strong>Tenho um <span>treinamento já existente</span></strong>
              <p>Abra um curso do catálogo ou reutilize os vídeos da sua biblioteca.</p>
              <span aria-hidden="true" className="course-start-arrow">→</span>
            </button>
            <button className="course-start-option course-start-option-new" onClick={() => setIsCreating(true)} type="button">
              <CourseStartIcon kind="pencil" />
              <strong>Quero <span>criar um treinamento</span></strong>
              <p>Comece um curso com uma capa, um título e uma breve descrição.</p>
              <span aria-hidden="true" className="course-start-arrow">→</span>
            </button>
          </section>
          )}
        </>
      )}

      {!selectedCourseId && (isLibraryOpen || courses.length > 0) && (
        <LibraryContainer busy={isLibraryBusy} title="Biblioteca de conteúdo" onClose={() => { setIsLibraryOpen(false); setTab('courses'); }} wide>
          {isLibraryOpen && <div aria-label="Seções de conteúdo" className="platform-tabs" role="tablist">
            {(['courses', 'library', 'modules'] as const).map((item) => (
              <button
                aria-selected={tab === item}
                className={`platform-tab${tab === item ? ' is-active' : ''}`}
                key={item}
                onClick={() => setTab(item)}
                role="tab"
                type="button"
              >
                {item === 'courses' ? `Cursos (${courses.length})`
                  : item === 'library' ? `Biblioteca de vídeos (${library.length})`
                    : `Jogos e perguntas (${modules.length})`}
              </button>
            ))}
          </div>}
          {error && (
            <div className="course-library-error">
              <p className="form-error" role="alert">{error}</p>
              <button className="button button-secondary" disabled={isLoading} onClick={() => void refresh()} type="button">Tentar novamente</button>
            </div>
          )}
          {isLoading ? (
            <LoadingState className="list-state">Carregando catálogo...</LoadingState>
          ) : tab === 'modules' ? (
            <GameModulesPanel
              modules={modules}
              onChanged={async (message) => {
                await refresh();
                report(message);
              }}
              onError={setError}
            />
          ) : tab === 'library' ? (
            <LibrarySection
              library={library}
              onBusyChange={setIsLibraryBusy}
              onUploaded={async (video) => {
                await refresh();
                report(`O vídeo "${video.title}" foi enviado ao catálogo.`);
              }}
            />
          ) : (
            <section aria-labelledby="platform-courses-list-title" className="list-section">
              <div className="section-heading">
                <h2 id="platform-courses-list-title">Cursos cadastrados</h2>
                <span className="count-label">
                  {filteredCourses.length} {filteredCourses.length === 1 ? 'curso' : 'cursos'}
                </span>
              </div>
              <div className="platform-course-filter-row">
                <div className="field">
                  <label htmlFor="platform-course-search">Buscar curso</label>
                  <input
                    id="platform-course-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Nome ou descrição do curso"
                    type="search"
                    value={search}
                  />
                </div>
                <div className="field">
                  <label htmlFor="platform-course-status-filter">Status</label>
                  <select
                    id="platform-course-status-filter"
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    value={statusFilter}
                  >
                    <option value="all">Todos</option>
                    <option value="Draft">Rascunho</option>
                    <option value="Published">Publicado</option>
                  </select>
                </div>
                <div aria-label="Opções de grade" className="course-option-filters">
                  {(['all', '1', '2', '3'] as const).map((option) => (
                    <button
                      aria-pressed={courseOption === option}
                      className={courseOption === option ? 'is-selected' : ''}
                      key={option}
                      onClick={() => setCourseOption(option)}
                      type="button"
                    >
                      {option === 'all' ? 'Todas as opções' : `Opção ${option}`}
                    </button>
                  ))}
                </div>
              </div>
              {courses.length === 0 ? (
                <p className="compact-empty">Nenhum curso cadastrado. Feche a biblioteca e escolha “Criar curso”.</p>
              ) : filteredCourses.length === 0 ? (
                <div className="empty-state"><p>Nenhum curso corresponde aos filtros.</p></div>
              ) : (
                <div className="platform-course-grid">
                  {filteredCourses.map((course) => (
                    <CourseCard
                      course={course}
                      key={course.id}
                      onDuplicate={() => handleDuplicate(course)}
                      onOpen={() => {
                        setSelectedCourseId(course.id);
                        setIsLibraryOpen(false);
                        setError('');
                        setNotice('');
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </LibraryContainer>
      )}
      {isCreating && (
        <CreateCourseForm
          onClose={() => setIsCreating(false)}
          onCreated={async (course) => {
            setError('');
            setCourses((current) => [course, ...current.filter((item) => item.id !== course.id)]);
            setIsCreating(false);
            setSelectedCourseId(course.id);
            report(`O curso "${course.title}" foi criado no catálogo global.`);
          }}
        />
      )}
    </div>
  );
}

function InlineCatalog({ children }: { children: ReactNode; busy?: boolean; title: string; onClose: () => void; wide?: boolean }) {
  return <div className="course-inline-catalog">{children}</div>;
}

function CourseStartIcon({ kind }: { kind: 'folder' | 'pencil' }) {
  return (
    <svg aria-hidden="true" className="course-start-icon" fill="none" viewBox="0 0 64 64">
      {kind === 'folder' ? (
        <>
          <path d="M8 16a5 5 0 0 1 5-5h15l6 7h18a5 5 0 0 1 5 5v27H8Z" fill="#ddd9f4" />
          <path d="M17 23h29v22H17Z" fill="#fff" />
          <path d="M23 29h17M23 35h13" stroke="#bab1e5" strokeLinecap="round" strokeWidth="3" />
          <path d="m8 50 9-21h43l-9 21Z" fill="#9b8ed4" />
        </>
      ) : (
        <>
          <path d="m12 48 3-13L43 7a4 4 0 0 1 6 0l6 6a4 4 0 0 1 0 6L27 47Z" fill="#a69bdd" />
          <path d="m15 35 12 12-15 1Z" fill="#ead9c5" />
          <path d="m39 11 12 12" stroke="#6555af" strokeWidth="4" />
          <path d="M7 56c10-8 12 6 22-1s12 0 23-5" stroke="#c6bee9" strokeLinecap="round" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}

function CourseCard({
  course,
  onOpen,
  onDuplicate,
}: {
  course: PlatformCourse;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const totalMilliseconds = course.videos.reduce((sum, video) => sum + video.durationMilliseconds, 0);
  return (
    <article className="platform-course-card">
      <img alt="" className="platform-course-cover" decoding="async" loading="lazy" src={course.coverUrl ?? getCourseCover(course.title)} />
      <div className="platform-course-card-top">
        {getCourseOption(course.description) && (
          <span className="course-option-label">Opção {getCourseOption(course.description)}</span>
        )}
        <span className={`status-badge status-${course.status.toLowerCase()}`}>
          {statusLabels[course.status]}
        </span>
        {course.gamificationEnabled && <span className="status-badge status-active">Gamificação</span>}
      </div>
      <h3>{course.title}</h3>
      <p className="platform-course-card-meta">
        {course.videos.length} {course.videos.length === 1 ? 'vídeo' : 'vídeos'}
        {course.videos.length > 0 && ` · ${formatDuration(totalMilliseconds)}`}
      </p>
      <div className="platform-course-card-actions">
        <button
          aria-label={`Abrir curso ${course.title}`}
          className="button button-primary"
          onClick={onOpen}
          type="button"
        >
          Abrir
        </button>
        <button
          aria-label={`Duplicar curso ${course.title}`}
          className="button button-secondary"
          onClick={onDuplicate}
          type="button"
        >
          Duplicar
        </button>
      </div>
    </article>
  );
}

function CreateCourseForm({
  onCreated,
  onClose,
}: {
  onCreated: (course: PlatformCourse) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState(emptyCourse);
  const [isSaving, setIsSaving] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [option, setOption] = useState<'1' | '2' | '3'>('1');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [createdCourse, setCreatedCourse] = useState<PlatformCourse | null>(null);
  const [gamificationEnabled, setGamificationEnabled] = useState(false);

  useEffect(() => {
    if (!cover) { setPreview(''); return; }
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    let course = createdCourse;
    try {
      course ??= await createPlatformCourse({
        title: form.title.trim(),
        description: formatCourseOption(option, form.description.trim()),
        gamificationEnabled,
      });
      setCreatedCourse(course);
      const savedCourse = cover ? await setPlatformCourseCover(course.id, cover) : course;
      await onCreated(savedCourse);
    } catch (saveError) {
      setError(course
        ? `O curso foi criado, mas não foi possível salvar a capa. Tente novamente. ${getErrorMessage(saveError)}`
        : getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <CourseDialog busy={isSaving} onClose={onClose} title="Detalhes do curso">
      <form className="course-create-form" onSubmit={handleSubmit}>
        <label className="course-create-cover" htmlFor="create-course-cover">
          {preview ? <img alt="Prévia da capa do curso" src={preview} /> : (
            <span><span aria-hidden="true" className="course-upload-icon">↑</span>Adicionar capa</span>
          )}
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-label="Adicionar capa"
            disabled={isSaving}
            id="create-course-cover"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxCoverBytes) {
                setError('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
                event.target.value = '';
                return;
              }
              setError('');
              setCover(file);
            }}
            type="file"
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="platform-course-option">Opção da grade</label>
          <select
            disabled={isSaving || createdCourse !== null}
            id="platform-course-option"
            onChange={(event) => setOption(event.target.value as '1' | '2' | '3')}
            value={option}
          >
            <option value="1">Opção 1</option>
            <option value="2">Opção 2</option>
            <option value="3">Opção 3</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="platform-course-title">Título (obrigatório)</label>
          <input
            data-autofocus
            disabled={isSaving || createdCourse !== null}
            id="platform-course-title"
            maxLength={200}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Curso sem título"
            required
            value={form.title}
          />
        </div>
        <div className="field">
          <label htmlFor="platform-course-description">Descrição</label>
          <textarea
            disabled={isSaving || createdCourse !== null}
            id="platform-course-description"
            maxLength={2000}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Adicione uma breve descrição"
            rows={2}
            value={form.description}
          />
        </div>
        <label className="platform-toggle">
          <input checked={gamificationEnabled} disabled={isSaving || createdCourse !== null}
            onChange={(event) => setGamificationEnabled(event.target.checked)} type="checkbox" />
          <span>Gamificação após os vídeos</span>
        </label>
        <div className="course-dialog-actions">
          <button className="button button-secondary" disabled={isSaving} onClick={onClose} type="button">Cancelar</button>
          <button className="button course-primary" disabled={isSaving} type="submit">
            {isSaving ? 'Salvando...' : createdCourse ? 'Tentar salvar capa' : 'Criar'}
          </button>
        </div>
      </form>
    </CourseDialog>
  );
}

function CourseDetail({
  course,
  error,
  library,
  modules,
  onBack,
  onChanged,
  onDuplicate,
  onError,
}: {
  course: PlatformCourse;
  error: string;
  library: PlatformLibraryVideo[];
  modules: GameModule[];
  onBack: () => void;
  onChanged: (message: string) => Promise<void>;
  onDuplicate: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(getCourseDescription(course.description));
  const [status, setStatus] = useState<PlatformCourseStatus>(course.status);
  const [gamificationEnabled, setGamificationEnabled] = useState(course.gamificationEnabled);
  const [gameType, setGameType] = useState<GamificationGameType>(course.gameType);
  const [isSaving, setIsSaving] = useState(false);
  const [videoToLink, setVideoToLink] = useState('');
  const [activeDialog, setActiveDialog] = useState<'video' | 'games' | null>(null);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [step, setStep] = useState<CourseEditorStep>('edit');
  const [selectedVideoId, setSelectedVideoId] = useState(course.videos[0]?.id ?? '');
  const [previewSize, setPreviewSize] = useState<'phone' | 'desktop'>('phone');
  const [savedValues, setSavedValues] = useState(JSON.stringify({
    title: course.title, description: getCourseDescription(course.description),
    gamificationEnabled: course.gamificationEnabled, gameType: course.gameType,
  }));
  const dirty = savedValues !== JSON.stringify({ title, description, gamificationEnabled, gameType });
  const previewVideo = course.videos.find(video => video.id === selectedVideoId) ?? course.videos[0];
  const heading = useRef<HTMLHeadingElement>(null);
  const linkedIds = course.videos.map((video) => video.id);
  const availableVideos = library.filter((item) => !linkedIds.includes(item.video.id));
  useEffect(() => { heading.current?.focus(); }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCourse();
  }

  async function saveCourse(nextStatus: PlatformCourseStatus = status) {
    onError('');
    if (!title.trim()) {
      onError('Informe o nome do curso antes de salvar.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await updatePlatformCourse(course.id, {
        title: title.trim(),
        description: formatCourseOption(
          getCourseOption(course.description),
          description.trim(),
        ),
        status: nextStatus,
        gamificationEnabled,
        gameType,
      });
      setTitle(saved.title);
      setDescription(getCourseDescription(saved.description));
      setStatus(saved.status);
      setGamificationEnabled(saved.gamificationEnabled);
      setGameType(saved.gameType);
      setSavedValues(JSON.stringify({
        title: saved.title, description: getCourseDescription(saved.description),
        gamificationEnabled: saved.gamificationEnabled, gameType: saved.gameType,
      }));
      await onChanged('As alterações do curso foram salvas.');
    } catch (saveError) {
      onError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function changeVideos(videoIds: string[], message: string) {
    onError('');
    setIsMediaBusy(true);
    try {
      await setPlatformCourseVideos(course.id, videoIds);
      await onChanged(message);
      setActiveDialog(null);
    } catch (changeError) {
      onError(getErrorMessage(changeError));
    } finally {
      setIsMediaBusy(false);
    }
  }

  function move(index: number, offset: -1 | 1) {
    const ids = [...linkedIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    return changeVideos(ids, 'A ordem dos vídeos foi atualizada.');
  }

  return (
    <CourseEditorFrame step={step} onStep={setStep} dirty={dirty} busy={isSaving || isMediaBusy}
      onBack={onBack} onSave={() => void saveCourse()}>
    <div className="platform-course-detail-page">
      <div className="course-content-heading">
        <div>
          <h1 ref={heading} tabIndex={-1}>{course.title}</h1>
          <span className={`status-badge status-${status.toLowerCase()}`}>{statusLabels[status]}</span>
        </div>
        <div className="course-heading-actions">
          <button className="button button-quiet" disabled={isSaving || isMediaBusy} onClick={() => {
            if (!dirty || window.confirm('Há alterações não salvas. Deseja duplicar a versão salva?')) onDuplicate();
          }} type="button">Duplicar curso</button>
        </div>
      </div>
      {error && !activeDialog && <p className="form-error" role="alert">{error}</p>}
      {step === 'configure' && (
        <section className="course-editor-settings" aria-label="Configuração do curso">
          <h2>Visão geral</h2>
          <CourseCoverEditor course={course} onBusyChange={setIsMediaBusy} onChanged={onChanged} onError={onError} />
          <form className="event-form event-form-single" onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="edit-course-title">Nome do curso</label>
              <input
                disabled={isSaving || isMediaBusy}
                id="edit-course-title"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                required
                value={title}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-course-description">Descrição</label>
              <textarea
                disabled={isSaving || isMediaBusy}
                id="edit-course-description"
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </div>
            <label className="platform-toggle" htmlFor="edit-course-gamification">
              <input
                disabled={isSaving || isMediaBusy}
                checked={gamificationEnabled}
                id="edit-course-gamification"
                onChange={(event) => setGamificationEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Gamificação após os vídeos</strong>
                <small>Ative ou desative a experiência de jogo deste curso.</small>
              </span>
            </label>
            {gamificationEnabled && (
              <fieldset className="platform-game-types">
                <legend>Tipo de jogo</legend>
                {gameTypeOptions.map((option) => (
                  <label className="platform-game-option" key={option.value}>
                    <input
                      disabled={isSaving || isMediaBusy}
                      checked={gameType === option.value}
                      name="course-game-type"
                      onChange={() => setGameType(option.value)}
                      type="radio"
                      value={option.value}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                      {!option.playable && <em>Configurável agora · jogável em breve</em>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <button className="button button-primary" disabled={isSaving || isMediaBusy} type="submit">
              {isSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>
        </section>
      )}

      {step === 'edit' && <div className="course-editor-grid">
        <section aria-labelledby="course-videos-title" className="course-editor-outline">
          <div className="section-heading">
            <h2 id="course-videos-title">Vídeos do curso</h2>
            <button className="button course-primary" onClick={() => { onError(''); setActiveDialog('video'); }} type="button">+ Adicionar vídeo</button>
          </div>
          {course.videos.length === 0 ? (
            <div className="empty-state compact-empty">
              <p>Este curso ainda não tem vídeos. Vincule um da biblioteca ou envie um novo.</p>
            </div>
          ) : (
            <ol className="platform-video-order">
              {course.videos.map((video, index) => (
                <li key={video.id}>
                  <span>
                    <button className="course-outline-select" aria-pressed={previewVideo?.id === video.id}
                      onClick={() => setSelectedVideoId(video.id)} type="button">{video.title}</button>
                    <small>{formatDuration(video.durationMilliseconds)}</small>
                  </span>
                  <span className="platform-video-order-actions">
                    <button
                      aria-label={`Mover ${video.title} para cima`}
                      className="button button-quiet"
                      disabled={isMediaBusy || index === 0}
                      onClick={() => void move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Mover ${video.title} para baixo`}
                      className="button button-quiet"
                      disabled={isMediaBusy || index === course.videos.length - 1}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remover ${video.title} do curso`}
                      className="button button-danger-quiet"
                      disabled={isMediaBusy}
                      onClick={() =>
                        void changeVideos(
                          linkedIds.filter((id) => id !== video.id),
                          'O vídeo foi removido do curso; continua na biblioteca.',
                        )
                      }
                      type="button"
                    >
                      Remover
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-label="Prévia do curso" className={`course-editor-preview course-editor-preview-${previewSize}`}>
          <div className="course-preview-devices" aria-label="Tamanho da prévia">
            <button aria-pressed={previewSize === 'phone'} onClick={() => setPreviewSize('phone')} type="button">Celular</button>
            <button aria-pressed={previewSize === 'desktop'} onClick={() => setPreviewSize('desktop')} type="button">Desktop</button>
          </div>
          <div className="course-preview-screen">
            <p className="course-preview-brand">SIPAT Online</p>
            {previewVideo ? <>
              <h2>{previewVideo.title}</h2>
              <VideoPreview key={previewVideo.id} title={`Prévia de ${previewVideo.title}`} src={previewVideo.fileUrl} />
              <p>{course.videos.indexOf(previewVideo) + 1} / {course.videos.length}</p>
            </> : <p>Adicione um vídeo para visualizar o conteúdo.</p>}
          </div>
        </section>
        <aside aria-label="Propriedades do conteúdo" className="course-editor-properties">
          <p className="eyebrow">CONTEÚDO</p>
          <h2>{previewVideo?.title ?? 'Novo conteúdo'}</h2>
          <p className="muted-copy">{previewVideo ? formatDuration(previewVideo.durationMilliseconds) : 'Envie um vídeo ou escolha na biblioteca.'}</p>
          <hr />
          <h3>Interatividade</h3>
          <p className="muted-copy">Vincule jogos e configure perguntas nos momentos do vídeo.</p>
          <button className="button button-secondary" onClick={() => { onError(''); setActiveDialog('games'); }} type="button">Jogos e perguntas</button>
          <p className="field-hint">Gamificação {gamificationEnabled ? 'ativada' : 'desativada'}. Altere na etapa Configurar.</p>
        </aside>
      </div>}
      {step === 'publish' && <section className="course-editor-settings" aria-label="Revisar e publicar">
        <h2>Revisar e publicar</h2>
        <div className="form-card">
          <h3>Detalhes do curso</h3>
          <dl className="course-publish-summary">
            <dt>Título</dt><dd>{title}</dd>
            <dt>Descrição</dt><dd>{description || 'Sem descrição'}</dd>
            <dt>Vídeos</dt><dd>{course.videos.length}</dd>
            <dt>Gamificação após os vídeos</dt><dd>{gamificationEnabled ? 'Ativada' : 'Desativada'}</dd>
          </dl>
          <button className="button button-secondary" onClick={() => setStep('configure')} type="button">Revisar configurações</button>
        </div>
        <div className="form-card">
          <h3>Publicação no catálogo</h3>
          <p>Publique agora para disponibilizar o curso no catálogo de cursos. Os vínculos e o progresso das empresas existentes são preservados.</p>
          <ul aria-label="Checklist de publicação" className="course-publish-checklist">
            <li className={title.trim() ? 'is-ready' : ''}>Nome do curso</li>
            <li className={description.trim() ? 'is-ready' : ''}>Descrição</li>
            <li className={course.videos.length > 0 ? 'is-ready' : ''}>Vídeo</li>
            <li className={course.coverUrl ? 'is-ready' : 'is-optional'}>Foto do curso · opcional</li>
          </ul>
          {course.videos.length === 0 && <p className="form-error">Adicione ao menos um vídeo antes de publicar.</p>}
          <button className="button course-primary" disabled={isSaving || isMediaBusy || course.videos.length === 0 || !title.trim() || !description.trim()}
            onClick={() => void saveCourse('Published')} type="button">{status === 'Published' ? 'Publicar alterações' : 'Publicar agora'}</button>
          {status === 'Published' && <button className="button button-secondary" disabled={isSaving || isMediaBusy}
            onClick={() => {
              if (window.confirm('Voltar este curso para rascunho? Ele deixará de aparecer no catálogo.')) {
                void saveCourse('Draft');
              }
            }} type="button">Voltar a rascunho</button>}
        </div>
      </section>}
      {activeDialog === 'video' && (
        <CourseDialog busy={isMediaBusy} onClose={() => setActiveDialog(null)} title="Adicionar vídeo">
          {error && <p className="form-error" role="alert">{error}</p>}
          {availableVideos.length > 0 && (
            <div className="platform-link-video">
              <div className="field">
                <label htmlFor="link-library-video">Vincular da biblioteca</label>
                <select
                  id="link-library-video"
                  onChange={(event) => setVideoToLink(event.target.value)}
                  value={videoToLink}
                >
                  <option value="">Selecione um vídeo</option>
                  {availableVideos.map((item) => (
                    <option key={item.video.id} value={item.video.id}>{item.video.title}</option>
                  ))}
                </select>
              </div>
              <button
                className="button button-secondary"
                disabled={!videoToLink || isMediaBusy}
                onClick={() => {
                  const id = videoToLink;
                  setVideoToLink('');
                  void changeVideos([...linkedIds, id], 'O vídeo foi vinculado ao curso.');
                }}
                type="button"
              >
                Vincular vídeo
              </button>
            </div>
          )}
          <h3 className="platform-subheading">Enviar novo vídeo</h3>
          <VideoUploadForm
            courseId={course.id}
            onBusyChange={setIsMediaBusy}
            onError={onError}
            onUploaded={async (video) => {
              await onChanged(`O vídeo "${video.title}" foi enviado e vinculado ao curso.`);
              setActiveDialog(null);
            }}
          />
        </CourseDialog>
      )}
      {activeDialog === 'games' && (
        <CourseDialog onClose={() => setActiveDialog(null)} title="Jogos e perguntas" wide>
          {error && <p className="form-error" role="alert">{error}</p>}
          <CourseGamesSection course={course} modules={modules} onChanged={onChanged} onError={onError} />
        </CourseDialog>
      )}
    </div>
    </CourseEditorFrame>
  );
}

function LibrarySection({
  library,
  onBusyChange,
  onUploaded,
}: {
  library: PlatformLibraryVideo[];
  onBusyChange: (busy: boolean) => void;
  onUploaded: (video: PlatformCourseVideo) => Promise<void>;
}) {
  const [uploadError, setUploadError] = useState('');
  return (
    <div className="management-grid">
      <section aria-labelledby="upload-platform-video-title" className="form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BIBLIOTECA</p>
            <h2 id="upload-platform-video-title">Enviar vídeo</h2>
          </div>
        </div>
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
        <VideoUploadForm onBusyChange={onBusyChange} onError={setUploadError} onUploaded={onUploaded} />
      </section>
      <section aria-labelledby="platform-library-title" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">VÍDEOS REUTILIZÁVEIS</p>
            <h2 id="platform-library-title">Vídeos cadastrados</h2>
          </div>
        </div>
        {library.length === 0 ? (
          <div className="empty-state"><p>A biblioteca ainda não tem vídeos.</p></div>
        ) : (
          <div className="platform-video-list">
            {library.map((item) => (
              <VideoCard courseCount={item.courseCount} key={item.video.id} video={item.video} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CourseCoverEditor({
  course,
  onBusyChange,
  onChanged,
  onError,
}: {
  course: PlatformCourse;
  onBusyChange: (busy: boolean) => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    onError('');
    setIsBusy(true);
    onBusyChange(true);
    try {
      await action();
      await onChanged(message);
    } catch (coverError) {
      onError(getErrorMessage(coverError));
    } finally {
      setIsBusy(false);
      onBusyChange(false);
    }
  }

  function handlePick(file: File | null) {
    if (!file) return;
    if (file.size > maxCoverBytes) {
      onError('A foto excede o limite de 2 MB.');
      return;
    }
    void run(() => setPlatformCourseCover(course.id, file), 'A foto do curso foi atualizada.');
  }

  return (
    <div className="platform-cover-editor">
      <h3 className="platform-subheading">Foto do curso</h3>
      {course.coverUrl ? (
        <img alt="Foto atual do curso" className="platform-cover-preview" src={course.coverUrl} />
      ) : (
        <p className="compact-empty">Este curso ainda não tem foto.</p>
      )}
      <div className="platform-course-card-actions">
        <FilePicker
          accept="image/png,image/jpeg,image/webp"
          buttonLabel={course.coverUrl ? 'Trocar foto' : 'Escolher foto'}
          disabled={isBusy}
          id="platform-course-cover-file"
          onChange={handlePick}
        />
        {course.coverUrl && (
          <button
            className="button button-quiet"
            disabled={isBusy}
            onClick={() => void run(() => removePlatformCourseCover(course.id), 'A foto do curso foi removida.')}
            type="button"
          >
            Remover foto
          </button>
        )}
      </div>
      <span className="field-hint">PNG, JPEG ou WebP; até 2 MB. Formato 16:9 recomendado.</span>
    </div>
  );
}

function VideoUploadForm({
  courseId,
  onBusyChange,
  onError,
  onUploaded,
}: {
  courseId?: string;
  onBusyChange?: (busy: boolean) => void;
  onError: (message: string) => void;
  onUploaded: (video: PlatformCourseVideo) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) {
      return;
    }

    onError('');
    setIsUploading(true);
    onBusyChange?.(true);
    try {
      const video = await uploadPlatformVideo(
        title.trim(),
        Math.round(Number(duration) * 1000),
        file,
        courseId,
      );
      setTitle('');
      setDuration('');
      setFile(null);
      form.reset();
      await onUploaded(video);
    } catch (uploadError) {
      onError(getErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form className="event-form event-form-single" onSubmit={handleUpload}>
      <div className="field">
        <label htmlFor={`platform-video-title-${courseId ?? 'library'}`}>Título do vídeo</label>
        <input
          id={`platform-video-title-${courseId ?? 'library'}`}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </div>
      <div className="field">
        <label htmlFor={`platform-video-duration-${courseId ?? 'library'}`}>Duração (segundos)</label>
        <input
          id={`platform-video-duration-${courseId ?? 'library'}`}
          max={86400}
          min={0.001}
          onChange={(event) => setDuration(event.target.value)}
          required
          step="any"
          type="number"
          value={duration}
        />
      </div>
      <div className="field">
        <label htmlFor={`platform-video-file-${courseId ?? 'library'}`}>Arquivo de vídeo</label>
        <FilePicker
          accept="video/mp4,video/webm,.mp4,.webm"
          buttonLabel="Escolher vídeo"
          file={file}
          id={`platform-video-file-${courseId ?? 'library'}`}
          onChange={setFile}
          required
        />
        <span className="field-hint">MP4 ou WebM; tamanho máximo 250 MB.</span>
      </div>
      <button
        className="button button-primary"
        disabled={isUploading || !file || file.size > maxVideoBytes}
        type="submit"
      >
        {isUploading ? 'Enviando vídeo...' : 'Enviar vídeo'}
      </button>
      {file && file.size > maxVideoBytes && (
        <p className="form-error" role="alert">O arquivo excede o limite de 250 MB.</p>
      )}
    </form>
  );
}

function VideoCard({ video, courseCount }: { video: PlatformCourseVideo; courseCount: number }) {
  return (
    <article className="platform-video-card">
      <div>
        <h4>{video.title}</h4>
        <p className="muted-copy">
          {formatDuration(video.durationMilliseconds)} · {formatBytes(video.sizeBytes)} · usado em{' '}
          {courseCount} {courseCount === 1 ? 'curso' : 'cursos'}
        </p>
      </div>
      <VideoPreview key={video.id} title={`Prévia de ${video.title}`} preload="none" src={video.fileUrl} />
    </article>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}

function getCourseOption(description: string | null): '1' | '2' | '3' | null {
  const match = description?.match(/^Opção ([1-3])(?: ·[^\r\n]*)?(?:\r?\n|$)/u);
  return match?.[1] as '1' | '2' | '3' | undefined ?? null;
}

function getCourseDescription(description: string | null): string {
  return description?.replace(/^Opção [1-3](?: ·[^\r\n]*)?(?:\r?\n|$)/u, '').trim() ?? '';
}

function formatCourseOption(
  option: '1' | '2' | '3' | null,
  description: string,
): string | null {
  if (!option) return description || null;
  return [`Opção ${option}`, description].filter(Boolean).join('\n');
}
import LoadingState from './LoadingState';
