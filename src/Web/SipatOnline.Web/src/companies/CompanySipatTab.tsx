import { CalendarDays, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSipatPrograms, type SipatProgram } from '@/api';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';

/** First section of a company: the SIPAT programs the operator builds and applies to it. */
export default function CompanySipatTab({ companyId }: { companyId: string }) {
  const [programs, setPrograms] = useState<SipatProgram[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    listSipatPrograms()
      .then(result => { if (current) setPrograms(result); })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); });
    return () => { current = false; };
  }, []);

  const build = `/platform/companies/${companyId}/sipat/nova`;
  return <section aria-label="Construção SIPAT" className="grid gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="m-0 max-w-prose text-sm text-muted-foreground">
        Monte a programação de dias desta empresa e aplique à SIPAT dela. Os vídeos vêm do acervo.
      </p>
      <Link className={buttonVariants()} to={build}><Plus /> Construir SIPAT</Link>
    </div>
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {programs && programs.length === 0 && <EmptyState action={<Link className={buttonVariants()} to={build}>Construir a primeira SIPAT</Link>} title="Nenhuma SIPAT montada ainda." />}
    {programs && programs.length > 0 && <ul className="m-0 grid list-none gap-2 p-0">
      {programs.map(program => <li className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3 shadow-card" key={program.id}>
        <span aria-hidden="true" className="grid size-9 place-items-center rounded-md bg-accent text-accent-foreground"><CalendarDays className="size-4" /></span>
        <div className="grid min-w-0 flex-1">
          <strong className="truncate text-sm font-semibold">{program.title}</strong>
          <span className="text-xs text-muted-foreground">{pluralize(program.days.length, 'dia', 'dias')} · {pluralize(program.days.reduce((total, day) => total + day.videoIds.length, 0), 'vídeo', 'vídeos')}</span>
        </div>
        <Link aria-label={`Abrir ${program.title}`} className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))} to={`/platform/companies/${companyId}/sipat/${program.id}`}>Abrir</Link>
      </li>)}
    </ul>}
  </section>;
}
