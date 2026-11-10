import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createPlatformCourse,
  listPlatformCourses,
  uploadPlatformCourseVideo,
  type PlatformCourse,
  type PlatformCourseVideo,
} from './api';

const emptyCourse = { title: '', description: '' };
const maxVideoBytes = 250 * 1024 * 1024;

export default function PlatformCoursesPage() {
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDuration, setVideoDuration] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCourses = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const result = await listPlatformCourses();
      setCourses(result);
      setSelectedCourseId((current) =>
        result.some((course) => course.id === current) ? current : result[0]?.id ?? '',
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSavingCourse(true);
    try {
      const course = await createPlatformCourse({
        title: courseForm.title.trim(),
        description: courseForm.description.trim() || null,
      });
      setCourseForm(emptyCourse);
      setSelectedCourseId(course.id);
      setNotice(`O curso "${course.title}" foi criado no catálogo global.`);
      await loadCourses();
      setSelectedCourseId(course.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingCourse(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId || !videoFile) {
      return;
    }

    setError('');
    setNotice('');
    setIsUploading(true);
    try {
      const video = await uploadPlatformCourseVideo(
        selectedCourseId,
        videoTitle.trim(),
        Math.round(Number(videoDuration) * 1000),
        videoFile,
      );
      setVideoTitle('');
      setVideoDuration('');
      setVideoFile(null);
      event.currentTarget.reset();
      setNotice(`O vídeo "${video.title}" foi enviado ao catálogo.`);
      await loadCourses();
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
    }
  }

  const selectedCourse = courses.find((course) => course.id === selectedCourseId);

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTEÚDO GLOBAL</p>
          <h1>Cursos da plataforma</h1>
          <p className="muted-copy">
            Cadastre cursos reutilizáveis e envie vídeos para o catálogo do SIPAT Online.
          </p>
        </div>
        <span className="count-label">{courses.length} {courses.length === 1 ? 'curso' : 'cursos'}</span>
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <div className="management-grid">
        <section aria-labelledby="create-platform-course-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NOVO CURSO</p>
              <h2 id="create-platform-course-title">Adicionar ao catálogo</h2>
            </div>
          </div>
          <form className="event-form event-form-single" onSubmit={handleCreateCourse}>
            <div className="field">
              <label htmlFor="platform-course-title">Nome do curso</label>
              <input
                id="platform-course-title"
                maxLength={200}
                onChange={(event) => setCourseForm((current) => ({ ...current, title: event.target.value }))}
                required
                value={courseForm.title}
              />
            </div>
            <div className="field">
              <label htmlFor="platform-course-description">Descrição <span>(opcional)</span></label>
              <textarea
                id="platform-course-description"
                maxLength={2000}
                onChange={(event) => setCourseForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))}
                rows={4}
                value={courseForm.description}
              />
            </div>
            <button className="button button-primary" disabled={isSavingCourse} type="submit">
              {isSavingCourse ? 'Criando...' : 'Criar curso'}
            </button>
          </form>
        </section>

        <section aria-labelledby="upload-platform-video-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONTEÚDO DO CURSO</p>
              <h2 id="upload-platform-video-title">Enviar vídeo</h2>
            </div>
          </div>
          {isLoading ? (
            <p className="list-state" aria-live="polite">Carregando cursos...</p>
          ) : courses.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>Crie um curso primeiro</h3>
              <p>Depois, você poderá enviar os vídeos que fazem parte dele.</p>
            </div>
          ) : (
            <form className="event-form event-form-single" onSubmit={handleUpload}>
              <div className="field">
                <label htmlFor="platform-video-course">Curso</label>
                <select
                  id="platform-video-course"
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  value={selectedCourseId}
                >
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="platform-video-title">Título do vídeo</label>
                <input
                  id="platform-video-title"
                  maxLength={200}
                  onChange={(event) => setVideoTitle(event.target.value)}
                  required
                  value={videoTitle}
                />
              </div>
              <div className="field">
                <label htmlFor="platform-video-duration">Duração (segundos)</label>
                <input
                  id="platform-video-duration"
                  max={86400}
                  min={0.001}
                  onChange={(event) => setVideoDuration(event.target.value)}
                  required
                  step="any"
                  type="number"
                  value={videoDuration}
                />
              </div>
              <div className="field">
                <label htmlFor="platform-video-file">Arquivo de vídeo</label>
                <input
                  accept="video/mp4,video/webm,.mp4,.webm"
                  id="platform-video-file"
                  onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                  required
                  type="file"
                />
                <span className="field-hint">MP4 ou WebM; tamanho máximo 250 MB.</span>
              </div>
              <button
                className="button button-primary"
                disabled={isUploading || !videoFile || videoFile.size > maxVideoBytes}
                type="submit"
              >
                {isUploading ? 'Enviando vídeo...' : 'Enviar vídeo'}
              </button>
              {videoFile && videoFile.size > maxVideoBytes && (
                <p className="form-error" role="alert">O arquivo excede o limite de 250 MB.</p>
              )}
            </form>
          )}
        </section>
      </div>

      <section aria-labelledby="platform-courses-list-title" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CATÁLOGO</p>
            <h2 id="platform-courses-list-title">Cursos cadastrados</h2>
          </div>
        </div>
        {isLoading ? (
          <p className="list-state" aria-live="polite">Carregando catálogo...</p>
        ) : courses.length === 0 ? (
          <div className="empty-state"><p>O catálogo ainda não tem cursos.</p></div>
        ) : (
          <div className="platform-course-layout">
            <nav aria-label="Cursos do catálogo" className="platform-course-list">
              {courses.map((course) => (
                <button
                  aria-current={course.id === selectedCourseId ? 'true' : undefined}
                  className={`platform-course-option${course.id === selectedCourseId ? ' is-selected' : ''}`}
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  type="button"
                >
                  <strong>{course.title}</strong>
                  <span>{course.videos.length} {course.videos.length === 1 ? 'vídeo' : 'vídeos'}</span>
                </button>
              ))}
            </nav>
            {selectedCourse && (
              <div className="platform-course-detail">
                <h3>{selectedCourse.title}</h3>
                {selectedCourse.description && <p className="muted-copy">{selectedCourse.description}</p>}
                {selectedCourse.videos.length === 0 ? (
                  <div className="empty-state compact-empty"><p>Este curso ainda não tem vídeos.</p></div>
                ) : (
                  <div className="platform-video-list">
                    {selectedCourse.videos.map((video) => (
                      <VideoCard key={video.id} video={video} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      <p className="platform-data-note">
        O catálogo global é compartilhado, mas ainda não existe vínculo entre contratos, pacotes
        vendidos e trilhas atribuídas às empresas.
      </p>
    </div>
  );
}

function VideoCard({ video }: { video: PlatformCourseVideo }) {
  return (
    <article className="platform-video-card">
      <div>
        <h4>{video.title}</h4>
        <p className="muted-copy">
          {formatDuration(video.durationMilliseconds)} · {formatBytes(video.sizeBytes)}
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
