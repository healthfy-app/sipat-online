import { useState } from 'react';
import { Gamepad2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import type { GameModule } from '../api';
import GameModuleForm from '../courseCatalog/GameModuleForm';
import { gameTypeLabel } from './courseTrack';

/**
 * Escolha rápida de um jogo/quiz para encaixar na sequência, com um clique. Um jogo novo é criado aqui mesmo
 * e já entra na posição escolhida, sem sair do editor.
 */
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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  if (creating) {
    return (
      <Dialog onClose={saving ? () => undefined : onClose} size="lg" title="Novo jogo">
        <p className="m-0 mb-4 text-sm leading-relaxed text-muted-foreground">
          {position === 0
            ? 'Ao salvar, o jogo entra antes do primeiro vídeo.'
            : `Ao salvar, o jogo entra logo depois do vídeo ${position}.`}
        </p>
        <GameModuleForm
          module={null}
          onBusyChange={setSaving}
          onCancel={() => setCreating(false)}
          onSaved={(_message, saved) => {
            // back to the list, where an error of the placement would show
            setCreating(false);
            onPick(saved.id);
          }}
        />
      </Dialog>
    );
  }

  return (
    <Dialog onClose={onClose} size="md" title="Adicionar atividade">
      <p className="m-0 mb-4 text-sm leading-relaxed text-muted-foreground">
        {position === 0
          ? 'A atividade aparece antes do primeiro vídeo.'
          : `A atividade aparece logo depois do vídeo ${position}. A pessoa joga e segue; nada bloqueia o assunto.`}
      </p>
      {error && <p className="m-0 mb-3 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      {modules.length === 0 ? (
        <p className="m-0 mb-3 rounded-md border border-dashed border-input p-4 text-sm text-muted-foreground">
          Ainda não há jogos ou quizzes. Crie o primeiro aqui mesmo.
        </p>
      ) : (
        <ul className="m-0 mb-3 grid list-none gap-2 p-0">
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
      <Button className="w-full" disabled={busy} onClick={() => setCreating(true)} variant="outline">
        <Plus /> Criar jogo
      </Button>
    </Dialog>
  );
}
