import { Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteGameModule, duplicateCompanyGame, listGameModules, setEditorScope, type GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import GameModuleForm from './GameModuleForm';
import GameModulesPanel from './GameModulesPanel';

/**
 * The games and questions of a company, in its Conteúdos: the ones it made (its own, private to it), which it changes
 * and deletes, and the operation's, which it uses as they are or duplicates to change a copy.
 */
export default function CompanyGamesTab() {
  const [modules, setModules] = useState<GameModule[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ module: GameModule | null } | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);

  const load = useCallback(() => listGameModules().then(setModules, (failure: unknown) => setError(getErrorMessage(failure))), []);
  // while this tab is open every game call (the list, the form, its pictures) goes to the company's own routes
  useEffect(() => {
    setEditorScope('company');
    void load();
    return () => setEditorScope('platform');
  }, [load]);

  const shown = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('pt-BR');
    return (modules ?? []).filter(module => !text || module.title.toLocaleLowerCase('pt-BR').includes(text));
  }, [modules, query]);

  async function run(action: () => Promise<string>) {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await action()); await load(); } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }

  const remove = (module: GameModule) => {
    const usage = module.usageCount > 0 ? ` Ele está em ${pluralize(module.usageCount, 'treinamento', 'treinamentos')} e sairá desses treinamentos.` : '';
    if (!window.confirm(`Remover o jogo "${module.title}"?${usage}`)) return;
    void run(async () => { await deleteGameModule(module.id); return `O jogo "${module.title}" foi removido.`; });
  };
  const duplicate = (module: GameModule) => void run(async () => {
    const copy = await duplicateCompanyGame(module.id);
    return `"${copy.title}" é um jogo da sua empresa agora. Edite como quiser.`;
  });

  const total = modules?.length ?? 0;
  return <div className="grid gap-4">
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {!modules && !error && <LoadingState>Carregando os jogos...</LoadingState>}
    {modules && <div className="flex flex-wrap items-center gap-2.5" role="search">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-md">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar jogo" className="pl-9" onChange={event => setQuery(event.target.value)} placeholder="Buscar jogo por nome" type="search" value={query} />
      </label>
      <span aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground">
        {query.trim() ? `${shown.length} de ${pluralize(total, 'jogo', 'jogos')}` : pluralize(total, 'jogo', 'jogos')}
      </span>
      <Button onClick={() => setDialog({ module: null })}><Plus /> Novo jogo</Button>
    </div>}
    {modules && <GameModulesPanel
      busy={busy}
      canChange={module => !!module.tenantId}
      hasModules={total > 0}
      modules={shown}
      onClearFilters={() => setQuery('')}
      onCreate={() => setDialog({ module: null })}
      onDelete={remove}
      onDuplicate={duplicate}
      onEdit={module => setDialog({ module })}
      ownerLabel={module => (module.tenantId ? null : 'Da operação')}
    />}

    {dialog && <Dialog busy={dialogBusy} onClose={() => setDialog(null)} size="lg" title={dialog.module ? 'Editar jogo' : 'Novo jogo'}>
      <GameModuleForm
        module={dialog.module}
        onBusyChange={setDialogBusy}
        onCancel={() => setDialog(null)}
        onSaved={async (message) => { setDialog(null); setNotice(message); await load(); }}
      />
    </Dialog>}
  </div>;
}
