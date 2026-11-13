import { CalendarDays, Film, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSipatEvents, listSipatPlans, type SipatEvent, type SipatPlanSummary } from '@/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import { phaseLabel, sipatPhase } from './sipatPhase';

const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/** The SIPATs of a company, newest year first. A SIPAT is one week of training; only one is published at a time. */
export default function SipatsPage({ basePath }: { basePath: string }) {
  const [events, setEvents] = useState<SipatEvent[] | null>(null);
  const [plans, setPlans] = useState<SipatPlanSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    Promise.all([listSipatEvents(0, 100), listSipatPlans()])
      .then(([page, summaries]) => { if (current) { setEvents(page.items); setPlans(summaries); } })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, []);

  const years = useMemo(() => {
    const byYear = new Map<number, SipatEvent[]>();
    for (const event of events ?? []) {
      const year = new Date(event.startsAt).getUTCFullYear();
      byYear.set(year, [...(byYear.get(year) ?? []), event]);
    }
    return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  }, [events]);

  const create = <Link className={buttonVariants()} to={`${basePath}/nova`}><Plus /> Nova SIPAT</Link>;
  return <Page>
    <PageHeader actions={create} description="Cada SIPAT é uma semana de treinamento. Só uma fica publicada por vez; as dos anos anteriores continuam no histórico." eyebrow="Programação" title="SIPATs" />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {!events && !error && <LoadingState>Carregando as SIPATs...</LoadingState>}
    {events && events.length === 0 && <EmptyState action={<Link className={buttonVariants()} to={`${basePath}/nova`}>Criar a primeira SIPAT</Link>} description="Defina a data de início, quantos dias e o assunto de cada dia." title="Nenhuma SIPAT ainda." />}
    {years.map(([year, items]) => <section aria-label={`SIPATs de ${year}`} className="grid gap-3" key={year}>
      <h2 className="m-0 text-sm font-semibold tracking-wide text-muted-foreground">{year}</h2>
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {items.map(event => {
          const plan = plans.find(item => item.sipatEventId === event.id);
          const label = phaseLabel[sipatPhase(event, plan?.days ?? 0)];
          return <li key={event.id}>
            <Link aria-label={`Abrir ${event.title}`} className={cn('grid h-full gap-3 rounded-2xl border bg-card p-4 text-foreground no-underline shadow-card transition-shadow hover:shadow-card-hover',
              event.status === 'Published' && new Date(event.endsAt) > new Date() ? 'border-primary/40' : 'border-border')} to={`${basePath}/${event.id}`}>
              <div className="flex items-start justify-between gap-2">
                <strong className="text-base leading-snug">{event.title}</strong>
                <Badge variant={label.variant}>{label.text}</Badge>
              </div>
              <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays aria-hidden="true" className="size-4" />
                {dateFormat.format(new Date(event.startsAt))} a {dateFormat.format(new Date(new Date(event.endsAt).getTime() - 1))}
              </p>
              <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Film aria-hidden="true" className="size-4" />
                {plan && plan.days > 0 ? `${pluralize(plan.days, 'dia', 'dias')} · ${pluralize(plan.videos, 'vídeo', 'vídeos')}` : 'Dias ainda não montados'}
              </p>
            </Link>
          </li>;
        })}
      </ul>
    </section>)}
  </Page>;
}
