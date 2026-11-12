import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('m-0 text-[0.8125rem] font-semibold leading-snug text-foreground', className)}
      data-slot="label"
      {...props}
    />
  );
}

/** Rótulo + controle + dica + erro, com espaçamento padrão. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)} data-slot="field">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="m-0 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {error && <p className="m-0 text-xs font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

/** Interruptor acessível baseado em checkbox nativo. */
export function Switch({
  id,
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { id: string; label: ReactNode; description?: ReactNode }) {
  return (
    <label
      className={cn(
        'relative m-0 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3.5',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        className,
      )}
      htmlFor={id}
    >
      <input className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0" id={id} type="checkbox" {...props} />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-input transition-colors duration-200',
          'after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow-sm',
          'after:transition-transform after:duration-200 after:content-[""]',
          'peer-checked:bg-primary peer-checked:after:translate-x-4',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
        )}
      />
      <span className="grid gap-0.5">
        <strong className="text-sm font-semibold">{label}</strong>
        {description && <small className="text-[0.8125rem] text-muted-foreground">{description}</small>}
      </span>
    </label>
  );
}
