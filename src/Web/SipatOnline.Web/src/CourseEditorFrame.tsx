import { useEffect, type ReactNode } from 'react';

export type CourseEditorStep = 'edit' | 'configure' | 'publish';

const stages: { id: CourseEditorStep; label: string }[] = [
  { id: 'edit', label: 'Editar' },
  { id: 'configure', label: 'Configurar' },
  { id: 'publish', label: 'Publicar' },
];

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
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty && !busy) return;
      event.preventDefault();
      event.returnValue = '';
    }
    function guardLink(event: MouseEvent) {
      if (!(event.target instanceof Element) || !event.target.closest('a[href]') || (!dirty && !busy)) return;
      if (busy || !window.confirm('Há alterações não salvas. Deseja sair sem salvar?')) {
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
    <div className="course-editor">
      <header className="course-editor-toolbar">
        <button className="button button-quiet" disabled={busy} onClick={() => {
          if (!dirty || window.confirm('Há alterações não salvas. Deseja sair sem salvar?')) onBack();
        }} type="button">← Voltar ao conteúdo</button>
        <nav aria-label="Etapas do curso" className="course-editor-stages">
          {stages.map((stage, index) => (
            <button aria-current={step === stage.id ? 'step' : undefined} disabled={busy} key={stage.id}
              onClick={() => onStep(stage.id)} type="button">
              <span aria-hidden="true">{index + 1}</span>{stage.label}
            </button>
          ))}
        </nav>
        <div className="course-editor-save">
          <span aria-live="polite">{busy ? 'Salvando...' : dirty ? 'Alterações não salvas' : 'Salvo'}</span>
          <button className="button button-secondary" disabled={busy || !dirty} onClick={onSave} type="button">Salvar</button>
          {step !== 'publish' && <button className="button course-primary" disabled={busy}
            onClick={() => onStep(step === 'edit' ? 'configure' : 'publish')} type="button">
            Próximo: {step === 'edit' ? 'Configurar' : 'Publicar'} →
          </button>}
        </div>
      </header>
      {children}
    </div>
  );
}
