import { Plus } from 'lucide-react';
import { useState } from 'react';
import {
  deleteGameModule,
  deletePlatformCourse,
  deletePlatformVideo,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseVideo,
  type PlatformLibraryVideo,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Page } from '@/components/ui/page';
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VideoUploadForm } from '@/courseEditor/CourseMediaForms';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import CourseStartOptions from './CourseStartOptions';
import CoursesPanel from './CoursesPanel';
import CreateCourseDialog from './CreateCourseDialog';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';
import PlanSubjectsPanel from './PlanSubjectsPanel';
import VideoLibraryPanel from './VideoLibraryPanel';

type CatalogTab = 'courses' | 'videos' | 'modules' | 'plans';
type CatalogDialog =
  | { kind: 'create' }
  | { kind: 'upload' }
  | { kind: 'game'; module: GameModule | null }


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
  onProgramsChanged,
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
  onProgramsChanged: (message: string) => Promise<void>;
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
    { id: 'courses', label: 'Assuntos', count: courses.length },
    { id: 'videos', label: 'Vídeos', count: library.length },
    { id: 'modules', label: 'Jogos e perguntas', count: modules.length },
    { id: 'plans', label: 'Planos', count: 4 },
  ];

  function openUpload() {
    setUploadError('');
    setDialog({ kind: 'upload' });
  }

  async function removeGame(module: GameModule) {
    const usage = module.usageCount > 0
      ? ` Ele está em ${pluralize(module.usageCount, 'assunto', 'assuntos')} e sairá desses assuntos.`
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

  async function removeCourse(course: PlatformCourse) {
    if (!window.confirm(`Excluir o assunto "${course.title}"? As empresas que já receberam esta SIPAT continuam com o conteúdo, e os vídeos continuam na biblioteca.`)) return;
    onError('');
    setIsDeleting(true);
    try {
      await deletePlatformCourse(course.id);
      await onProgramsChanged(`O assunto "${course.title}" foi excluído.`);
    } catch (deleteError) {
      onError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  async function removeVideo(item: PlatformLibraryVideo) {
    if (!window.confirm(`Excluir o vídeo "${item.video.title}"? O arquivo é apagado e isso não pode ser desfeito.`)) return;
    onError('');
    setIsDeleting(true);
    try {
      await deletePlatformVideo(item.video.id);
      await onProgramsChanged(`O vídeo "${item.video.title}" foi excluído.`);
    } catch (deleteError) {
      onError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  const primaryAction = {
    courses: <Button onClick={() => setDialog({ kind: 'create' })}><Plus /> Criar assunto</Button>,
    plans: undefined,
    videos: <Button onClick={openUpload}><Plus /> Enviar vídeo</Button>,
    modules: <Button onClick={() => setDialog({ kind: 'game', module: null })}><Plus /> Novo jogo</Button>,
  }[tab];

  const body = isLoading ? (
    <LoadingState className="list-state">Carregando catálogo...</LoadingState>
  ) : null;

  return (
    <Page>
      <header className="library-hero" data-slot="page-header">
        <div className="grid min-w-0 gap-2">
          <p className="m-0 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-[#7fe0a6]">Acervo da plataforma</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[clamp(2rem,4vw,2.75rem)] font-extrabold leading-none tracking-[-0.035em] text-white">Biblioteca</h1>
            {import.meta.env.DEV && <Badge className="border-white/25 bg-white/10 text-white" variant="outline">Apresentação demo</Badge>}
          </div>
          <p className="m-0 text-[0.9375rem] text-white/75">{`${pluralize(courses.length, 'assunto', 'assuntos')} no acervo da plataforma`}</p>
          <ul aria-label="Resumo do acervo" className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
            {[
              [courses.length, 'assuntos'],
              [library.length, 'vídeos'],
              [modules.length, 'jogos e perguntas'],
            ].map(([count, label]) => (
              <li className="rounded-xl bg-white/10 px-3.5 py-1.5 text-[0.8125rem] text-white/85" key={label}>
                <strong className="mr-1 text-base font-extrabold tabular-nums text-white">{count}</strong>{label}
              </li>
            ))}
          </ul>
        </div>
        {primaryAction && <div className="library-hero-action flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{primaryAction}</div>}
      </header>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>
          <Button disabled={isLoading} onClick={onRetry} variant="outline">Tentar novamente</Button>
        </div>
      )}

      <Tabs onValueChange={(value) => setTab(value as CatalogTab)} value={tab}>
        {showTabs && (
          <TabsList aria-label="Seções do catálogo" className="library-tabs gap-2 border-0">
            {tabs.map((item) => (
              <TabsTrigger className="library-tab" key={item.id} value={item.id}>
                {item.label} <TabCount>{item.count}</TabCount>
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="courses">
          {body ?? (isEmptyCatalog
            ? <CourseStartOptions onCreate={() => setDialog({ kind: 'create' })} onReuse={() => setTab('videos')} />
            : courses.length > 0 && <CoursesPanel busy={busy || isDeleting} courses={courses} onDelete={(course) => void removeCourse(course)} onDuplicate={onDuplicate} onOpen={onOpen} />)}
        </TabsContent>
        <TabsContent value="plans">
          {body ?? <PlanSubjectsPanel />}
        </TabsContent>
        <TabsContent value="videos">
          {body ?? <VideoLibraryPanel busy={isDeleting} library={library} onDelete={(item) => void removeVideo(item)} onUpload={openUpload} />}
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
