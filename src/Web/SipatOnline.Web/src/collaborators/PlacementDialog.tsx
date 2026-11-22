import { useState, type FormEvent } from 'react';
import { type RegistryItem } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';

const words = {
  unit: { title: 'Mudar unidade', label: 'Unidade', remove: 'Tirar a unidade' },
  sector: { title: 'Mudar setor', label: 'Setor', remove: 'Tirar o setor' },
};

/** Asks which unit (or sector) the chosen people go to — or whether to take them out of it. Only active items are offered. */
export default function PlacementDialog({ field, items, count, onClose, onConfirm }: {
  field: 'unit' | 'sector'; items: RegistryItem[]; count: number; onClose: () => void; onConfirm: (valueId: string | null) => Promise<void>;
}) {
  const text = words[field];
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await onConfirm(value === 'none' ? null : value); }
    catch (failure) { setError(getErrorMessage(failure)); setBusy(false); }
  }

  return <Dialog busy={busy} description={`Vale para ${pluralize(count, 'colaborador escolhido', 'colaboradores escolhidos')}.`} onClose={onClose} title={text.title}>
    <form className="grid gap-4" onSubmit={submit}>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <Field htmlFor="placement-value" label={text.label}>
        <NativeSelect data-autofocus id="placement-value" onChange={event => setValue(event.target.value)} value={value}>
          <option disabled value="">Escolha...</option>
          {items.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value="none">{text.remove}</option>
        </NativeSelect>
      </Field>
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || value === ''} type="submit">{busy ? 'Salvando...' : text.title}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
