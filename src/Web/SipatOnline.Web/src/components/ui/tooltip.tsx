import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Shares the delay among the tooltips inside it: after one opens, the next opens at once and without animation. */
export function TooltipProvider({ delayDuration = 250, skipDelayDuration = 400, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={skipDelayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * A small card anchored to its trigger. It grows out of the trigger (transform origin from Radix) with a short
 * fade and scale; when it opens instantly (another tooltip was just open) it does not animate.
 */
export function TooltipContent({ className, sideOffset = 8, children, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          'z-50 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-overlay',
          'origin-(--radix-tooltip-content-transform-origin) data-[state=delayed-open]:animate-tooltip-in',
          className,
        )}
        data-slot="tooltip"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
