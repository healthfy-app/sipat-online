import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent',
    'm-0 font-semibold leading-none no-underline select-none cursor-pointer',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    'active:not-disabled:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ],
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-border bg-card text-foreground hover:border-accent-foreground/25 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-border/60',
        ghost: 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'border-border bg-card text-destructive hover:border-destructive/30 hover:bg-destructive-soft',
        link: 'h-auto min-h-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 min-h-9 px-4 text-sm',
        sm: 'h-8 min-h-8 px-3 text-[0.8125rem]',
        lg: 'h-11 min-h-11 px-5 text-[0.9375rem]',
        icon: 'size-9 min-h-9 p-0',
        'icon-sm': 'size-8 min-h-8 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      data-slot="button"
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    />
  );
}
