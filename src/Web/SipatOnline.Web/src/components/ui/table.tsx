import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-x-auto rounded-lg bg-card shadow-card" data-slot="table-container">
      <table className={cn('m-0 w-full caption-bottom border-collapse text-sm', className)} data-slot="table" {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border [&_tr]:hover:bg-transparent', className)} data-slot="table-header" {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} data-slot="table-body" {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/60 data-[state=selected]:bg-accent', className)} data-slot="table-row" {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-10 whitespace-nowrap bg-transparent px-4 text-left align-middle text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground',
        className,
      )}
      data-slot="table-head"
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} data-slot="table-cell" {...props} />;
}
