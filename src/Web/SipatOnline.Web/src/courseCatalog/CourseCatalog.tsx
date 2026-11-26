import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  cancelSipatEvent,
  copySipatPlan,
  createSipatEvent,
  deleteGameModule,
  deletePlatformCourse,
  deleteSipat,
  inCompany,
  launchSipat,
  reactivateSipatEvent,
  listGameSubjects,
  listSubjects,
  type VideoSubject,
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
import { filterCourses, filterModules, hasCourseFilters, type CatalogFilters, type CourseOwner, type StatusFilter } from './catalogFilters';
import CourseStartOptions from './CourseStartOptions';
import CoursesPanel, { type CourseActions } from './CoursesPanel';
import { copyTrainingLink } from '@/trainings/trainingLink';
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
  owners,
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
  /** The trainings that belong to a company, by training: whose, and where each stands. */
  owners: Map<string, CourseOwner>;
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
    // the list opens without the ended and the finished; the filter brings them back
    status: (params.get('status') as StatusFilter | null) ?? 'active',
    category: params.get('categoria') ?? 'all',
    owner: params.get('empresa') ?? 'all',
  };
  // the games tab: '' every game, 'none' those without an assunto, or one assunto
  const subjectFilter = params.get('assunto') ?? '';

  function patchParams(updates: Record<string, string | null>) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        // "all" is where every filter starts, except the phase, which starts on the active ones
        if (value === null || value === '' || value === (key === 'status' ? 'active' : 'all')) next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }
  const setTab = (next: CatalogTab) => patchParams({ aba: next === 'courses' ? null : next });
  const changeFilters = (patch: Partial<CatalogFilters>) => patchParams({
    ...('query' in patch ? { q: patch.query ?? '' } : {}),
    ...('status' in patch ? { status: patch.status ?? 'active' } : {}),
    ...('category' in patch ? { categoria: patch.category ?? 'all' } : {}),
    ...('owner' in patch ? { empresa: patch.owner ?? 'all' } : {}),
  });
  const clearFilters = () => patchParams({ q: null, status: null, categoria: null, empresa: null, assunto: null });
  /** From an empty list: every training, the ended and the finished too. */
  const showEverything = () => patchParams({ q: null, status: 'all', categoria: null, empresa: null, assunto: null });

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
  // the assuntos come apart from the games: the list still shows if they fail
  const [subjects, setSubjects] = useState<VideoSubject[]>([]);
  const [gameSubjects, setGameSubjects] = useState<Map<string, string[]>>(new Map());
  async function loadSubjects() {
    try {
      const [list, links] = await Promise.all([listSubjects(), listGameSubjects()]);
      setSubjects([...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setGameSubjects(new Map(links.map((item) => [item.moduleId, item.subjectIds])));
    } catch { /* the games show without their assuntos */ }
  }
  useEffect(() => { void loadSubjects(); }, []);
  const subjectNames = useMemo(() => {
    const names = new Map(subjects.map((item) => [item.id, item.name]));
    return new Map([...gameSubjects].map(([moduleId, ids]) => [moduleId, ids.map((id) => names.get(id)).filter((name): name is string => !!name).sort((a, b) => a.localeCompare(b, 'pt-BR'))]));
  }, [subjects, gameSubjects]);

  const shownCourses = useMemo(() => filterCourses(courses, categories, filters, owners), [courses, categories, owners, filters.query, filters.status, filters.category, filters.owner]); // eslint-disable-line react-hooks/exhaustive-deps
  // the companies that have trainings, by name, for the filter
  const companies = useMemo(() => [...new Map([...owners.values()].map((owner) => [owner.tenantId, owner.companyName])).entries()]
    .map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [owners]);
  const shownModules = useMemo(() => filterModules(modules, filters.query, subjectFilter, gameSubjects), [modules, filters.query, subjectFilter, gameSubjects]);
  const knownCategories = new Set(categories.map((item) => item.id));
  const hasUncategorized = courses.some((course) => !course.categoryId || !knownCategories.has(course.categoryId));
  const isFiltered = tab === 'courses' ? hasCourseFilters(filters) : filters.query.trim() !== '' || (tab === 'modules' && subjectFilter !== '');
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

  /** One change to a training from the list: the list reloads and says what happened, or says why it could not. */
  async function change(action: () => Promise<string>) {
    onError('');
    setIsDeleting(true);
    try {
      await onProgramsChanged(await action());
    } catch (failure) {
      onError(getErrorMessage(failure));
    } finally {
      setIsDeleting(false);
    }
  }

  // a company's training is changed in that company, from here: the same calls its own list makes
  const courseActions: CourseActions = {
    onEdit: onOpen,
    onDuplicate: (course) => {
      const owner = owners.get(course.id);
      if (!owner) { onDuplicate(course); return; }
      void change(async () => {
        const today = new Date().toISOString().slice(0, 10);
        const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        const copy = await inCompany(owner.tenantId, () => createSipatEvent({ title: `${course.title} (cópia)`.slice(0, 200), description: course.description, startsAt: `${today}T00:00:00.000Z`, endsAt: `${tomorrow}T00:00:00.000Z` }));
        if ((owner.days ?? 0) > 0) await inCompany(owner.tenantId, () => copySipatPlan(copy.id, owner.sipatEventId));
        return `"${copy.title}" foi criado como rascunho em ${owner.companyName}. Abra para acertar as datas.`;
      });
    },
    onDelete: (course) => {
      const owner = owners.get(course.id);
      if (!window.confirm(owner
        ? `Excluir "${course.title}", de ${owner.companyName}? Os dias montados e a capa são apagados. Isso não pode ser desfeito.`
        : `Excluir o template "${course.title}"? As empresas que já copiaram este treinamento continuam com a cópia delas, e os vídeos continuam na biblioteca.`)) return;
      void change(async () => {
        if (owner) await inCompany(owner.tenantId, () => deleteSipat(owner.sipatEventId)); else await deletePlatformCourse(course.id);
        return `O treinamento "${course.title}" foi excluído.`;
      });
    },
    onPublish: (course, owner) => {
      if (!window.confirm(`Publicar "${course.title}", de ${owner.companyName}? Os participantes passam a ver os dias do treinamento.`)) return;
      void change(async () => { await inCompany(owner.tenantId, () => launchSipat(owner.sipatEventId)); return `"${course.title}" foi publicado.`; });
    },
    onEnd: (course, owner) => {
      if (!window.confirm(`Encerrar "${course.title}", de ${owner.companyName}? Ele sai da área dos participantes. O que já foi feito continua no histórico, e dá para reativar depois.`)) return;
      void change(async () => { await inCompany(owner.tenantId, () => cancelSipatEvent(owner.sipatEventId)); return `"${course.title}" foi encerrado. Para vê-lo de novo, escolha "Encerrado" no filtro.`; });
    },
    onReactivate: (course, owner) => void change(async () => {
      await inCompany(owner.tenantId, () => reactivateSipatEvent(owner.sipatEventId));
      return `"${course.title}" voltou como rascunho. Abra, confira os dias e publique de novo.`;
    }),
    onShare: (course, owner) => void change(async () => {
      const { link, copied } = await copyTrainingLink(owner.sipatEventId, `/platform/companies/${owner.tenantId}/treinamentos`, true);
      return copied ? `Link de "${course.title}" copiado. Quem abrir entra com o seu login e cai neste treinamento.` : `Link de "${course.title}": ${link}`;
    }),
  };

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
            companies={companies}
            countText={countText}
            filters={filters}
            hasUncategorized={hasUncategorized}
            isFiltered={isFiltered}
            onChange={changeFilters}
            onClear={clearFilters}
            onManageCategories={() => setDialog({ kind: 'categories' })}
            onSubject={(value) => patchParams({ assunto: value })}
            subject={subjectFilter}
            subjects={subjects}
            tab={tab}
          />
        )}

        <TabsContent value="courses">
          {body ?? (isEmptyCatalog
            ? <CourseStartOptions onCreate={() => setDialog({ kind: 'create' })} onReuse={() => navigate('/platform/videos')} />
            : courses.length > 0 && <CoursesPanel actions={courseActions} busy={busy || isDeleting} categories={categories} courses={shownCourses} owners={owners} onClearFilters={showEverything} />)}
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
              subjectNames={subjectNames}
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
              await Promise.all([onModulesChanged(message), loadSubjects()]);
            }}
            subjectIds={dialog.module ? gameSubjects.get(dialog.module.id) ?? [] : []}
            subjects={subjects}
          />
        </Dialog>
      )}
    </Page>
  );
}
