import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CourseEditorStep = 'edit' | 'configure' | 'publish';

const stages: { id: CourseEditorStep; label: string }[] = [
  { id: 'edit', label: 'Editar' },
  { id: 'configure', label: 'Configurar' },
  { id: 'publish', label: 'Publicar' },
];

const leaveMessage = 'Há alterações não salvas. Deseja sair sem salvar?';

/**
 * Moldura em tela cheia do editor (padrão Mitti): barra de 64px com Voltar,
 * etapas Editar → Configurar → Publicar e o estado de salvamento.
 */
export default function CourseEditorFrame({
  step, onStep, dirty, busy, onBack, onSave, children,
}: {
  step: CourseEditorStep;
  onStep: (step: CourseEditorStep) => void;
  dirty: boolean;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  const activeIndex = stages.findIndex((stage) => stage.id === step);
  const nextStage = stages[activeIndex + 1];

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function guardLink(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]') || (!dirty && !busy)) return;
      if (busy || !window.confirm(leaveMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty, busy]);

  return (
    <div
      className={cn(
        'course-editor fixed inset-0 z-[15] grid grid-rows-[4rem_minmax(0,1fr)] overflow-hidden bg-background pt-1 text-foreground',
        'max-[1180px]:grid-rows-[4rem_auto] max-[1180px]:overflow-y-auto max-[860px]:grid-rows-[auto_auto]',
      )}
      data-course-editor=""
    >
      <header
        className={cn(
          'sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-border bg-card px-3',
          'max-[860px]:grid-cols-[minmax(0,1fr)_auto] max-[860px]:gap-y-1 max-[860px]:py-2',
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            className="group m-0 inline-flex min-h-0 cursor-pointer items-center gap-2.5 whitespace-nowrap border-0 bg-transparent p-0 text-sm font-semibold text-foreground disabled:cursor-default disabled:opacity-60"
            disabled={busy}
            onClick={() => { if (!dirty || window.confirm(leaveMessage)) onBack(); }}
            type="button"
          >
            <span className="inline-grid size-8 place-items-center rounded-md border border-border bg-card text-primary transition-colors group-hover:bg-accent">←</span>{' '}
            <span className="max-[520px]:sr-only">Voltar ao conteúdo</span>
          </button>
        </div>

        <nav aria-label="Etapas do curso" className="flex items-start gap-6 max-[860px]:col-span-full max-[860px]:row-start-2 max-[860px]:justify-center">
          {stages.map((stage, index) => {
            const current = step === stage.id;
            const done = index < activeIndex;
            return (
              <button
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'relative m-0 flex min-h-0 min-w-[4.5rem] cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent px-0 py-1 text-sm text-muted-foreground',
                  'hover:text-foreground disabled:cursor-default',
                  // linha que liga as etapas
                  index < stages.length - 1 && "after:absolute after:left-[calc(50%+0.75rem)] after:top-3 after:h-px after:w-full after:bg-border after:content-['']",
                  done && 'after:bg-primary',
                  current && 'font-semibold text-primary hover:text-primary',
                )}
                disabled={busy}
                key={stage.id}
                onClick={() => onStep(stage.id)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-4 place-items-center rounded-full bg-border text-[0.625rem] font-bold text-transparent transition-[background-color,transform] duration-200',
                    (done || current) && 'bg-primary text-primary-foreground',
                    current && 'scale-110 shadow-[0_0_0_4px_var(--green-soft)]',
                  )}
                >
                  {index + 1}
                </span>
                <span>{stage.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <span
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground before:size-2 before:rounded-full before:bg-primary before:content-[''] max-[860px]:hidden",
              dirty && !busy && 'text-warning before:bg-[#d9a900]',
              busy && 'before:animate-pulse',
            )}
          >
            {busy ? 'Salvando...' : dirty ? 'Alterações não salvas' : 'Salvo'}
          </span>
          <Button disabled={busy || !dirty} onClick={onSave} size="sm" variant="outline">Salvar</Button>
          {nextStage && (
            <Button disabled={busy} onClick={() => onStep(nextStage.id)} size="sm">
              Próximo: {nextStage.label} →
            </Button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
