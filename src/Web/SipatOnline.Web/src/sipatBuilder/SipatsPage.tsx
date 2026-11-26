import { CalendarDays, Copy, Film, ImagePlus, Link2, Pencil, Plus, RotateCcw, Search, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  copySipatPlan, createSipatEvent, deleteSipat, setTrainingCover, getCompanyAdministrationId, getCompanyCapabilities, getCompanyRegistry, listSipatEvents, listSipatPlans, openSipatWeek, reactivateSipatEvent,
  type CompanyRegistry, type SipatEvent, type SipatPlanSummary,
} from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import { phaseLabel, sipatPhase, type SipatPhase } from './sipatPhase';
import { audienceLabel } from '@/trainings/audienceLabel';
import { copyTrainingLink } from '@/trainings/trainingLink';
import { trainingInUnit, useUnitScope } from '@/trainings/unitScope';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const fullDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** "09/11 a 13/11"; one date when it starts and ends the same day; the years when they differ. */
function periodLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(new Date(endsAt).getTime() - 1);
  const format = start.getUTCFullYear() === end.getUTCFullYear() ? dateFormat : fullDateFormat;
  const [from, to] = [format.format(start), format.format(end)];
  return from === to ? from : `${from} a ${to}`;
}

/** "45 min", "1 h 20 min": how long the videos of the training run. */
function runtime(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

const phases: SipatPhase[] = ['draft', 'created', 'published', 'running', 'finished', 'cancelled'];
const iconAction = 'grid size-9 min-h-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 [&_svg]:size-4';

/**
 * The trainings of a company, the way Conteúdo lists its own: a search, a filter by phase, and a card for each with
 * its cover and what can be done with it. Newest year first; several can be published at the same time.
 * `operator`: the operation, inside a company. On a plan that only views (Bronze) it is the one that builds the trainings.
 */
export default function SipatsPage({ basePath, operator = false }: { basePath: string; operator?: boolean }) {
  const navigate = useNavigate();
  const unitScope = useUnitScope();
  const [viewOnly, setViewOnly] = useState(false);
  const [events, setEvents] = useState<SipatEvent[] | null>(null);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  // the units and sectors, to say who each training is for; the list works without them
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // the training an action is running on (reactivate, duplicate, delete, open in the editor)
  const [working, setWorking] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<SipatPhase | 'all'>('all');

  useEffect(() => {
    let current = true;
    if (!operator) getCompanyCapabilities().then(capabilities => { if (current) setViewOnly(!capabilities.customizeGrid); }, () => undefined);
    getCompanyRegistry().then(loaded => { if (current) setRegistry(loaded); }, () => undefined);
    Promise.all([listSipatEvents(0, 100), listSipatPlans()])
      .then(([page, summaries]) => { if (current) { setEvents(page.items); setPlans(summaries); } })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, [operator]);

  const summaryOf = (event: SipatEvent) => plans.find(item => item.sipatEventId === event.id);
  const phaseOf = (event: SipatEvent) => sipatPhase(event, summaryOf(event)?.days ?? 0);

  // with a unit chosen at the top: its trainings and the ones of the whole company
  const inScope = useMemo(
    () => (events ?? []).filter(event => trainingInUnit(plans.find(item => item.sipatEventId === event.id), unitScope.unitId)),
    [events, plans, unitScope.unitId],
  );
  const shown = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('pt-BR');
    return inScope.filter(event => (phase === 'all' || phaseOf(event) === phase)
      && (!text || event.title.toLocaleLowerCase('pt-BR').includes(text)));
    // phaseOf reads the summaries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inScope, plans, query, phase]);

  const years = useMemo(() => {
    const byYear = new Map<number, SipatEvent[]>();
    for (const event of shown) {
      const year = new Date(event.startsAt).getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), event]);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [shown]);

  async function run(event: SipatEvent, action: () => Promise<void>) {
    setWorking(event.id); setError(''); setNotice('');
    try { await action(); } catch (failure) { setError(getErrorMessage(failure)); } finally { setWorking(null); }
  }

  const reactivate = (event: SipatEvent) => run(event, async () => {
    const back = await reactivateSipatEvent(event.id);
    setEvents(known => (known ?? []).map(item => (item.id === back.id ? back : item)));
    setNotice(`"${back.title}" voltou como rascunho. Abra, confira os dias e publique de novo.`);
  });

  /** The pencil: the training in the video editor. The company has its own page; the operation edits in Conteúdo. */
  const edit = (event: SipatEvent) => run(event, async () => {
    if (!operator) { navigate(`${basePath}/${event.id}/editar`); return; }
    const { courseId } = await openSipatWeek(event.id);
    navigate(`/platform/courses/${courseId}/edit`);
  });

  /** A new draft with the same days, videos, games and cover; the dates are set on the copy. */
  const duplicate = (event: SipatEvent) => run(event, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const copy = await createSipatEvent({ title: `${event.title} (cópia)`.slice(0, 200), description: event.description, startsAt: `${today}T00:00:00.000Z`, endsAt: `${tomorrow}T00:00:00.000Z` });
    if ((summaryOf(event)?.days ?? 0) > 0) await copySipatPlan(copy.id, event.id);
    // a company with units duplicates to give the copy to another unit: its "Para quem" opens right away
    navigate(`${basePath}/${copy.id}${registry?.units.some(unit => unit.isActive) ? '?para-quem=1' : ''}`);
  });

  /** The link to hand to the people who will take the training: they sign in and land on it. */
  const share = (event: SipatEvent) => run(event, async () => {
    const { link, copied } = await copyTrainingLink(event.id, basePath, operator);
    setNotice(copied ? `Link de "${event.title}" copiado. Quem abrir entra com o seu login e cai neste treinamento.` : `Link de "${event.title}": ${link}`);
  });

  /** The picture of the training's card: sent right from the card, and the card shows it at once. */
  const changeCover = (event: SipatEvent, image: File) => run(event, async () => {
    const courseId = summaryOf(event)?.courseId;
    if (!courseId) return;
    await setTrainingCover(courseId, image);
    setPlans(await listSipatPlans());
    setNotice(`Capa de "${event.title}" trocada.`);
  });

  const remove = (event: SipatEvent) => {
    if (!window.confirm(`Excluir "${event.title}"? Os dias montados e a capa são apagados. Isso não pode ser desfeito.`)) return;
    void run(event, async () => {
      await deleteSipat(event.id);
      setEvents(known => (known ?? []).filter(item => item.id !== event.id));
      setNotice(`"${event.title}" foi excluído.`);
    });
  };

  const total = inScope.length;
  const filtered = query.trim() !== '' || phase !== 'all';
  const create = viewOnly ? undefined : <Link className={buttonVariants()} to={`${basePath}/nova`}><Plus /> Novo treinamento</Link>;
  return <Page>
    <PageHeader actions={create} description="Cada treinamento tem os seus dias ou módulos. Vários podem estar publicados ao mesmo tempo; os anteriores continuam no histórico." eyebrow="Programação" title="Treinamentos" />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {!events && !error && <LoadingState>Carregando os treinamentos...</LoadingState>}
    {events && total === 0 && (viewOnly
      ? <EmptyState description="No seu plano a operação monta o treinamento. Quando ele estiver pronto, aparece aqui." title="Nenhum treinamento ainda." />
      : <EmptyState action={<Link className={buttonVariants()} to={`${basePath}/nova`}>Criar o primeiro treinamento</Link>} description="Defina a data de início, quantos dias e o assunto de cada dia." title="Nenhum treinamento ainda." />)}

    {total > 0 && <div className="flex flex-wrap items-center gap-2.5" role="search">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-md">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar treinamento" className="pl-9" onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome" type="search" value={query} />
      </label>
      <NativeSelect aria-label="Fase" className="w-auto max-sm:flex-1" onChange={event => setPhase(event.target.value as SipatPhase | 'all')} value={phase}>
        <option value="all">Todas as fases</option>
        {phases.map(item => <option key={item} value={item}>{phaseLabel[item].text}</option>)}
      </NativeSelect>
      {filtered && <Button onClick={() => { setQuery(''); setPhase('all'); }} size="sm" variant="ghost">Limpar</Button>}
      <span aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground">
        {filtered ? `${shown.length} de ${pluralize(total, 'treinamento', 'treinamentos')}` : pluralize(total, 'treinamento', 'treinamentos')}
      </span>
    </div>}
    {total > 0 && shown.length === 0 && <EmptyState description="Tente outro nome ou outra fase." title="Nenhum treinamento encontrado." />}

    {years.map(([year, items]) => <section aria-label={`Treinamentos de ${year}`} className="grid gap-3" key={year}>
      <h2 className="m-0 text-sm font-semibold tracking-wide text-muted-foreground">{year}</h2>
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
        {items.map(event => {
          const plan = summaryOf(event);
          const label = phaseLabel[phaseOf(event)];
          const cancelled = event.status === 'Cancelled';
          const busy = working === event.id;
          // an <img> cannot send the header that says which company the operation is in (also in the company's own screens, in operator mode): it loads the photo from its own route
          const cover = plan?.courseId && plan.coverVersion != null
            ? `${operator || getCompanyAdministrationId() ? '/api/platform/catalog' : '/api/admin/training-editor'}/courses/${plan.courseId}/cover?v=${plan.coverVersion}`
            : null;
          // same card as Conteúdo: cover on top, phase over it, period and days below
          const details = <>
            <div className="relative aspect-video overflow-hidden bg-[#12332c] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-1/3 after:bg-gradient-to-t after:from-[rgb(11_36_31/0.45)] after:to-transparent after:content-['']">
              {cover
                ? <img alt="" className="block size-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03] motion-reduce:group-hover:scale-100" decoding="async" loading="lazy" src={cover} />
                // no photo yet: the name on the training's own color, instead of a stock picture that is the same on every card
                : <span aria-hidden="true" className="grid size-full place-items-center px-6 text-center text-xl leading-tight font-extrabold tracking-[-0.01em] text-white/90"><span className="line-clamp-3">{event.title}</span></span>}
              <Badge className="absolute left-3 top-3 z-10" variant={label.variant}>{label.text}</Badge>
            </div>
            <div className="grid flex-1 content-start gap-1.5 px-5 pb-3 pt-4">
              <h3 className="m-0 line-clamp-2 min-h-[2.7em] text-[1.0625rem] font-extrabold leading-[1.3] tracking-[-0.01em] text-[#12332c]">{event.title}</h3>
              <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] tabular-nums text-muted-foreground">
                <CalendarDays aria-hidden="true" className="size-4" />
                {periodLabel(event.startsAt, event.endsAt)}
              </p>
              <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] tabular-nums text-muted-foreground">
                <Film aria-hidden="true" className="size-4" />
                {plan && plan.days > 0
                  ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}${plan.durationMilliseconds ? ` · ${runtime(plan.durationMilliseconds)}` : ''}`
                  : 'Dias ainda não montados'}
              </p>
              {/* who it is for, when it is not the whole company */}
              {registry && (plan?.targets?.length ?? 0) > 0 && <p className="m-0 flex items-start gap-1.5 text-[0.8125rem] font-medium text-primary">
                <Users aria-hidden="true" className="mt-px size-4 shrink-0" />
                <span className="line-clamp-2">{audienceLabel(plan?.targets ?? [], registry)}</span>
              </p>}
            </div>
          </>;
          const card = 'group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border bg-card';
          return <li key={event.id}>
            {cancelled
              ? <div aria-disabled="true" aria-label={`${event.title} (encerrada)`} className={cn(card, 'border-dashed border-border bg-muted/40 text-muted-foreground')} role="group">
                <div className="flex flex-1 flex-col opacity-60 grayscale">{details}</div>
                {!viewOnly && <footer className="mt-1 border-t border-[#dfe6e3] px-4 py-3">
                  <Button disabled={busy} onClick={() => void reactivate(event)} size="sm" variant="outline">
                    <RotateCcw /> {busy ? 'Reativando...' : 'Reativar'}
                  </Button>
                </footer>}
              </div>
              : <div className={cn(card, 'shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-[box-shadow,transform,border-color] duration-200 ease-out-soft hover:-translate-y-1 hover:border-[#12332c] hover:shadow-[0_18px_34px_-18px_rgb(18_51_44/0.5)] motion-reduce:hover:translate-y-0',
                event.status === 'Published' && new Date(event.endsAt) > new Date() ? 'border-primary/40' : 'border-[#dfe6e3]')}>
                <Link aria-label={`Abrir ${event.title}`} className="flex flex-1 flex-col text-foreground no-underline" to={`${basePath}/${event.id}`}>{details}</Link>
                {/* the cover is changed right on the card: a quiet button over the picture, in view on the card under the pointer */}
                {!viewOnly && plan?.courseId && <label className={cn('absolute top-3 right-3 z-10 m-0 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-sm transition-opacity hover:bg-black/75 focus-within:opacity-100 group-hover:opacity-100 max-[760px]:opacity-100',
                  cover ? 'opacity-0' : 'opacity-100', busy && 'pointer-events-none opacity-50')}>
                  <ImagePlus aria-hidden="true" className="size-3.5" /> {cover ? 'Trocar capa' : 'Adicionar capa'}
                  <input accept="image/png,image/jpeg,image/webp" aria-label={`Capa de ${event.title}`} className="sr-only"
                    onChange={input => { const file = input.target.files?.[0]; input.target.value = ''; if (file) void changeCover(event, file); }} type="file" />
                </label>}
                <footer className="mt-1 flex items-center gap-1 border-t border-[#dfe6e3] px-4 py-3">
                  <Link aria-hidden="true" className="mr-auto inline-block whitespace-nowrap rounded-full bg-[#12332c] px-3.5 py-1.5 text-[0.8125rem] font-bold text-white no-underline transition-colors hover:bg-[#0f7a3d]" tabIndex={-1} to={`${basePath}/${event.id}`}>Abrir →</Link>
                  <button aria-label={`${viewOnly ? 'Ver' : 'Editar'} ${event.title} no editor de vídeos`} className={cn(iconAction, 'max-[760px]:hidden')} disabled={busy} onClick={() => void edit(event)} title={viewOnly ? 'Ver no editor' : 'Editar treinamento'} type="button"><Pencil aria-hidden="true" /></button>
                  {event.status === 'Published' && <button aria-label={`Copiar o link de ${event.title}`} className={iconAction} disabled={busy} onClick={() => void share(event)} title="Copiar link para os participantes" type="button"><Link2 aria-hidden="true" /></button>}
                  {!viewOnly && <button aria-label={`Duplicar ${event.title}`} className={iconAction} disabled={busy} onClick={() => void duplicate(event)} title="Duplicar" type="button"><Copy aria-hidden="true" /></button>}
                  {/* only what was never delivered can go; a published training is ended from its own page */}
                  {!viewOnly && event.status === 'Draft' && <button aria-label={`Excluir ${event.title}`} className={cn(iconAction, 'hover:text-destructive')} disabled={busy} onClick={() => remove(event)} title="Excluir" type="button"><Trash2 aria-hidden="true" /></button>}
                </footer>
              </div>}
          </li>;
        })}
      </ul>
    </section>)}
  </Page>;
}
