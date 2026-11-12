import { useState } from 'react';
import {
  deleteGameModule,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseVideo,
  type PlatformLibraryVideo,
} from '../api';
import CourseDialog from '../CourseDialog';
import LoadingState from '../LoadingState';
import { VideoUploadForm } from '../courseEditor/CourseMediaForms';
import { getErrorMessage, pluralize } from '../courseEditor/courseFormat';
import CourseStartOptions from './CourseStartOptions';
import CoursesPanel from './CoursesPanel';
import CreateCourseDialog from './CreateCourseDialog';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';
import VideoLibraryPanel from './VideoLibraryPanel';
import './CourseCatalog.css';

type CatalogTab = 'courses' | 'videos' | 'modules';
type CatalogDialog =
  | { kind: 'create' }
  | { kind: 'upload' }
  | { kind: 'game'; module: GameModule | null };

export default function CourseCatalog({
  courses,
  library,
  modules,
  isLoading,
  error,
  busy,
  onRetry,
  onOpen,
  onDuplicate,
  onCreated,
  onVideoUploaded,
  onModulesChanged,
  onError,
}: {
  courses: PlatformCourse[];
  library: PlatformLibraryVideo[];
  modules: GameModule[];
  isLoading: boolean;
  error: string;
  busy: boolean;
  onRetry: () => void;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onCreated: (course: PlatformCourse) => Promise<void>;
  onVideoUploaded: (video: PlatformCourseVideo) => Promise<void>;
  onModulesChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [tab, setTab] = useState<CatalogTab>('courses');
  const [dialog, setDialog] = useState<CatalogDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isEmptyCatalog = !isLoading && !error && courses.length === 0;
  const showTabs = !isEmptyCatalog || tab !== 'courses';
  const tabs: { id: CatalogTab; label: string; count: number }[] = [
    { id: 'courses', label: 'Cursos', count: courses.length },
    { id: 'videos', label: 'Vídeos', count: library.length },
    { id: 'modules', label: 'Jogos e perguntas', count: modules.length },
  ];

  function openUpload() {
    setUploadError('');
    setDialog({ kind: 'upload' });
  }

  async function removeGame(module: GameModule) {
    const usage = module.usageCount > 0
      ? ` Ele está em ${pluralize(module.usageCount, 'curso', 'cursos')} e sairá da trilha desses cursos.`
      : '';
    if (!window.confirm(`Remover o jogo "${module.title}"?${usage}`)) return;
    onError('');
    setIsDeleting(true);
    try {
      await deleteGameModule(module.id);
      await onModulesChanged(`O jogo "${module.title}" foi removido.`);
    } catch (deleteError) {
      onError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="cat-page">
      <header className="cat-header">
        <div className="cat-header-text">
          <div className="cat-title-row">
            <h1>Cursos</h1>
            {import.meta.env.DEV && <span className="demo-presentation-badge">Apresentação demo</span>}
          </div>
          <p>{pluralize(courses.length, 'curso', 'cursos')} no catálogo da plataforma</p>
        </div>
        <div className="cat-header-actions">
          {tab === 'courses' && (
            <button className="cat-btn cat-btn-primary" onClick={() => setDialog({ kind: 'create' })} type="button">+ Criar curso</button>
          )}
          {tab === 'videos' && (
            <button className="cat-btn cat-btn-primary" onClick={openUpload} type="button">+ Enviar vídeo</button>
          )}
          {tab === 'modules' && (
            <button className="cat-btn cat-btn-primary" onClick={() => setDialog({ kind: 'game', module: null })} type="button">
              + Novo jogo
            </button>
          )}
        </div>
      </header>

      {showTabs && (
        <div aria-label="Seções do catálogo" className="cat-tabs" role="tablist">
          {tabs.map((item) => (
            <button
              aria-controls={`cat-panel-${item.id}`}
              aria-selected={tab === item.id}
              className="cat-tab"
              id={`cat-tab-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              role="tab"
              type="button"
            >
              {item.label} <span className="cat-tab-count">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="cat-error">
          <p className="form-error" role="alert">{error}</p>
          <button className="cat-btn" disabled={isLoading} onClick={onRetry} type="button">Tentar novamente</button>
        </div>
      )}

      <div aria-labelledby={showTabs ? `cat-tab-${tab}` : undefined} className="cat-tabpanel" id={`cat-panel-${tab}`}
        role={showTabs ? 'tabpanel' : undefined}>
        {isLoading ? (
          <LoadingState className="list-state">Carregando catálogo...</LoadingState>
        ) : tab === 'courses' ? (
          isEmptyCatalog ? (
            <CourseStartOptions onCreate={() => setDialog({ kind: 'create' })} onReuse={() => setTab('videos')} />
          ) : courses.length > 0 && (
            <CoursesPanel busy={busy} courses={courses} onDuplicate={onDuplicate} onOpen={onOpen} />
          )
        ) : tab === 'videos' ? (
          <VideoLibraryPanel library={library} onUpload={openUpload} />
        ) : (
          <GameModulesPanel
            busy={isDeleting}
            modules={modules}
            onCreate={() => setDialog({ kind: 'game', module: null })}
            onDelete={(module) => void removeGame(module)}
            onEdit={(module) => setDialog({ kind: 'game', module })}
          />
        )}
      </div>

      {dialog?.kind === 'create' && (
        <CreateCourseDialog onClose={() => setDialog(null)} onCreated={async (course) => {
          setDialog(null);
          await onCreated(course);
        }} />
      )}

      {dialog?.kind === 'upload' && (
        <CourseDialog busy={dialogBusy} onClose={() => setDialog(null)} title="Enviar vídeo">
          {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
          <VideoUploadForm onBusyChange={setDialogBusy} onError={setUploadError} onUploaded={async (video) => {
            setDialog(null);
            await onVideoUploaded(video);
          }} />
        </CourseDialog>
      )}

      {dialog?.kind === 'game' && (
        <CourseDialog busy={dialogBusy} onClose={() => setDialog(null)} title={dialog.module ? 'Editar jogo' : 'Novo jogo'} wide>
          <GameModuleForm
            module={dialog.module}
            onBusyChange={setDialogBusy}
            onCancel={() => setDialog(null)}
            onSaved={async (message) => {
              setDialog(null);
              await onModulesChanged(message);
            }}
          />
        </CourseDialog>
      )}
    </div>
  );
}
