import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createPlatformCourse,
  duplicatePlatformCourse,
  listGameModules,
  listPlatformCourses,
  listPlatformLibraryVideos,
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
import GameModulesPanel from './GameModulesPanel';
import './PlatformCourses.css';
import { gameTypeOptions } from './gamificationGames';

type Tab = 'courses' | 'library' | 'modules';
type StatusFilter = 'all' | PlatformCourseStatus;

const emptyCourse = { title: '', description: '', gamificationEnabled: false };
const maxVideoBytes = 250 * 1024 * 1024;
const statusLabels: Record<PlatformCourseStatus, string> = {
  Draft: 'Rascunho',
  Published: 'Publicado',
};

export default function PlatformCoursesPage() {
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [library, setLibrary] = useState<PlatformLibraryVideo[]>([]);
  const [modules, setModules] = useState<GameModule[]>([]);
  const [tab, setTab] = useState<Tab>('courses');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setError('');
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
        (!term ||
          course.title.toLocaleLowerCase('pt-BR').includes(term) ||
          (course.description ?? '').toLocaleLowerCase('pt-BR').includes(term)),
    );
  }, [courses, search, statusFilter]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;

  function report(message: string) {
    setError('');
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
      report(`O curso "${copy.title}" foi criado como rascunho, usando os mesmos vídeos.`);
    } catch (duplicateError) {
      setError(getErrorMessage(duplicateError));
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTEÚDO GLOBAL</p>
          <h1>Cursos da plataforma</h1>
          <p className="muted-copy">
            Crie cursos reutilizáveis, organize os vídeos da biblioteca e defina se haverá gamificação.
          </p>
        </div>
        {tab === 'courses' && !selectedCourse && (
          <button
            className="button button-primary"
            onClick={() => setIsCreating((current) => !current)}
            type="button"
          >
            {isCreating ? 'Fechar' : 'Novo curso'}
          </button>
        )}
      </div>

      <div aria-label="Seções de conteúdo" className="platform-tabs" role="tablist">
        {(['courses', 'library', 'modules'] as const).map((item) => (
          <button
            aria-selected={tab === item}
            className={`platform-tab${tab === item ? ' is-active' : ''}`}
            key={item}
            onClick={() => {
              setTab(item);
              setSelectedCourseId(null);
            }}
            role="tab"
            type="button"
          >
            {item === 'courses'
              ? `Cursos (${courses.length})`
              : item === 'library'
                ? `Biblioteca de vídeos (${library.length})`
                : `Jogos e perguntas (${modules.length})`}
          </button>
        ))}
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      {isLoading ? (
        <p className="list-state" aria-live="polite">Carregando catálogo...</p>
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
          onUploaded={async (video) => {
            await refresh();
            report(`O vídeo "${video.title}" foi enviado ao catálogo.`);
          }}
        />
      ) : selectedCourse ? (
        <CourseDetail
          course={selectedCourse}
          key={selectedCourse.id}
          library={library}
          modules={modules}
          onBack={() => setSelectedCourseId(null)}
          onChanged={async (message) => {
            await refresh();
            report(message);
          }}
          onDuplicate={() => handleDuplicate(selectedCourse)}
          onError={setError}
        />
      ) : (
        <>
          {isCreating && (
            <CreateCourseForm
              onCreated={async (course) => {
                await refresh();
                setIsCreating(false);
                setSelectedCourseId(course.id);
                report(`O curso "${course.title}" foi criado no catálogo global.`);
              }}
              onError={setError}
            />
          )}
          <section aria-labelledby="platform-courses-list-title" className="list-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CATÁLOGO</p>
                <h2 id="platform-courses-list-title">Cursos cadastrados</h2>
              </div>
              <span className="count-label">
                {filteredCourses.length} {filteredCourses.length === 1 ? 'curso' : 'cursos'}
              </span>
            </div>
            <div className="platform-filter-bar">
              <div className="field">
                <label htmlFor="platform-course-search">Buscar curso</label>
                <input
                  id="platform-course-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome do curso ou da empresa"
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
            </div>
            {courses.length === 0 ? (
              <div className="empty-state"><p>O catálogo ainda não tem cursos. Use “Novo curso” para começar.</p></div>
            ) : filteredCourses.length === 0 ? (
              <div className="empty-state"><p>Nenhum curso corresponde aos filtros.</p></div>
            ) : (
              <div className="platform-course-grid">
                {filteredCourses.map((course) => (
                  <CourseCard
                    course={course}
                    key={course.id}
                    onDuplicate={() => handleDuplicate(course)}
                    onOpen={() => setSelectedCourseId(course.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
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
      <div className="platform-course-card-top">
        <span className={`status-badge status-${course.status.toLowerCase()}`}>
          {statusLabels[course.status]}
        </span>
        {course.gamificationEnabled && <span className="status-badge status-active">Gamificação</span>}
      </div>
      <h3>{course.title}</h3>
      <p className="muted-copy">{course.description ?? 'Sem descrição.'}</p>
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
  onError,
}: {
  onCreated: (course: PlatformCourse) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState(emptyCourse);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    setIsSaving(true);
    try {
      const course = await createPlatformCourse({
        title: form.title.trim(),
        description: form.description.trim() || null,
        gamificationEnabled: form.gamificationEnabled,
      });
      setForm(emptyCourse);
      await onCreated(course);
    } catch (saveError) {
      onError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="create-platform-course-title" className="form-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">NOVO CURSO</p>
          <h2 id="create-platform-course-title">Adicionar ao catálogo</h2>
        </div>
      </div>
      <form className="event-form event-form-single" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="platform-course-title">Nome do curso</label>
          <input
            id="platform-course-title"
            maxLength={200}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            required
            value={form.title}
          />
        </div>
        <div className="field">
          <label htmlFor="platform-course-description">
            Descrição <span className="field-optional">(opcional)</span>
          </label>
          <textarea
            id="platform-course-description"
            maxLength={2000}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            rows={3}
            value={form.description}
          />
        </div>
        <label className="platform-toggle" htmlFor="platform-course-gamification">
          <input
            checked={form.gamificationEnabled}
            id="platform-course-gamification"
            onChange={(event) =>
              setForm((current) => ({ ...current, gamificationEnabled: event.target.checked }))
            }
            type="checkbox"
          />
          <span>
            <strong>Ativar gamificação</strong>
            <small>Os participantes jogam depois de assistir aos vídeos.</small>
          </span>
        </label>
        <button className="button button-primary" disabled={isSaving} type="submit">
          {isSaving ? 'Criando...' : 'Criar curso'}
        </button>
      </form>
    </section>
  );
}

function CourseDetail({
  course,
  library,
  modules,
  onBack,
  onChanged,
  onDuplicate,
  onError,
}: {
  course: PlatformCourse;
  library: PlatformLibraryVideo[];
  modules: GameModule[];
  onBack: () => void;
  onChanged: (message: string) => Promise<void>;
  onDuplicate: () => void;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? '');
  const [status, setStatus] = useState<PlatformCourseStatus>(course.status);
  const [gamificationEnabled, setGamificationEnabled] = useState(course.gamificationEnabled);
  const [gameType, setGameType] = useState<GamificationGameType>(course.gameType);
  const [isSaving, setIsSaving] = useState(false);
  const [videoToLink, setVideoToLink] = useState('');
  const linkedIds = course.videos.map((video) => video.id);
  const availableVideos = library.filter((item) => !linkedIds.includes(item.video.id));

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    setIsSaving(true);
    try {
      await updatePlatformCourse(course.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        gamificationEnabled,
        gameType,
      });
      await onChanged('As alterações do curso foram salvas.');
    } catch (saveError) {
      onError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function changeVideos(videoIds: string[], message: string) {
    onError('');
    try {
      await setPlatformCourseVideos(course.id, videoIds);
      await onChanged(message);
    } catch (changeError) {
      onError(getErrorMessage(changeError));
    }
  }

  function move(index: number, offset: -1 | 1) {
    const ids = [...linkedIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    return changeVideos(ids, 'A ordem dos vídeos foi atualizada.');
  }

  return (
    <div className="platform-course-detail-page">
      <button className="button button-quiet" onClick={onBack} type="button">
        ← Voltar aos cursos
      </button>
      <div className="management-grid">
        <section aria-labelledby="edit-platform-course-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DETALHES DO CURSO</p>
              <h2 id="edit-platform-course-title">{course.title}</h2>
            </div>
            <button className="button button-secondary" onClick={onDuplicate} type="button">
              Duplicar curso
            </button>
          </div>
          <form className="event-form event-form-single" onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="edit-course-title">Nome do curso</label>
              <input
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
                id="edit-course-description"
                maxLength={2000}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                value={description}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-course-status">Status</label>
              <select
                id="edit-course-status"
                onChange={(event) => setStatus(event.target.value as PlatformCourseStatus)}
                value={status}
              >
                <option value="Draft">Rascunho</option>
                <option value="Published">Publicado</option>
              </select>
              <span className="field-hint">Para publicar, vincule ao menos um vídeo.</span>
            </div>
            <label className="platform-toggle" htmlFor="edit-course-gamification">
              <input
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
            <button className="button button-primary" disabled={isSaving} type="submit">
              {isSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>
        </section>

        <section aria-labelledby="course-videos-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONTEÚDO DO CURSO</p>
              <h2 id="course-videos-title">Vídeos do curso</h2>
            </div>
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
                    <strong>{video.title}</strong>
                    <small>{formatDuration(video.durationMilliseconds)}</small>
                  </span>
                  <span className="platform-video-order-actions">
                    <button
                      aria-label={`Mover ${video.title} para cima`}
                      className="button button-quiet"
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Mover ${video.title} para baixo`}
                      className="button button-quiet"
                      disabled={index === course.videos.length - 1}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remover ${video.title} do curso`}
                      className="button button-danger-quiet"
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
                disabled={!videoToLink}
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
            onError={onError}
            onUploaded={(video) => onChanged(`O vídeo "${video.title}" foi enviado e vinculado ao curso.`)}
          />
        </section>
      </div>
      <CourseGamesSection course={course} modules={modules} onChanged={onChanged} onError={onError} />
    </div>
  );
}

function LibrarySection({
  library,
  onUploaded,
}: {
  library: PlatformLibraryVideo[];
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
        <VideoUploadForm onError={setUploadError} onUploaded={onUploaded} />
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

function VideoUploadForm({
  courseId,
  onError,
  onUploaded,
}: {
  courseId?: string;
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
        <input
          accept="video/mp4,video/webm,.mp4,.webm"
          id={`platform-video-file-${courseId ?? 'library'}`}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
          type="file"
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
      <video controls preload="metadata" src={video.fileUrl}>
        Seu navegador não oferece suporte à reprodução de vídeo.
      </video>
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
