import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Cabeçalho padrão das telas: título, descrição e ações à direita. */
export function PageHeader({
  title,
  description,
  eyebrow,
  badge,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)} data-slot="page-header">
      <div className="grid min-w-0 gap-1">
        {eyebrow && <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-[clamp(1.5rem,2.6vw,1.875rem)] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
          {badge}
        </div>
        {description && <p className="m-0 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
    </header>
  );
}

/** Página com largura e espaçamento padrão. */
export function Page({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 text-foreground', className)}>{children}</div>;
}

/** Estado vazio com mensagem e ação opcional. */
export function EmptyState({ title, description, action, className }: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid justify-items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center', className)}>
      <p className="m-0 font-semibold text-foreground">{title}</p>
      {description && <p className="m-0 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

/** Indicador numérico de resumo (ex.: total de participantes). */
export function Stat({ label, value, hint, className }: { label: ReactNode; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1 rounded-lg bg-card px-5 py-4 shadow-card', className)}>
      <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
      <strong className="text-2xl font-semibold tabular-nums tracking-tight">{value}</strong>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
