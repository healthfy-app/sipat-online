import { CalendarDays, Film, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCompanyCapabilities, listSipatEvents, listSipatPlans, reactivateSipatEvent, type SipatEvent, type SipatPlanSummary } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { getCourseCover } from '@/courseCover';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import { phaseLabel, sipatPhase } from './sipatPhase';

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

/** The trainings of a company, newest year first. Several can be published at the same time. */
/** `operator`: the operation, inside a company. On a plan that only views (Bronze) it is the one that builds the trainings. */
export default function SipatsPage({ basePath, operator = false }: { basePath: string; operator?: boolean }) {
  const [viewOnly, setViewOnly] = useState(false);
  const [events, setEvents] = useState<SipatEvent[] | null>(null);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reactivating, setReactivating] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    if (!operator) getCompanyCapabilities().then(capabilities => { if (current) setViewOnly(!capabilities.customizeGrid); }, () => undefined);
    Promise.all([listSipatEvents(0, 100), listSipatPlans()])
      .then(([page, summaries]) => { if (current) { setEvents(page.items); setPlans(summaries); } })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, [operator]);

  const years = useMemo(() => {
    const byYear = new Map<number, SipatEvent[]>();
    for (const event of events ?? []) {
      const year = new Date(event.startsAt).getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), event]);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [events]);

  async function reactivate(event: SipatEvent) {
    setReactivating(event.id); setError(''); setNotice('');
    try {
      const back = await reactivateSipatEvent(event.id);
      setEvents(known => (known ?? []).map(item => (item.id === back.id ? back : item)));
      setNotice(`"${back.title}" voltou como rascunho. Abra, confira os dias e publique de novo.`);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setReactivating(null); }
  }

  const create = viewOnly ? undefined : <Link className={buttonVariants()} to={`${basePath}/nova`}><Plus /> Novo treinamento</Link>;
  return <Page>
    <PageHeader actions={create} description="Cada treinamento tem os seus dias ou módulos. Vários podem estar publicados ao mesmo tempo; os anteriores continuam no histórico." eyebrow="Programação" title="Treinamentos" />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {!events && !error && <LoadingState>Carregando os treinamentos...</LoadingState>}
    {events && events.length === 0 && (viewOnly
      ? <EmptyState description="No seu plano a operação monta o treinamento. Quando ele estiver pronto, aparece aqui." title="Nenhum treinamento ainda." />
      : <EmptyState action={<Link className={buttonVariants()} to={`${basePath}/nova`}>Criar o primeiro treinamento</Link>} description="Defina a data de início, quantos dias e o assunto de cada dia." title="Nenhum treinamento ainda." />)}
    {years.map(([year, items]) => <section aria-label={`Treinamentos de ${year}`} className="grid gap-3" key={year}>
      <h2 className="m-0 text-sm font-semibold tracking-wide text-muted-foreground">{year}</h2>
      <ul className="m-0 grid list-none gap-5 p-0 md:grid-cols-2 xl:grid-cols-3">
        {items.map(event => {
          const plan = plans.find(item => item.sipatEventId === event.id);
          const label = phaseLabel[sipatPhase(event, plan?.days ?? 0)];
          const cancelled = event.status === 'Cancelled';
          // same card as Conteúdo: cover on top, phase over it, period and days below
          const details = <>
            <div className="relative aspect-video overflow-hidden bg-[#12332c] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-1/3 after:bg-gradient-to-t after:from-[rgb(11_36_31/0.45)] after:to-transparent after:content-['']">
              <img alt="" className="block size-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03] motion-reduce:group-hover:scale-100" decoding="async" loading="lazy" src={getCourseCover(event.title)} />
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
                {plan && plan.days > 0 ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}` : 'Dias ainda não montados'}
              </p>
            </div>
          </>;
          const card = 'group relative flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border bg-card';
          return <li key={event.id}>
            {cancelled
              ? <div aria-disabled="true" aria-label={`${event.title} (encerrada)`} className={cn(card, 'border-dashed border-border bg-muted/40 text-muted-foreground')} role="group">
                <div className="flex flex-1 flex-col opacity-60 grayscale">{details}</div>
                {!viewOnly && <footer className="mt-1 border-t border-[#dfe6e3] px-4 py-3">
                  <Button disabled={reactivating === event.id} onClick={() => void reactivate(event)} size="sm" variant="outline">
                    <RotateCcw /> {reactivating === event.id ? 'Reativando...' : 'Reativar'}
                  </Button>
                </footer>}
              </div>
              : <Link aria-label={`Abrir ${event.title}`} className={cn(card, 'text-foreground no-underline shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-[box-shadow,transform,border-color] duration-200 ease-out-soft hover:-translate-y-1 hover:border-[#12332c] hover:shadow-[0_18px_34px_-18px_rgb(18_51_44/0.5)] motion-reduce:hover:translate-y-0',
                event.status === 'Published' && new Date(event.endsAt) > new Date() ? 'border-primary/40' : 'border-[#dfe6e3]')} to={`${basePath}/${event.id}`}>
                {details}
                <footer className="mt-1 border-t border-[#dfe6e3] px-4 py-3">
                  <span aria-hidden="true" className="inline-block whitespace-nowrap rounded-full bg-[#12332c] px-3.5 py-1.5 text-[0.8125rem] font-bold text-white transition-colors group-hover:bg-[#0f7a3d]">Abrir →</span>
                </footer>
              </Link>}
          </li>;
        })}
      </ul>
    </section>)}
  </Page>;
}
