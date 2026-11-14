import { Gamepad2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import type { GameModule } from '../api';
import { gameTypeLabel } from './courseTrack';

/** Escolha rápida de um jogo/quiz para encaixar na trilha, com um clique. */
export default function AddActivityDialog({
  modules,
  position,
  busy,
  error,
  onPick,
  onClose,
}: {
  modules: GameModule[];
  /** 0 = antes do primeiro vídeo; N = depois do vídeo N */
  position: number;
  busy: boolean;
  error: string;
  onPick: (moduleId: string) => void;
  onClose: () => void;
}) {
  return (
    <Dialog onClose={onClose} size="md" title="Adicionar atividade">
      <p className="m-0 mb-4 text-sm leading-relaxed text-muted-foreground">
        {position === 0
          ? 'A atividade aparece antes do primeiro vídeo.'
          : `A atividade aparece logo depois do vídeo ${position}. A pessoa joga e segue; nada bloqueia o curso.`}
      </p>
      {error && <p className="m-0 mb-3 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      {modules.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Ainda não há jogos ou quizzes na biblioteca. Crie um na aba "Jogos e perguntas" do catálogo.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {modules.map((module) => (
            <li key={module.id}>
              <button
                className="m-0 flex min-h-0 w-full cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent disabled:cursor-default disabled:opacity-50"
                disabled={busy}
                onClick={() => onPick(module.id)}
                type="button"
              >
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-primary">
                  <Gamepad2 className="size-5" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <strong className="truncate text-sm">{module.title}</strong>
                  <span className="text-xs text-muted-foreground">{gameTypeLabel(module)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
