import { MoreHorizontal, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { CompanyRegistry, RegistryItem } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';

const people = (count: number) => pluralize(count, 'pessoa', 'pessoas');
/** Several names at once: one per line, or separated by ";" (a column pasted from a sheet). */
const namesOf = (text: string) => text.split(/[\r\n;]+/).map(name => name.trim()).filter(Boolean);

/** A line to type a name and press Enter; the button shows only once there is something to add. */
function AddLine({ label, placeholder, busy, suggestions, onAdd }: {
  label: string; placeholder: string; busy: boolean; suggestions?: string[]; onAdd: (names: string[]) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const listId = suggestions ? `suggest-${label.replace(/\s+/g, '-')}` : undefined;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const names = namesOf(text);
    if (names.length > 0 && await onAdd(names)) setText('');
  }
  return <form className="flex min-w-0 items-center gap-2" onSubmit={submit}>
    <Input aria-label={label} className="min-w-0 flex-1" disabled={busy} list={listId} onChange={event => setText(event.target.value)}
      onPaste={event => {
        // a column copied from a sheet comes with line breaks, which a one-line field would glue together
        const pasted = event.clipboardData.getData('text');
        if (/[\r\n]/.test(pasted)) { event.preventDefault(); setText(current => [current, ...namesOf(pasted)].filter(Boolean).join('; ')); }
      }}
      placeholder={placeholder} value={text} />
    {listId && <datalist id={listId}>{suggestions!.map(name => <option key={name} value={name} />)}</datalist>}
    {namesOf(text).length > 0 && <Button disabled={busy} size="sm" type="submit">{namesOf(text).length > 1 ? `Adicionar ${namesOf(text).length}` : 'Adicionar'}</Button>}
  </form>;
}

/**
 * The company as it is organized: each unit, with its sectors inside. A unit is made first; its sectors are made in it.
 * The same sector name in two units is one sector of the company (so "the HR of the whole company" can be read), seen
 * in each unit it exists in.
 */
export default function UnitTree({ registry, onAddUnits, onAddSectors, onRemoveSector, onChangeUnit }: {
  registry: CompanyRegistry;
  onAddUnits: (names: string[]) => Promise<void>;
  onAddSectors: (unit: RegistryItem, names: string[]) => Promise<void>;
  onRemoveSector: (unit: RegistryItem, sector: RegistryItem) => Promise<void>;
  onChangeUnit: (unit: RegistryItem, change: { name?: string; isActive?: boolean }) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  async function run(action: () => Promise<void>) {
    setBusy(true); setError('');
    try { await action(); return true; } catch (failure) { setError(getErrorMessage(failure)); return false; } finally { setBusy(false); }
  }

  const units = [...registry.units.filter(unit => unit.isActive), ...registry.units.filter(unit => !unit.isActive)];
  const links = registry.unitSectors ?? [];
  const sectorsOf = (unitId: string) => links.filter(link => link.unitId === unitId)
    .flatMap(link => { const sector = registry.sectors.find(item => item.id === link.sectorId); return sector ? [{ sector, count: link.peopleCount }] : []; })
    .sort((a, b) => a.sector.name.localeCompare(b.sector.name, 'pt-BR'));

  return <section aria-label="Unidades e setores" className="grid content-start gap-4 rounded-lg bg-card p-5 shadow-card">
    <div className="grid gap-1">
      <h2 className="m-0 text-lg font-semibold">Unidades e setores</h2>
      <p className="m-0 text-sm text-muted-foreground">Crie a unidade e, dentro dela, os setores que ela tem. Cada colaborador fica em uma unidade e em um setor dela.</p>
    </div>
    <AddLine busy={busy} label="Nova unidade" onAdd={names => run(() => onAddUnits(names))} placeholder="Nova unidade (ex.: Minas Gerais) e Enter" />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {units.length === 0
      ? <p className="m-0 text-sm text-muted-foreground">Nenhuma unidade ainda. Comece criando a primeira.</p>
      : <ul className="m-0 grid list-none gap-3 p-0">
        {units.map(unit => {
          const own = sectorsOf(unit.id);
          const suggestions = registry.sectors.filter(sector => sector.isActive && !own.some(item => item.sector.id === sector.id)).map(sector => sector.name);
          return <li aria-label={unit.name} className="grid gap-3 rounded-lg border border-border p-4" key={unit.id}>
            {editingId === unit.id
              ? <form className="flex min-w-0 flex-wrap items-center gap-2" onSubmit={async event => {
                event.preventDefault();
                const name = draft.trim();
                if (name === unit.name || await run(() => onChangeUnit(unit, { name }))) setEditingId(null);
              }}>
                <Input aria-label="Novo nome" autoFocus className="min-w-0 flex-1" onChange={event => setDraft(event.target.value)} value={draft} />
                <Button disabled={busy || !draft.trim()} size="sm" type="submit">Salvar</Button>
                <Button disabled={busy} onClick={() => { setEditingId(null); setError(''); }} size="sm" type="button" variant="outline">Cancelar</Button>
              </form>
              : <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <h3 className={unit.isActive ? 'm-0 text-base font-semibold' : 'm-0 text-base font-semibold text-muted-foreground'}>{unit.name}</h3>
                  {!unit.isActive && <Badge variant="neutral">Desativada</Badge>}
                  <span className="text-sm tabular-nums text-muted-foreground">{people(unit.peopleCount)}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button aria-label={`Ações de ${unit.name}`} disabled={busy} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => { setEditingId(unit.id); setDraft(unit.name); setError(''); }}>Renomear</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void run(() => onChangeUnit(unit, { isActive: !unit.isActive }))}>{unit.isActive ? 'Desativar' : 'Reativar'}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>}

            <ul aria-label={`Setores de ${unit.name}`} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {own.length === 0 && <li className="text-sm text-muted-foreground">Sem setores ainda.</li>}
              {own.map(({ sector, count }) => <li className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1 pl-3 pr-1 text-[0.8125rem] font-medium" key={sector.id}>
                {sector.name}<span className="tabular-nums text-muted-foreground">{count}</span>
                <button aria-label={`Tirar ${sector.name} de ${unit.name}`} disabled={busy || count > 0} onClick={() => void run(() => onRemoveSector(unit, sector))} type="button"
                  className="m-0 grid size-6 min-h-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0 text-muted-foreground hover:bg-card hover:text-destructive disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title={count > 0 ? `${people(count)} de ${unit.name} ${count === 1 ? 'está' : 'estão'} neste setor` : `Tirar de ${unit.name}`}>
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>)}
            </ul>
            {unit.isActive && <AddLine busy={busy} label={`Novo setor em ${unit.name}`} onAdd={names => run(() => onAddSectors(unit, names))}
              placeholder={`Novo setor em ${unit.name} (ex.: RH) e Enter`} suggestions={suggestions} />}
          </li>;
        })}
      </ul>}
  </section>;
}
