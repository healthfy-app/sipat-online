import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { BrandThemeContext } from '@/branding';
import { cn } from '@/lib/utils';

/**
 * Painel lateral (drawer) do design system, para formulários mais longos.
 * Mesmo comportamento do Dialog: monta aberto, devolve o foco e bloqueia o fechamento enquanto `busy`.
 */
export function Sheet({
  title,
  description,
  onClose,
  busy = false,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const theme = useContext(BrandThemeContext);
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => { if (returnFocus?.isConnected) returnFocus.focus(); }, [returnFocus]);

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(8_26_21/0.4)] animate-overlay-in" style={theme} />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-[min(30rem,100vw)] flex-col bg-card text-card-foreground shadow-overlay outline-none',
            'animate-[sheet-in_240ms_cubic-bezier(0.16,1,0.3,1)]',
            className,
          )}
          data-slot="sheet"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onInteractOutside={(event) => { if (busy) event.preventDefault(); }}
          onOpenAutoFocus={(event) => {
            const target = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('[data-autofocus]');
            if (target) { event.preventDefault(); target.focus(); }
          }}
          style={theme}
        >
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="grid gap-1">
              <DialogPrimitive.Title className="m-0 text-lg font-semibold leading-snug tracking-tight">{title}</DialogPrimitive.Title>
              {description
                ? <DialogPrimitive.Description className="m-0 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
                : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close
              aria-label={`Fechar ${title.toLowerCase()}`}
              className="m-0 inline-grid size-8 min-h-8 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={busy}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
