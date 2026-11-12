/**
 * Componentes de administração com a API antiga, agora montados sobre o design system
 * (src/components/ui). As telas que ainda os importam herdam o visual novo sem mudar de código.
 */
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { PageHeader as UiPageHeader } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';

export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <UiPageHeader
      actions={actions}
      className="mb-1"
      description={(description || meta) ? (
        <span className="flex flex-wrap items-center gap-2">
          {description}
          {meta}
        </span>
      ) : undefined}
      eyebrow={eyebrow}
      title={title}
    />
  );
}

/** Tabela com o visual do design system; recebe <thead>/<tbody> crus como filhos. */
export function DataTable({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full overflow-x-auto rounded-lg bg-card shadow-card">
      <table
        aria-label={label}
        className={[
          'm-0 w-full border-collapse text-sm',
          '[&_thead_tr]:border-b [&_thead_tr]:border-border',
          '[&_th]:h-10 [&_th]:whitespace-nowrap [&_th]:bg-transparent [&_th]:px-4 [&_th]:text-left [&_th]:align-middle',
          '[&_th]:text-[0.6875rem] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-muted-foreground',
          '[&_tbody_tr]:border-b [&_tbody_tr]:border-border [&_tbody_tr:last-child]:border-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/60',
          '[&_td]:px-4 [&_td]:py-3 [&_td]:align-middle',
          className,
        ].join(' ')}
      >
        {children}
      </table>
    </div>
  );
}

const chipVariants = { success: 'success', warning: 'warning', neutral: 'neutral', danger: 'destructive' } as const;

export function StatusChip({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'neutral' | 'danger';
}) {
  return <Badge variant={chipVariants[variant]}>{children}</Badge>;
}

export function FilterBar({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={label}
      className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] items-end gap-3 rounded-lg bg-card p-4 shadow-card ${className}`.trim()}
      role="group"
    >
      {children}
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return <Sheet busy={busy} onClose={onClose} title={title}>{children}</Sheet>;
}
