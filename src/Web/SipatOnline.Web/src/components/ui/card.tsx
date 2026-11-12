import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col rounded-lg bg-card text-card-foreground shadow-card', className)} data-slot="card" {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-1 border-b border-border px-5 py-4', className)} data-slot="card-header" {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('m-0 text-base font-semibold leading-snug', className)} data-slot="card-title" {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('m-0 text-[0.8125rem] leading-relaxed text-muted-foreground', className)} data-slot="card-description" {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('grid gap-4 px-5 py-4', className)} data-slot="card-content" {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mt-auto flex flex-wrap items-center gap-2 border-t border-border px-5 py-3.5', className)} data-slot="card-footer" {...props} />;
}
