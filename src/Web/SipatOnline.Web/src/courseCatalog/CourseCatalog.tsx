import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deleteGameModule,
  deleteSipatProgram,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseVideo,
  type PlatformLibraryVideo,
  type SipatProgram,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Page, PageHeader } from '@/components/ui/page';
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoUploadForm } from '@/courseEditor/CourseMediaForms';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import CourseStartOptions from './CourseStartOptions';
import CoursesPanel from './CoursesPanel';
import CreateCourseDialog from './CreateCourseDialog';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';
import ProgramsPanel from './ProgramsPanel';
import VideoLibraryPanel from './VideoLibraryPanel';

type CatalogTab = 'courses' | 'programs' | 'videos' | 'modules';
type CatalogDialog =
  | { kind: 'create' }
  | { kind: 'upload' }
  | { kind: 'game'; module: GameModule | null }


export default function CourseCatalog({
  courses,
  library,
  modules,
  programs,
  isLoading,
  error,
  busy,
  onRetry,
  onOpen,
  onDuplicate,
  onCreated,
  onVideoUploaded,
  onModulesChanged,
  onProgramsChanged,
  onError,
}: {
  courses: PlatformCourse[];
  library: PlatformLibraryVideo[];
  modules: GameModule[];
  programs: SipatProgram[];
  isLoading: boolean;
  error: string;
  busy: boolean;
  onRetry: () => void;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onCreated: (course: PlatformCourse) => Promise<void>;
  onVideoUploaded: (video: PlatformCourseVideo) => Promise<void>;
  onModulesChanged: (message: string) => Promise<void>;
  onProgramsChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<CatalogTab>('courses');
  const [dialog, setDialog] = useState<CatalogDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isEmptyCatalog = !isLoading && !error && courses.length === 0;
  const showTabs = !isEmptyCatalog || tab !== 'courses';
  const tabs: { id: CatalogTab; label: string; count: number }[] = [
    { id: 'courses', label: 'Cursos', count: courses.length },
    { id: 'programs', label: 'Programas', count: programs.length },
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

  async function removeProgram(program: SipatProgram) {
    if (!window.confirm(`Remover o programa "${program.title}"? As empresas que já o receberam continuam com seus cursos.`)) return;
    onError('');
    setIsDeleting(true);
    try {
      await deleteSipatProgram(program.id);
      await onProgramsChanged(`O programa "${program.title}" foi removido.`);
    } catch (deleteError) {
      onError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  const primaryAction = {
    courses: <Button onClick={() => setDialog({ kind: 'create' })}><Plus /> Criar curso</Button>,
    programs: <Button onClick={() => navigate('/platform/sipat-builder')}><Plus /> Montar SIPAT</Button>,
    videos: <Button onClick={openUpload}><Plus /> Enviar vídeo</Button>,
    modules: <Button onClick={() => setDialog({ kind: 'game', module: null })}><Plus /> Novo jogo</Button>,
  }[tab];

  const body = isLoading ? (
    <LoadingState className="list-state">Carregando catálogo...</LoadingState>
  ) : null;

  return (
    <Page>
      <PageHeader
        actions={primaryAction}
        badge={import.meta.env.DEV ? <Badge variant="outline">Apresentação demo</Badge> : undefined}
        description={`${pluralize(courses.length, 'curso', 'cursos')} no catálogo da plataforma`}
        title="Cursos"
      />

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>
          <Button disabled={isLoading} onClick={onRetry} variant="outline">Tentar novamente</Button>
        </div>
      )}

      <Tabs onValueChange={(value) => setTab(value as CatalogTab)} value={tab}>
        {showTabs && (
          <TabsList aria-label="Seções do catálogo">
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label} <TabCount>{item.count}</TabCount>
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="courses">
          {body ?? (isEmptyCatalog
            ? <CourseStartOptions onCreate={() => setDialog({ kind: 'create' })} onReuse={() => setTab('videos')} />
            : courses.length > 0 && <CoursesPanel busy={busy} courses={courses} onDuplicate={onDuplicate} onOpen={onOpen} />)}
        </TabsContent>
        <TabsContent value="programs">
          {body ?? (
            <ProgramsPanel
              busy={isDeleting}
              courses={courses}
              onCreate={() => navigate('/platform/sipat-builder')}
              onDelete={(program) => void removeProgram(program)}
              onEdit={(program) => navigate(`/platform/sipat-builder/${program.id}`)}
              programs={programs}
            />
          )}
        </TabsContent>
        <TabsContent value="videos">
          {body ?? <VideoLibraryPanel library={library} onUpload={openUpload} />}
        </TabsContent>
        <TabsContent value="modules">
          {body ?? (
            <GameModulesPanel
              busy={isDeleting}
              modules={modules}
              onCreate={() => setDialog({ kind: 'game', module: null })}
              onDelete={(module) => void removeGame(module)}
              onEdit={(module) => setDialog({ kind: 'game', module })}
            />
          )}
        </TabsContent>
      </Tabs>

      {dialog?.kind === 'create' && (
        <CreateCourseDialog onClose={() => setDialog(null)} onCreated={async (course) => {
          setDialog(null);
          await onCreated(course);
        }} />
      )}

      {dialog?.kind === 'upload' && (
        <Dialog busy={dialogBusy} onClose={() => setDialog(null)} title="Enviar vídeo">
          {uploadError && <p className="m-0 mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{uploadError}</p>}
          <VideoUploadForm onBusyChange={setDialogBusy} onError={setUploadError} onUploaded={async (video) => {
            setDialog(null);
            await onVideoUploaded(video);
          }} />
        </Dialog>
      )}

      {dialog?.kind === 'game' && (
        <Dialog busy={dialogBusy} onClose={() => setDialog(null)} size="lg" title={dialog.module ? 'Editar jogo' : 'Novo jogo'}>
          <GameModuleForm
            module={dialog.module}
            onBusyChange={setDialogBusy}
            onCancel={() => setDialog(null)}
            onSaved={async (message) => {
              setDialog(null);
              await onModulesChanged(message);
            }}
          />
        </Dialog>
      )}
    </Page>
  );
}
