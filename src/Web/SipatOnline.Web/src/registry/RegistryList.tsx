import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { RegistryItem } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

const peopleText = (count: number) => `${count} ${count === 1 ? 'pessoa' : 'pessoas'}`;

/** One registry list: rename inline, deactivate or reactivate; with `onAdd`, add one or many names too. */
export default function RegistryList({ title, description, idPrefix, items, onAdd, onChange }: {
  title: string;
  description?: string;
  idPrefix: string;
  items: RegistryItem[];
  onAdd?: (names: string[]) => Promise<void>;
  onChange: (item: RegistryItem, change: { name?: string; isActive?: boolean }) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const names = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const ordered = [...items.filter(item => item.isActive), ...items.filter(item => !item.isActive)];

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); return true; } catch (failure) { setError(getErrorMessage(failure)); return false; } finally { setBusy(false); }
  }

  const add = async () => { if (onAdd && await run(() => onAdd(names))) setText(''); };
  const save = async (item: RegistryItem) => {
    const name = draft.trim();
    if (name === item.name) { setEditingId(null); return; }
    if (await run(() => onChange(item, { name }))) setEditingId(null);
  };

  return <section aria-label={title} className="grid content-start gap-4 rounded-lg bg-card p-5 shadow-card">
    <h2 className="m-0 text-lg font-semibold">{title}</h2>
    {description && <p className="-mt-2 m-0 text-sm text-muted-foreground">{description}</p>}
    {onAdd && <><Field htmlFor={`add-${idPrefix}`} label="Cole um nome por linha">
      <Textarea id={`add-${idPrefix}`} onChange={event => setText(event.target.value)} rows={3} value={text} />
    </Field>
    <div><Button disabled={busy || names.length === 0} onClick={() => void add()}>Adicionar</Button></div></>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {ordered.length === 0
      ? <p className="m-0 text-sm text-muted-foreground">Nenhum item cadastrado ainda.</p>
      : <ul className="m-0 grid list-none gap-1 p-0">
        {ordered.map(item => <li className="flex min-h-12 flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" key={item.id}>
          {editingId === item.id
            ? <form className="flex min-w-0 flex-1 flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); void save(item); }}>
              <Input aria-label="Novo nome" autoFocus className="min-w-0 flex-1" onChange={event => setDraft(event.target.value)} value={draft} />
              <Button disabled={busy || !draft.trim()} size="sm" type="submit">Salvar</Button>
              <Button disabled={busy} onClick={() => { setEditingId(null); setError(''); }} size="sm" type="button" variant="outline">Cancelar</Button>
            </form>
            : <>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={item.isActive ? 'font-medium' : 'font-medium text-muted-foreground'}>{item.name}</span>
                {!item.isActive && <Badge variant="neutral">Desativado</Badge>}
                <span className="text-sm text-muted-foreground">{peopleText(item.peopleCount)}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button aria-label={`Ações de ${item.name}`} disabled={busy} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => { setEditingId(item.id); setDraft(item.name); setError(''); }}>Renomear</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void run(() => onChange(item, { isActive: !item.isActive }))}>
                    {item.isActive ? 'Desativar' : 'Reativar'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>}
        </li>)}
      </ul>}
  </section>;
}
