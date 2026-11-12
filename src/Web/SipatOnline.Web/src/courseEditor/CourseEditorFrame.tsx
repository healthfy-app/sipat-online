import { useEffect, type ReactNode } from 'react';
import './CourseEditor.css';

export type CourseEditorStep = 'edit' | 'configure' | 'publish';

const stages: { id: CourseEditorStep; label: string }[] = [
  { id: 'edit', label: 'Editar' },
  { id: 'configure', label: 'Configurar' },
  { id: 'publish', label: 'Publicar' },
];

const leaveMessage = 'Há alterações não salvas. Deseja sair sem salvar?';

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
  const saveState = busy ? 'Salvando...' : dirty ? 'Alterações não salvas' : 'Salvo';

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
    <div className="course-editor">
      <header className="ce-toolbar">
        <div className="ce-toolbar-start">
          <button className="ce-back" disabled={busy} type="button"
            onClick={() => { if (!dirty || window.confirm(leaveMessage)) onBack(); }}>
            <span className="ce-icon-box">←</span> <span className="ce-back-label">Voltar ao conteúdo</span>
          </button>
        </div>

        <nav aria-label="Etapas do curso" className="ce-stages">
          {stages.map((stage, index) => (
            <button
              aria-current={step === stage.id ? 'step' : undefined}
              className={`ce-stage${step === stage.id ? ' is-current' : ''}${index < activeIndex ? ' is-done' : ''}`}
              disabled={busy}
              key={stage.id}
              onClick={() => onStep(stage.id)}
              type="button"
            >
              <span aria-hidden="true" className="ce-stage-dot">{index + 1}</span>
              <span className="ce-stage-label">{stage.label}</span>
            </button>
          ))}
        </nav>

        <div className="ce-toolbar-end">
          <span aria-live="polite" className={`ce-save-state${dirty && !busy ? ' is-dirty' : ''}${busy ? ' is-busy' : ''}`}>
            {saveState}
          </span>
          <button className="ce-btn" disabled={busy || !dirty} onClick={onSave} type="button">Salvar</button>
          {nextStage && (
            <button className="ce-btn ce-btn-primary" disabled={busy} onClick={() => onStep(nextStage.id)} type="button">
              Próximo: {nextStage.label} →
            </button>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
