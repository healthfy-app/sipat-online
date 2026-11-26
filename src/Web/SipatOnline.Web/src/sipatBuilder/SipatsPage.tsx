import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  cancelSipatEvent, copySipatPlan, createSipatEvent, deleteSipat, setTrainingCover, getCompanyAdministrationId, getCompanyCapabilities, getCompanyRegistry, launchSipat, listSipatEvents, listSipatPlans, openSipatWeek, reactivateSipatEvent,
  type CompanyRegistry, type SipatEvent, type SipatPlanSummary,
} from '@/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { phaseLabel, sipatPhase, type SipatPhase } from './sipatPhase';
import AudienceFilter from '@/trainings/AudienceFilter';
import { audienceLabel } from '@/trainings/audienceLabel';
import TrainingCard from '@/trainings/TrainingCard';
import { periodLabel, runtime } from '@/trainings/trainingFormat';
import { copyTrainingLink } from '@/trainings/trainingLink';
import { inChoice } from '@/trainings/UnitTree';
import { trainingInUnit, useUnitScope } from '@/trainings/unitScope';

const phases: SipatPhase[] = ['draft', 'created', 'published', 'running', 'finished', 'cancelled'];

/**
 * The trainings of a company, the way Conteúdos lists its own: a search, a filter by phase and by who they are for, and
 * the same card for each. It always opens on the ones in progress; the others are a choice of the filter away.
 * Newest year first; several can be published at the same time.
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
  // every visit starts on what is happening now
  const [phase, setPhase] = useState<SipatPhase | 'all'>('running');
  // the units and sectors marked in "Para quem" (none: everyone's)
  const [audience, setAudience] = useState(() => new Map<string, Set<string>>());

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
      && inChoice(plans.find(item => item.sipatEventId === event.id)?.targets ?? [], audience)
      && (!text || event.title.toLocaleLowerCase('pt-BR').includes(text)));
    // phaseOf reads the summaries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inScope, plans, query, phase, audience]);

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
    // the card already knows the training's content; an ended one opens too
    const courseId = summaryOf(event)?.courseId ?? (await openSipatWeek(event.id)).courseId;
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

  /** Out for the participants: each day is delivered to who the training is for. */
  const publish = (event: SipatEvent) => {
    if (!window.confirm(`Publicar "${event.title}"? Os participantes passam a ver os dias do treinamento.`)) return;
    void run(event, async () => {
      await launchSipat(event.id);
      setEvents(known => (known ?? []).map(item => (item.id === event.id ? { ...item, status: 'Published' } : item)));
      setNotice(`"${event.title}" foi publicado.`);
    });
  };

  /** Ended: it leaves the participants and the list (the filter shows it again), and can be brought back. */
  const end = (event: SipatEvent) => {
    if (!window.confirm(`Encerrar "${event.title}"? Ele sai da área dos participantes. O que já foi feito continua no histórico, e dá para reativar depois.`)) return;
    void run(event, async () => {
      const ended = await cancelSipatEvent(event.id);
      setEvents(known => (known ?? []).map(item => (item.id === ended.id ? ended : item)));
      setNotice(`"${ended.title}" foi encerrado. Para vê-lo de novo, escolha "Encerrado" no filtro.`);
    });
  };

  const remove = (event: SipatEvent) => {
    if (!window.confirm(`Excluir "${event.title}"? Os dias montados e a capa são apagados. Isso não pode ser desfeito.`)) return;
    void run(event, async () => {
      await deleteSipat(event.id);
      setEvents(known => (known ?? []).filter(item => item.id !== event.id));
      setNotice(`"${event.title}" foi excluído.`);
    });
  };

  const total = inScope.length;
  const filtered = query.trim() !== '' || phase !== 'all' || audience.size > 0;
  const showAll = () => { setQuery(''); setPhase('all'); setAudience(new Map()); };
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
      {registry && <AudienceFilter choice={audience} onChange={setAudience} registry={registry} />}
      {filtered && <Button onClick={showAll} size="sm" variant="ghost">Ver todos</Button>}
      <span aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground">
        {filtered ? `${shown.length} de ${pluralize(total, 'treinamento', 'treinamentos')}` : pluralize(total, 'treinamento', 'treinamentos')}
      </span>
    </div>}
    {total > 0 && shown.length === 0 && (phase === 'running' && query.trim() === '' && audience.size === 0
      ? <EmptyState action={<Button onClick={showAll} variant="outline">Ver todos os treinamentos</Button>} description="Os rascunhos, os publicados que ainda não começaram e os anteriores aparecem ao trocar o filtro." title="Nenhum treinamento em andamento." />
      : <EmptyState action={<Button onClick={showAll} variant="outline">Ver todos os treinamentos</Button>} description="Tente outro nome, outra fase ou outro setor." title="Nenhum treinamento encontrado." />)}

    {years.map(([year, items]) => <section aria-label={`Treinamentos de ${year}`} className="grid gap-3" key={year}>
      <h2 className="m-0 text-sm font-semibold tracking-wide text-muted-foreground">{year}</h2>
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
        {items.map(event => {
          const plan = summaryOf(event);
          const current = phaseOf(event);
          const cancelled = event.status === 'Cancelled';
          // an <img> cannot send the header that says which company the operation is in (also in the company's own screens, in operator mode): it loads the photo from its own route
          const cover = plan?.courseId && plan.coverVersion != null
            ? `${operator || getCompanyAdministrationId() ? '/api/platform/catalog' : '/api/admin/training-editor'}/courses/${plan.courseId}/cover?v=${plan.coverVersion}`
            : null;
          return <li key={event.id}>
            <TrainingCard
              audience={registry && (plan?.targets?.length ?? 0) > 0 ? audienceLabel(plan?.targets ?? [], registry) : null}
              busy={working === event.id}
              cover={cover}
              editLabel={viewOnly ? 'Ver no editor' : 'Editar treinamento'}
              ended={cancelled}
              live={current === 'published' || current === 'running'}
              onCover={!viewOnly && plan?.courseId ? image => void changeCover(event, image) : undefined}
              onDelete={viewOnly ? undefined : () => remove(event)}
              onDuplicate={viewOnly ? undefined : () => void duplicate(event)}
              onEdit={() => void edit(event)}
              onEnd={viewOnly || cancelled ? undefined : () => end(event)}
              onPublish={!viewOnly && current === 'created' ? () => publish(event) : undefined}
              onReactivate={!viewOnly && cancelled ? () => void reactivate(event) : undefined}
              onShare={event.status === 'Published' ? () => void share(event) : undefined}
              openTo={`${basePath}/${event.id}`}
              period={periodLabel(event.startsAt, event.endsAt)}
              phase={phaseLabel[current]}
              stats={plan && plan.days > 0
                ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}${plan.durationMilliseconds ? ` · ${runtime(plan.durationMilliseconds)}` : ''}`
                : 'Dias ainda não montados'}
              title={event.title}
            />
          </li>;
        })}
      </ul>
    </section>)}
  </Page>;
}
