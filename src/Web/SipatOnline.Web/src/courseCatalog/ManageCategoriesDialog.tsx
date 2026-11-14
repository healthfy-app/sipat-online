import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { createCourseCategory, deleteCourseCategory, renameCourseCategory, type CourseCategory } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';

/** The list of categories of the library: add, rename and remove. Removing one only unplaces its subjects. */
export default function ManageCategoriesDialog({
  categories,
  onChanged,
  onClose,
}: {
  categories: CourseCategory[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newName.trim()) return;
    await run(async () => { await createCourseCategory(newName.trim()); setNewName(''); });
  }

  async function rename() {
    if (!editing || !editing.name.trim()) return;
    await run(async () => { await renameCourseCategory(editing.id, editing.name.trim()); setEditing(null); });
  }

  async function remove(category: CourseCategory) {
    const usage = category.courseCount > 0
      ? ` ${pluralize(category.courseCount, 'assunto fica', 'assuntos ficam')} sem categoria.`
      : '';
    if (!window.confirm(`Excluir a categoria "${category.name}"?${usage}`)) return;
    await run(() => deleteCourseCategory(category.id));
  }

  return (
    <Dialog busy={busy} onClose={onClose} title="Categorias da biblioteca">
      <div className="grid gap-4">
        <p className="m-0 text-sm text-muted-foreground">
          Agrupam os assuntos da biblioteca (Alimentação, Postura...). Excluir uma categoria não apaga os assuntos.
        </p>
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        <ul aria-label="Categorias" className="m-0 grid list-none gap-2 p-0">
          {categories.map((category) => (
            <li className="flex items-center gap-2 rounded-xl border border-border px-3 py-2" key={category.id}>
              {editing?.id === category.id ? (
                <>
                  <Input
                    aria-label={`Novo nome de ${category.name}`}
                    autoFocus
                    disabled={busy}
                    maxLength={80}
                    onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void rename(); } if (event.key === 'Escape') setEditing(null); }}
                    value={editing.name}
                  />
                  <Button aria-label="Salvar nome" disabled={busy} onClick={() => void rename()} size="icon-sm" variant="ghost"><Check /></Button>
                  <Button aria-label="Cancelar edição" disabled={busy} onClick={() => setEditing(null)} size="icon-sm" variant="ghost"><X /></Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate font-semibold">{category.name}</span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{pluralize(category.courseCount, 'assunto', 'assuntos')}</span>
                  <Button aria-label={`Renomear ${category.name}`} disabled={busy} onClick={() => setEditing({ id: category.id, name: category.name })} size="icon-sm" variant="ghost"><Pencil /></Button>
                  <Button aria-label={`Excluir ${category.name}`} disabled={busy} onClick={() => void remove(category)} size="icon-sm" variant="ghost"><Trash2 /></Button>
                </>
              )}
            </li>
          ))}
          {categories.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma categoria ainda.</li>}
        </ul>

        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <Input aria-label="Nova categoria" disabled={busy} maxLength={80} onChange={(event) => setNewName(event.target.value)} placeholder="Nova categoria" value={newName} />
          <Button disabled={busy || !newName.trim()} type="submit"><Plus /> Adicionar</Button>
        </form>
      </div>
    </Dialog>
  );
}
