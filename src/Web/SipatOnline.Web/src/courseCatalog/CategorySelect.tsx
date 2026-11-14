import { useState } from 'react';
import type { CourseCategory } from '@/api';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

const CREATE = '__create__';

/**
 * The category of a subject: pick one of the list, none, or create a new one right here.
 * Creating is offered as the last choice, so nobody has to know there is a separate place to register categories.
 */
export default function CategorySelect({
  id,
  categories,
  value,
  disabled,
  onChange,
  onCreate,
}: {
  id: string;
  categories: CourseCategory[];
  value: string | null;
  disabled?: boolean;
  onChange: (categoryId: string | null) => void;
  onCreate: (name: string) => Promise<CourseCategory>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!name.trim()) { setError('Informe o nome da categoria.'); return; }
    setBusy(true);
    setError('');
    try {
      const category = await onCreate(name.trim());
      onChange(category.id);
      setCreating(false);
      setName('');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <NativeSelect
        disabled={disabled || busy}
        id={id}
        onChange={(event) => {
          if (event.target.value === CREATE) { setCreating(true); return; }
          setCreating(false);
          onChange(event.target.value || null);
        }}
        value={creating ? CREATE : value ?? ''}
      >
        <option value="">Sem categoria</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        <option value={CREATE}>＋ Criar categoria…</option>
      </NativeSelect>
      {creating && (
        <div className="grid gap-1.5">
          <div className="flex gap-2">
            <Input
              aria-label="Nome da nova categoria"
              autoFocus
              disabled={busy}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void create(); } }}
              placeholder="Ex.: Ergonomia"
              value={name}
            />
            <Button disabled={busy} onClick={() => void create()} type="button">{busy ? 'Criando...' : 'Criar'}</Button>
            <Button disabled={busy} onClick={() => { setCreating(false); setName(''); setError(''); }} type="button" variant="outline">Cancelar</Button>
          </div>
          {error && <p className="m-0 text-sm font-medium text-destructive" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
