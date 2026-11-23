import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  deleteGameModule,
  deletePlatformCourse,
  type GameModule,
  type PlatformCourse,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Page } from '@/components/ui/page';
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import CatalogToolbar, { type CatalogTab } from './CatalogToolbar';
import { filterCourses, filterModules, hasCourseFilters, type CatalogFilters, type StatusFilter } from './catalogFilters';
import CourseStartOptions from './CourseStartOptions';
import CoursesPanel from './CoursesPanel';
import CreateCourseDialog from './CreateCourseDialog';
import ManageCategoriesDialog from './ManageCategoriesDialog';
import { useCourseCategories } from './useCourseCategories';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';
import PlanSubjectsPanel from './PlanSubjectsPanel';
import '@/OpsIdentity.css';

/** The videos have their own page (/platform/videos); this one keeps the content that uses them. */
const catalogTabs: CatalogTab[] = ['courses', 'modules', 'plans'];
/** The last view of the library (tab, search and filters), kept for the session so coming back from an editor finds it as it was. */
const viewKey = 'sipat-library-view';
type CatalogDialog =
  | { kind: 'create' }
  | { kind: 'categories' }
  | { kind: 'game'; module: GameModule | null }


export default function CourseCatalog({
  courses,
  modules,
  isLoading,
  error,
  busy,
  onRetry,
  onOpen,
  onDuplicate,
  onCreated,
  onModulesChanged,
  onProgramsChanged,
  onError,
}: {
  courses: PlatformCourse[];
  modules: GameModule[];
  isLoading: boolean;
  error: string;
  busy: boolean;
  onRetry: () => void;
  onOpen: (course: PlatformCourse) => void;
  onDuplicate: (course: PlatformCourse) => void;
  onCreated: (course: PlatformCourse) => Promise<void>;
  onModulesChanged: (message: string) => Promise<void>;
  onProgramsChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedTab = params.get('aba');
  const tab: CatalogTab = catalogTabs.includes(requestedTab as CatalogTab) ? (requestedTab as CatalogTab) : 'courses';
  const filters: CatalogFilters = {
    query: params.get('q') ?? '',
    status: (params.get('status') as StatusFilter | null) ?? 'all',
    category: params.get('categoria') ?? 'all',
  };

  function patchParams(updates: Record<string, string | null>) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === 'all') next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }
  const setTab = (next: CatalogTab) => patchParams({ aba: next === 'courses' ? null : next });
  const changeFilters = (patch: Partial<CatalogFilters>) => patchParams({
    ...('query' in patch ? { q: patch.query ?? '' } : {}),
    ...('status' in patch ? { status: patch.status ?? 'all' } : {}),
    ...('category' in patch ? { categoria: patch.category ?? 'all' } : {}),
  });
  const clearFilters = () => patchParams({ q: null, status: null, categoria: null });

  // coming back to the library (from an editor, another screen) restores the view it had
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(viewKey);
      if (saved && params.toString() === '') setParams(new URLSearchParams(saved), { replace: true });
    } catch { /* no storage: the library simply opens clean */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, params.toString()); } catch { /* idem */ }
  }, [params]);
  const { categories, create: createCategory, reload: reloadCategories } = useCourseCategories();
  const [dialog, setDialog] = useState<CatalogDialog | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const shownCourses = useMemo(() => filterCourses(courses, categories, filters), [courses, categories, filters.query, filters.status, filters.category]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownModules = useMemo(() => filterModules(modules, filters.query), [modules, filters.query]);
  const knownCategories = new Set(categories.map((item) => item.id));
  const hasUncategorized = courses.some((course) => !course.categoryId || !knownCategories.has(course.categoryId));
  const isFiltered = tab === 'courses' ? hasCourseFilters(filters) : filters.query.trim() !== '';
  const countText = {
    courses: isFiltered ? `${shownCourses.length} de ${courses.length}` : pluralize(courses.length, 'treinamento', 'treinamentos'),
    videos: '',
    modules: isFiltered ? `${shownModules.length} de ${modules.length}` : pluralize(modules.length, 'jogo', 'jogos'),
    plans: '',
  }[tab];
  const isEmptyCatalog = !isLoading && !error && courses.length === 0;
  const showTabs = !isEmptyCatalog || tab !== 'courses';
  const tabs: { id: CatalogTab; label: string; count: number }[] = [
    { id: 'courses', label: 'Treinamentos', count: courses.length },
    { id: 'modules', label: 'Jogos e perguntas', count: modules.length },
    { id: 'plans', label: 'Planos', count: 4 },
  ];

  async function removeGame(module: GameModule) {
    const usage = module.usageCount > 0
      ? ` Ele está em ${pluralize(module.usageCount, 'treinamento', 'treinamentos')} e sairá desses treinamentos.`
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
    if (!window.confirm(`Excluir o treinamento "${course.title}"? As empresas que já receberam este conteúdo continuam com o conteúdo, e os vídeos continuam na biblioteca.`)) return;
    onError('');
    setIsDeleting(true);
    try {
      await deletePlatformCourse(course.id);
      await onProgramsChanged(`O treinamento "${course.title}" foi excluído.`);
    } catch (deleteError) {
      onError(getErrorMessage(deleteError));
    } finally {
      setIsDeleting(false);
    }
  }

  const primaryAction = {
    courses: <Button className="ops-primary" onClick={() => setDialog({ kind: 'create' })}><Plus /> Criar treinamento</Button>,
    plans: undefined,
    videos: undefined,
    modules: <Button className="ops-primary" onClick={() => setDialog({ kind: 'game', module: null })}><Plus /> Novo jogo</Button>,
  }[tab];

  // the old Vídeos tab (links, the remembered view) now opens the video library
  if (requestedTab === 'videos') return <Navigate replace to="/platform/videos" />;

  const body = isLoading ? (
    <LoadingState className="list-state">Carregando catálogo...</LoadingState>
  ) : null;

  return (
    <Page>
      <header className="ops-hero" data-slot="page-header">
        <div className="ops-hero-copy">
          <p className="ops-hero-eyebrow">Acervo da plataforma</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="ops-hero-title">Conteúdo</h1>
            {import.meta.env.DEV && <Badge variant="outline">Apresentação demo</Badge>}
          </div>
          <p className="ops-hero-lead">{`${pluralize(courses.length, 'treinamento', 'treinamentos')} no acervo da plataforma`}</p>
        </div>
        {primaryAction && <div className="ops-hero-actions">{primaryAction}</div>}
      </header>

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
              <TabsTrigger className="library-tab" key={item.id} value={item.id}>
                {item.label} <TabCount>{item.count}</TabCount>
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {showTabs && tab !== 'plans' && (
          <CatalogToolbar
            categories={categories}
            countText={countText}
            filters={filters}
            hasUncategorized={hasUncategorized}
            isFiltered={isFiltered}
            onChange={changeFilters}
            onClear={clearFilters}
            onManageCategories={() => setDialog({ kind: 'categories' })}
            tab={tab}
          />
        )}

        <TabsContent value="courses">
          {body ?? (isEmptyCatalog
            ? <CourseStartOptions onCreate={() => setDialog({ kind: 'create' })} onReuse={() => navigate('/platform/videos')} />
            : courses.length > 0 && <CoursesPanel busy={busy || isDeleting} categories={categories} courses={shownCourses} onClearFilters={clearFilters} onDelete={(course) => void removeCourse(course)} onDuplicate={onDuplicate} onOpen={onOpen} />)}
        </TabsContent>
        <TabsContent value="plans">
          {body ?? <PlanSubjectsPanel />}
        </TabsContent>
        <TabsContent value="modules">
          {body ?? (
            <GameModulesPanel
              busy={isDeleting}
              hasModules={modules.length > 0}
              modules={shownModules}
              onClearFilters={clearFilters}
              onCreate={() => setDialog({ kind: 'game', module: null })}
              onDelete={(module) => void removeGame(module)}
              onEdit={(module) => setDialog({ kind: 'game', module })}
            />
          )}
        </TabsContent>
      </Tabs>

      {dialog?.kind === 'create' && (
        <CreateCourseDialog categories={categories} onClose={() => setDialog(null)} onCreateCategory={createCategory} onCreated={async (course) => {
          setDialog(null);
          await onCreated(course);
        }} />
      )}

      {dialog?.kind === 'categories' && (
        <ManageCategoriesDialog categories={categories} onChanged={async () => { await reloadCategories(); await onProgramsChanged('As categorias foram atualizadas.'); }} onClose={() => setDialog(null)} />
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
