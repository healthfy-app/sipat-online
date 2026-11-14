import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { BrandThemeContext } from '@/branding';
import { cn } from '@/lib/utils';

const sizes = {
  sm: 'w-[min(26rem,calc(100vw-2rem))]',
  md: 'w-[min(32rem,calc(100vw-2rem))]',
  lg: 'w-[min(48rem,calc(100vw-2rem))]',
};

/**
 * Diálogo modal do design system (Radix Dialog, padrão shadcn/ui).
 * Renderize-o condicionalmente: montar abre, desmontar fecha e devolve o foco a quem o abriu.
 * Enquanto `busy`, Esc, clique fora e o botão de fechar ficam bloqueados.
 */
export function Dialog({
  title,
  description,
  onClose,
  busy = false,
  size = 'md',
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  size?: keyof typeof sizes;
  className?: string;
  children: ReactNode;
}) {
  const theme = useContext(BrandThemeContext);
  // o diálogo abre por estado (sem Trigger do Radix): guardamos quem tinha o foco para devolvê-lo ao fechar
  const [returnFocus] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => {
    if (returnFocus?.isConnected) returnFocus.focus();
  }, [returnFocus]);
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-[rgb(8_26_21/0.45)] backdrop-blur-[2px] animate-overlay-in"
          data-slot="dialog-overlay"
          style={theme}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden',
            'rounded-xl bg-card text-card-foreground shadow-overlay outline-none animate-dialog-in',
            sizes[size],
            className,
          )}
          data-slot="dialog"
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
              className={cn(
                '-mr-1.5 -mt-0.5 m-0 inline-grid size-8 min-h-8 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent p-0',
                'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              )}
              disabled={busy}
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 py-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Rodapé de ações do diálogo (Cancelar / Confirmar). */
export function DialogActions({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mt-2 flex flex-wrap justify-end gap-2 border-t border-border pt-4', className)}>{children}</div>;
}
