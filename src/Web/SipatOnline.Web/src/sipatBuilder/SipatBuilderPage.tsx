import { ArrowLeft, Ban, Clock, Copy, FileDown, FileSpreadsheet, Film, Gamepad2, MoreHorizontal, Pencil, Rocket, Save, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  cancelSipatEvent, copySipatPlan, createSipatEvent, getCompanyCapabilities, getSipatCatalog, getSipatPlan, launchSipat, listSipatEvents, listSipatPlans, saveSipatPlan, updateSipatEvent,
  type CompanyCapabilities, type PlatformCourse, type SipatEvent, type SipatPlanSummary,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Page } from '@/components/ui/page';
import { extrasSuffix, getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import LoadingState from '@/LoadingState';
import '@/OpsIdentity.css';
import { partWord } from '@/trainings/partWord';
import { courseLessons as titlesOf } from '@/courseEditor/courseTrack';
import BuilderGrid from './BuilderGrid';
import BuilderSetup from './BuilderSetup';
import { planToCsv, sampleCsv } from './csv';
import ImportDialog from './ImportDialog';
import { phaseLabel, sipatPhase } from './sipatPhase';
import {
  addDays, buildCatalog, dayDuration, dayFromTitle, maxDays, dayVideoCounts, formatSpan, fromProgramDay, isValidDate, newDay, toProgramDay,
  type Catalog, type DaySlots,
} from './model';

/** On the phone (up to 760px) the hero buttons are 44px tall: "Mais" and "Salvar" share a row, the main action takes the next one. */
const phoneAction = 'max-[760px]:h-auto max-[760px]:min-h-11 max-[760px]:text-[0.9375rem]';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

/** What still blocks saving, per day (by position) and for the name, in short phrases shown on the day itself. */
export function findIssues(name: string, days: DaySlots[]): { name: string | null; days: Record<number, string[]> } {
  const byDay: Record<number, string[]> = {};
  days.forEach((day, index) => {
    const list: string[] = [];
    if (!day.title.trim()) list.push('Falta o slogan do dia.');
    if (!day.videos.some(Boolean)) list.push('Falta um assunto com vídeos.');
    if (day.date && !isValidDate(day.date)) list.push('A data é inválida.');
    if (list.length > 0) byDay[index] = list;
  });
  return { name: name.trim() ? null : 'Dê um nome ao treinamento.', days: byDay };
}

/**
 * One SIPAT of a company: a week of training. It is built as a draft (start date, days, a theme for each day),
 * can start from another SIPAT, and goes live when published. The company's administrator and the operator use it alike.
 */
export default function SipatBuilderPage({ basePath, canEditThemes = false }: { basePath: string; canEditThemes?: boolean }) {
  const navigate = useNavigate();
  const params = useParams();
  const isNew = params.sipatId === 'nova';
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [others, setOthers] = useState<SipatEvent[]>([]);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  // what the company's plan allows; unknown (null) leaves everything open and the server decides
  const [capabilities, setCapabilities] = useState<CompanyCapabilities | null>(null);
  const [sipat, setSipat] = useState<SipatEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [stage, setStage] = useState<'setup' | 'grid'>(isNew ? 'setup' : 'grid');
  const [name, setName] = useState('');
  const [dayCount, setDayCount] = useState(5);
  const [startDate, setStartDate] = useState('');
  const [days, setDays] = useState<DaySlots[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirmingLaunch, setConfirmingLaunch] = useState(false);
  // where the user tried to go while the SIPAT had unsaved changes
  const [leavingTo, setLeavingTo] = useState<string | null>(null);
  // the last day removed, kept for a few seconds so it can be put back
  const [removed, setRemoved] = useState<{ day: DaySlots; index: number } | null>(null);
  // problems are only shown after a save or publish attempt, then they update live as they get fixed
  const [showIssues, setShowIssues] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [editingName, setEditingName] = useState(false);
  // the trainings of Conteúdo; starting from one makes a day of each of its Títulos
  const [trainings, setTrainings] = useState<PlatformCourse[]>([]);
  const [training, setTraining] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [content, events, summaries] = await Promise.all([getSipatCatalog(), listSipatEvents(0, 100), listSipatPlans()]);
      getCompanyCapabilities().then(setCapabilities).catch(() => setCapabilities(null));
      // an <img> cannot send the company header the admin route needs: the operator loads the photo from the platform route
      const courses = canEditThemes
        ? content.courses.map(course => ({ ...course, coverUrl: course.coverUrl?.replace('/api/admin/sipat-catalog/courses/', '/api/platform/catalog/courses/') ?? null }))
        : content.courses;
      setCatalog(buildCatalog(courses, content.videos, content.games, content.categories ?? [], content.subjects ?? [], content.videoSubjects ?? []));
      setTrainings(courses);
      setPlans(summaries);
      setOthers(events.items);
      if (!isNew && params.sipatId) {
        const found = events.items.find(item => item.id === params.sipatId);
        if (!found) { setError('Não encontrei este treinamento.'); return; }
        setSipat(found); setName(found.title);
        setDays((await getSipatPlan(found.id)).map(fromProgramDay));
      } else {
        const year = new Date().getFullYear();
        setName(current => current || `SIPAT ${year}`);
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setLoading(false); }
  }, [isNew, params.sipatId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    // links inside the portal (back link, sidebar) change the page without unloading it: ask before leaving
    const guardLinks = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const destination = `${url.pathname}${url.search}${url.hash}`;
      if (destination === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      event.preventDefault();
      event.stopPropagation();
      setLeavingTo(destination);
    };
    document.addEventListener('click', guardLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardLinks, true);
    };
  }, [dirty]);

  // success notices float at the bottom of the screen, where they are seen however the grid is scrolled, and leave on their own
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!removed) return;
    const timer = window.setTimeout(() => setRemoved(null), 8000);
    return () => window.clearTimeout(timer);
  }, [removed]);

  const totals = useMemo(() => !catalog ? { videos: 0, extras: 0, games: 0, time: 0 } : {
    videos: days.reduce((sum, day) => sum + dayVideoCounts(day.videos.filter((id): id is string => !!id), catalog).house, 0),
    extras: days.reduce((sum, day) => sum + dayVideoCounts(day.videos.filter((id): id is string => !!id), catalog).extras, 0),
    games: days.reduce((sum, day) => sum + day.games.filter(Boolean).length, 0),
    time: days.reduce((sum, day) => sum + dayDuration(day, catalog), 0),
  }, [days, catalog]);

  const cancelled = sipat?.status === 'Cancelled';
  const published = sipat?.status === 'Published';
  const edit = (next: DaySlots[]) => { setDays(next); setDirty(true); setNotice(''); };

  function start() {
    if (!isValidDate(startDate)) { setError('Escolha a data de início do treinamento.'); return; }
    setError('');
    const source = trainings.find(item => item.id === training);
    if (source && catalog) {
      const known = (ids: string[]) => ids.filter(id => catalog.videos.has(id));
      setDays(titlesOf(source).slice(0, maxDays).map((title, index) => dayFromTitle(index, addDays(startDate, index), title.title, known(title.videoIds))));
      setStage('grid'); setDirty(true);
      return;
    }
    setDays(Array.from({ length: dayCount }, (_, index) => newDay(index, addDays(startDate, index))));
    setStage('grid'); setDirty(true);
  }

  const issues = useMemo(() => findIssues(name, days), [name, days]);
  const issueCount = Object.keys(issues.days).length + (issues.name ? 1 : 0);

  /** Marks what is missing on the day itself and brings the first one into view. Returns true when nothing is missing. */
  function checkIssues(): boolean {
    if (issueCount === 0) return true;
    setShowIssues(true); setNotice('');
    requestAnimationFrame(() => document.querySelector('[data-day-issue], [data-name-issue]')
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
    return false;
  }

  function removeDay(index: number) {
    setRemoved({ day: days[index], index });
    edit(days.filter((_, position) => position !== index));
  }

  function undoRemove() {
    if (!removed) return;
    const next = [...days];
    next.splice(Math.min(removed.index, next.length), 0, removed.day);
    edit(next);
    setRemoved(null);
  }

  /** Saves the SIPAT (creating it the first time) and its days; returns its id. */
  async function save(): Promise<string | null> {
    if (!checkIssues()) return null;
    setBusy(true); setError(''); setNotice('');
    try {
      const first = days.find(day => day.date)?.date ?? startDate;
      const last = [...days].reverse().find(day => day.date)?.date ?? first;
      const schedule = { startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(last, 1)}T00:00:00.000Z` };
      let current = sipat;
      if (!current) {
        current = await createSipatEvent({ title: name.trim(), description: null, ...schedule });
      } else if (current.status === 'Draft' && current.title !== name.trim()) {
        current = await updateSipatEvent(current.id, { title: name.trim(), description: current.description, startsAt: current.startsAt, endsAt: current.endsAt });
      }
      const saved = await saveSipatPlan(current.id, days.map(toProgramDay));
      setDays(saved.map(fromProgramDay)); setDirty(false); setSipat(current);
      setNotice('Rascunho salvo.');
      if (isNew) navigate(`${basePath}/${current.id}`, { replace: true });
      return current.id;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return null;
    } finally { setBusy(false); }
  }

  async function publish() {
    setConfirmingLaunch(false);
    const id = await save();
    if (!id) return;
    setBusy(true); setError('');
    try {
      const result = await launchSipat(id);
      const events = await listSipatEvents(0, 100);
      setOthers(events.items);
      setSipat(events.items.find(item => item.id === id) ?? null);
      setNotice(result.created > 0 ? `Treinamento publicado: ${pluralize(result.created, 'dia entregue', 'dias entregues')} aos participantes.` : 'Treinamento atualizado. Os dias que já tinham progresso ficaram como estavam.');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  async function endThis() {
    if (!sipat) return;
    setConfirmingEnd(false);
    setBusy(true); setError('');
    try {
      const cancelled = await cancelSipatEvent(sipat.id);
      setSipat(cancelled); setDirty(false);
      setNotice('Treinamento encerrado.');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  async function copyFrom(sourceId: string) {
    setCopying(false);
    setBusy(true); setError('');
    try {
      let target = sipat?.id;
      if (!target) {
        const first = isValidDate(startDate) ? startDate : new Date().toISOString().slice(0, 10);
        const created = await createSipatEvent({ title: name.trim() || `SIPAT ${new Date().getFullYear()}`, description: null, startsAt: `${first}T00:00:00.000Z`, endsAt: `${addDays(first, 1)}T00:00:00.000Z` });
        setSipat(created); target = created.id;
      }
      const copied = (await copySipatPlan(target, sourceId)).map(fromProgramDay);
      const base = isValidDate(startDate) ? startDate : null;
      setDays(copied.map((day, index) => ({ ...day, date: base ? addDays(base, index) : '' })));
      setStage('grid'); setDirty(true);
      setNotice('Dias copiados. Defina as datas e confira os assuntos antes de publicar.');
      if (isNew) navigate(`${basePath}/${target}`, { replace: true });
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  if (loading) return <LoadingState>Carregando o treinamento...</LoadingState>;
  if (!catalog) {
    return <Page><div className="grid justify-items-start gap-3">
      <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error || 'Não foi possível carregar o catálogo.'}</p>
      <Button onClick={() => void load()} variant="outline">Tentar novamente</Button>
    </div></Page>;
  }

  const template = () => download('modelo-sipat.csv', sampleCsv(catalog));
  // Bronze takes the ready modules as they are: a CSV with a grid of its own is a personalization (Prata and above)
  const canCustomizeGrid = capabilities?.customizeGrid !== false;
  const sources = others.filter(item => item.id !== sipat?.id && (plans.find(plan => plan.sipatEventId === item.id)?.days ?? 0) > 0);
  const label = sipat ? phaseLabel[sipatPhase(sipat, days.filter(day => day.videos.some(Boolean)).length)] : null;
  // the name is edited in the title itself, while the SIPAT is a draft; after publishing it stays as it is
  const canRename = stage === 'grid' && !cancelled && (sipat === null || sipat.status === 'Draft');
  const nameMissing = showIssues && !!issues.name;
  const showNameInput = canRename && (editingName || nameMissing);
  const exportCsv = () => download(`${(name || 'sipat').trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`, planToCsv(days, catalog));

  return <Page className="builder-page">
    <header className="ops-hero max-[760px]:gap-4! max-[760px]:px-4! max-[760px]:pt-3! max-[760px]:pb-4!" data-slot="page-header">
      <div className="ops-hero-copy max-[760px]:gap-2!">
        <Link className="ops-hero-back max-[760px]:-mb-1! max-[760px]:min-h-11" to={basePath}><ArrowLeft aria-hidden="true" /> Todos os treinamentos</Link>
        <p className="ops-hero-eyebrow">Treinamento</p>
        <div className="flex flex-wrap items-center gap-3 max-[760px]:min-w-0 max-[760px]:basis-full max-[760px]:gap-x-2 max-[760px]:gap-y-1.5">
          {showNameInput
            ? <Input aria-invalid={nameMissing} aria-label="Nome do treinamento" autoFocus className="ops-hero-title h-auto w-[min(100%,28rem)] border-dashed bg-transparent px-2 py-1 max-[760px]:text-[1.5rem]!"
              data-name-issue={nameMissing ? true : undefined} maxLength={200} onBlur={() => setEditingName(false)}
              onChange={event => { setName(event.target.value); setDirty(true); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur(); }}
              placeholder="Ex.: SIPAT 2026" value={name} />
            : <h1 className="ops-hero-title max-[760px]:text-[1.5rem]!">{isNew && stage === 'setup' ? 'Novo treinamento' : name || 'Treinamento'}</h1>}
          {canRename && !showNameInput && <Button aria-label="Renomear o treinamento" className="max-[760px]:-my-1.5 max-[760px]:size-11 max-[760px]:min-h-11" onClick={() => setEditingName(true)} size="icon-sm" variant="ghost"><Pencil /></Button>}
          {label && <Badge variant={label.variant}>{label.text}</Badge>}
          {dirty && <Badge variant="outline">Alterações não salvas</Badge>}
          {stage === 'grid' && sipat && sipat.status === 'Published' && <span className="text-xs text-muted-foreground">O nome fica fixo depois de publicado.</span>}
        </div>
        <p className="ops-hero-lead is-keep max-[760px]:text-[0.875rem]! max-[760px]:leading-[1.45]">{stage === 'setup' ? 'Defina quando começa, quantos dias tem e o assunto de cada dia.' : <>
          <span className="max-[760px]:hidden">Cada coluna é um dia. Arraste um assunto para cada dia e confira os vídeos e os jogos.</span>
          <span className="hidden max-[760px]:inline">Escolha um assunto para cada dia e confira os vídeos e os jogos.</span>
        </>}</p>
        {stage === 'grid' && <ul aria-label="Resumo do treinamento" className="ops-hero-stats max-[760px]:mt-1! max-[760px]:grid! max-[760px]:basis-full max-[760px]:grid-cols-2 max-[760px]:gap-2! max-[760px]:*:min-w-0 max-[760px]:*:flex-wrap max-[760px]:*:rounded-xl max-[760px]:*:bg-muted max-[760px]:*:px-3 max-[760px]:*:py-2 max-[760px]:*:text-sm">
          <li><strong>{days.length}</strong> {days.length === 1 ? 'dia' : 'dias'}</li>
          <li><Film aria-hidden="true" /><strong>{totals.videos}</strong> {totals.videos === 1 ? 'vídeo' : 'vídeos'}{extrasSuffix(totals.extras)}</li>
          <li><Gamepad2 aria-hidden="true" /><strong>{totals.games}</strong> {totals.games === 1 ? 'jogo' : 'jogos'}</li>
          <li><Clock aria-hidden="true" />{totals.time > 0 ? formatSpan(totals.time) : 'sem vídeos'}</li>
        </ul>}
      </div>
      {stage === 'grid' && !cancelled && <div className="ops-hero-actions max-[760px]:grid! max-[760px]:w-full max-[760px]:grid-cols-[auto_minmax(0,1fr)] max-[760px]:gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button className={phoneAction} disabled={busy} variant="ghost"><MoreHorizontal /> Mais</Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            {sources.length > 0 && <DropdownMenuItem onSelect={() => setCopying(true)}><Copy /> Duplicar de outro treinamento</DropdownMenuItem>}
            {canCustomizeGrid && <DropdownMenuItem onSelect={() => setImporting(true)}><FileSpreadsheet /> Importar CSV</DropdownMenuItem>}
            <DropdownMenuItem disabled={days.length === 0} onSelect={exportCsv}><FileDown /> Exportar CSV</DropdownMenuItem>
            {sipat && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setConfirmingEnd(true)} variant="destructive"><Ban /> Encerrar este treinamento</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className={phoneAction} disabled={busy || !dirty} onClick={() => void save()} variant="outline"><Save /> {published ? 'Salvar alterações' : 'Salvar rascunho'}</Button>
        <Button className={cn('ops-primary', phoneAction, 'max-[760px]:col-span-full max-[760px]:min-h-12 max-[760px]:text-base')} disabled={busy || days.length === 0} onClick={() => { if (checkIssues()) setConfirmingLaunch(true); }}><Rocket /> {published ? 'Atualizar os dias' : 'Publicar'}</Button>
      </div>}
    </header>

    {cancelled && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">Este treinamento foi encerrado e não pode ser alterado. Para usá-lo de novo, reative-o na lista de treinamentos, ou use "Duplicar" em um novo treinamento.</p>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {showIssues && issueCount > 0 && stage === 'grid' && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
      {issues.name ? 'Dê um nome ao treinamento. ' : ''}
      {Object.keys(issues.days).length > 0 && `${pluralize(Object.keys(issues.days).length, 'dia precisa', 'dias precisam')} de ajuste antes de salvar. Eles estão marcados em vermelho na grade.`}
    </p>}
    {!canCustomizeGrid && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
      No plano {capabilities?.plan ?? 'Bronze'} cada dia recebe um módulo pronto, com todos os seus vídeos. A personalização da grade de vídeos começa no plano Prata.
    </p>}
    {catalog.subjects.length === 0 && <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">O acervo ainda não tem assuntos publicados. Peça à operação para publicar os assuntos.</p>}

    {stage === 'setup'
      ? <BuilderSetup dayCount={dayCount} name={name} onDayCount={setDayCount} onImport={canCustomizeGrid ? () => setImporting(true) : undefined} onName={setName} onStart={start}
        onStartDate={setStartDate} onTemplate={template} startDate={startDate}
        onCopy={sources.length > 0 ? () => setCopying(true) : undefined}
        onTraining={canCustomizeGrid ? setTraining : undefined} training={training}
        trainings={trainings.map(item => ({ id: item.id, title: item.title, titles: titlesOf(item).length }))} />
      : <BuilderGrid canCustomizeGrid={canCustomizeGrid} canEditThemes={canEditThemes} catalog={catalog} days={days} issues={showIssues ? issues.days : undefined}
        onChange={cancelled ? () => undefined : edit} onRemoveDay={cancelled ? undefined : removeDay} />}

    {importing && <ImportDialog catalog={catalog} hasPlan={stage === 'grid' && days.some(day => day.videos.some(Boolean))} onClose={() => setImporting(false)}
      onImport={imported => { setDays(imported); setDirty(true); setStage('grid'); setImporting(false); setNotice(`${pluralize(imported.length, 'dia importado', 'dias importados')}. Revise e salve.`); }}
      onTemplate={template} />}

    {copying && <Dialog description="Escolha o treinamento de onde vêm os assuntos. Os dias são copiados para este rascunho e as datas ficam em aberto." onClose={() => setCopying(false)} title="Duplicar de outro treinamento">
      <ul className="m-0 grid max-h-72 list-none gap-2 overflow-auto p-0">
        {sources.map(item => {
          const plan = plans.find(entry => entry.sipatEventId === item.id);
          return <li key={item.id}>
            <button className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary" onClick={() => void copyFrom(item.id)} type="button">
              <span className="grid"><strong className="text-sm">{item.title}</strong>
                <span className="text-xs text-muted-foreground">{new Date(item.startsAt).getUTCFullYear()} · {plan ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}` : ''}</span></span>
              <Badge variant={phaseLabel[sipatPhase(item, plan?.days ?? 0)].variant}>{phaseLabel[sipatPhase(item, plan?.days ?? 0)].text}</Badge>
            </button>
          </li>;
        })}
      </ul>
      <DialogActions><Button onClick={() => setCopying(false)} variant="outline">Cancelar</Button></DialogActions>
    </Dialog>}

    {(notice || removed) && <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 grid -translate-x-1/2 justify-items-center gap-2 max-[760px]:right-4 max-[760px]:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] max-[760px]:left-4 max-[760px]:translate-x-0 max-[760px]:*:w-full max-[760px]:*:justify-between">
      {notice && <div className="builder-undo pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-overlay" role="status">
        <span>{notice}</span>
        <Button aria-label="Fechar aviso" className="text-background/80 hover:bg-background/15 hover:text-background" onClick={() => setNotice('')} size="icon-sm" variant="ghost"><X /></Button>
      </div>}
      {removed && <div className="builder-undo pointer-events-auto flex items-center gap-3 rounded-xl bg-foreground py-2 pr-2 pl-4 text-sm text-background shadow-overlay" role="status">
        <span>{removed.day.title.trim() ? `"${removed.day.title.trim()}" removido.` : `${partWord(days.map(day => day.date))} ${removed.index + 1} removido.`}</span>
        <Button className="bg-background/15 text-background hover:bg-background/25 hover:text-background" onClick={undoRemove} size="sm" variant="ghost"><Undo2 /> Desfazer</Button>
        <Button aria-label="Fechar aviso" className="text-background/80 hover:bg-background/15 hover:text-background" onClick={() => setRemoved(null)} size="icon-sm" variant="ghost"><X /></Button>
      </div>}
    </div>}

    {confirmingEnd && sipat && <Dialog description="Ele deixa de aparecer para os participantes e fica bloqueado para edição. Dá para reativá-lo depois na lista de treinamentos."
      onClose={() => setConfirmingEnd(false)} title={`Encerrar "${sipat.title}"?`}>
      <DialogActions>
        <Button onClick={() => setConfirmingEnd(false)} variant="outline">Voltar</Button>
        <Button onClick={() => void endThis()} variant="destructive"><Ban /> Encerrar treinamento</Button>
      </DialogActions>
    </Dialog>}

    {leavingTo && <Dialog description="As alterações deste treinamento ainda não foram salvas. Se sair agora, elas se perdem." onClose={() => setLeavingTo(null)} title="Sair sem salvar?">
      <DialogActions>
        <Button onClick={() => setLeavingTo(null)} variant="outline">Continuar editando</Button>
        <Button onClick={() => { const to = leavingTo; setDirty(false); setLeavingTo(null); navigate(to); }} variant="destructive">Sair sem salvar</Button>
        <Button disabled={busy} onClick={() => { const to = leavingTo; setLeavingTo(null); void save().then(id => { if (id) navigate(to); }); }}><Save /> Salvar e sair</Button>
      </DialogActions>
    </Dialog>}

    {confirmingLaunch && <Dialog description={published
      ? 'Os dias que ninguém começou são atualizados com os assuntos atuais. Os que já têm progresso ficam como estão.'
      : 'Ao publicar, cada dia é entregue aos participantes ativos da empresa.'}
      onClose={() => setConfirmingLaunch(false)} title={published ? 'Atualizar os dias do treinamento?' : 'Publicar o treinamento?'}>
      <DialogActions>
        <Button onClick={() => setConfirmingLaunch(false)} variant="outline">Voltar</Button>
        <Button onClick={() => void publish()}><Rocket /> {published ? 'Atualizar' : 'Publicar agora'}</Button>
      </DialogActions>
    </Dialog>}
  </Page>;
}
