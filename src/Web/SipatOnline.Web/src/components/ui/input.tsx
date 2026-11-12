import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const fieldControl = [
  'm-0 w-full min-w-0 rounded-md border border-border bg-card text-sm text-foreground',
  'placeholder:text-muted-foreground/80 transition-[border-color,box-shadow] duration-150',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/15',
];

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(fieldControl, 'h-9 min-h-9 px-3 py-0', 'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium', className)}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(fieldControl, 'min-h-20 px-3 py-2 leading-relaxed resize-y', className)}
      data-slot="textarea"
      {...props}
    />
  );
}

/**
 * Select nativo com o visual do sistema. Mantemos o <select> do navegador:
 * é acessível, funciona bem no celular e nos testes (selectOptions).
 */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        fieldControl,
        'h-9 min-h-9 cursor-pointer appearance-none bg-no-repeat py-0 pl-3 pr-9',
        'bg-[length:1rem] bg-[position:right_0.625rem_center]',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 16 16'%3E%3Cpath stroke='%2352635b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
        className,
      )}
      data-slot="select"
      {...props}
    />
  );
}
