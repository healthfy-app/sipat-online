import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('grid min-w-0 gap-5', className)} data-slot="tabs" {...props} />;
}

/** Abas sublinhadas (estilo do Mitti): uma linha fina com o indicador da aba ativa. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex min-w-0 gap-6 overflow-x-auto border-b border-border [scrollbar-width:none]', className)}
      data-slot="tabs-list"
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative m-0 inline-flex min-h-0 shrink-0 cursor-pointer items-center gap-2 border-0 bg-transparent px-0 pb-3 pt-2.5',
        'text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:text-foreground',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:rounded-t-sm after:bg-primary',
        'after:transition-transform after:duration-200 after:content-[""]',
        'data-[state=active]:text-foreground data-[state=active]:after:scale-x-100',
        'focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('grid min-w-0 gap-4 outline-none', className)} data-slot="tabs-content" {...props} />;
}

export function TabCount({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'min-w-6 rounded-full bg-muted px-1.5 py-px text-center text-xs tabular-nums text-muted-foreground',
        '[[data-state=active]_&]:bg-accent [[data-state=active]_&]:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}
