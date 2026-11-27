import { Copy, Gamepad2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { duplicateCompanyGame, setEditorScope, type GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import GameModuleForm from '@/courseCatalog/GameModuleForm';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { gameTypeLabel } from '@/courseEditor/courseTrack';

/**
 * A game opened from the board, with the same form as "Jogos e perguntas", by who owns it: a company edits its own
 * games, the operation (in a template) its own. A game of the operation in a company's training is in other trainings
 * too: it is duplicated for the company first, and the copy takes its place on the day.
 */
export default function GameDialog({ game, template, onClose, onSaved, onDuplicated }: {
  game: GameModule;
  /** A template of the operation: its games are the operation's own. */
  template: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
  /** The company's copy of the game, to put in its place. */
  onDuplicated: (copy: GameModule) => Promise<void> | void;
}) {
  const [current, setCurrent] = useState(game);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // while it is open the game's calls go to the routes of who owns it
  useEffect(() => {
    setEditorScope(template ? 'platform' : 'company');
    return () => setEditorScope('platform');
  }, [template]);
  const canEdit = template ? !current.tenantId : !!current.tenantId;

  if (canEdit) {
    return <Dialog busy={busy} onClose={onClose} size="lg" title="Editar jogo">
      <GameModuleForm module={current} onBusyChange={setBusy} onCancel={onClose}
        onSaved={async message => { await onSaved(message); onClose(); }} />
    </Dialog>;
  }

  async function duplicate() {
    setBusy(true); setError('');
    try {
      const copy = await duplicateCompanyGame(current.id);
      await onDuplicated(copy);
      // the copy is the company's: the form opens on it
      setCurrent(copy);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  return <Dialog busy={busy} description={`${gameTypeLabel(current)}${current.questions.length > 0 ? ` · ${pluralize(current.questions.length, 'pergunta', 'perguntas')}` : ''}`}
    onClose={onClose} title={current.title}>
    <div className="grid gap-3">
      <p className="m-0 flex items-start gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
        <Gamepad2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Este jogo é da operação e entra em outros treinamentos também. Para mudar os textos, faça uma cópia só da sua empresa: ela fica no lugar dele neste treinamento.
      </p>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    </div>
    <DialogActions>
      <Button onClick={onClose} variant="outline">Fechar</Button>
      <Button data-autofocus disabled={busy} onClick={() => void duplicate()}><Copy /> Duplicar e editar</Button>
    </DialogActions>
  </Dialog>;
}
