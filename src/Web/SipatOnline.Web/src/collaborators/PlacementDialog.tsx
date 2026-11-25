import { Building2, Network } from 'lucide-react';
import { useState } from 'react';
import {
  addRegistryItems, addUnitSectors, changePlacement, getCompanyRegistry, removeRegistryItem, removeUnitSector,
  type CompanyRegistry, type ParticipantProfile, type PlacementResult, type RegistryKind,
} from '@/api';
import { Button } from '@/components/ui/button';
import { ChoiceList, type Choice, type Mark } from '@/components/ui/choice-list';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';

type Tab = 'unit' | 'sector';
/** What "no unit" / "no sector" is in the list. */
const none = 'none';
const same = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

const words = {
  unit: { kind: 'units' as RegistryKind, tab: 'Unidades', noun: 'unidade', without: 'Sem unidade', stay: 'continuam nela; ela só deixa de ser oferecida.', stayOne: 'continua nela; ela só deixa de ser oferecida.', empty: 'Ninguém está nela.', hint: 'A unidade em que as pessoas trabalham. Cada pessoa tem uma.' },
  sector: { kind: 'sectors' as RegistryKind, tab: 'Setores', noun: 'setor', without: 'Sem setor', stay: 'continuam nele; ele só deixa de ser oferecido.', stayOne: 'continua nele; ele só deixa de ser oferecido.', empty: 'Ninguém está nele.', hint: 'O setor das pessoas dentro da unidade. Cada pessoa tem um.' },
};

/** What the move did, in one sentence: who moved where, the trainings they received, the untouched days that left. */
function sentence(result: PlacementResult, tab: Tab, name: string | null): string {
  const one = result.changed === 1;
  let text = `${pluralize(result.changed, 'colaborador', 'colaboradores')} ${name === null ? `${one ? 'ficou' : 'ficaram'} ${words[tab].without.toLowerCase()}` : `${one ? 'passou' : 'passaram'} para ${name}`}`;
  if (result.receivedTrainings.length > 0) text += ` e ${one ? 'recebeu' : 'receberam'} ${result.receivedTrainings.join(', ')}`;
  if (result.removed > 0) text += ` · ${pluralize(result.removed, 'dia', 'dias')} de treinamentos não iniciados ${result.removed === 1 ? 'saiu' : 'saíram'}`;
  return `${text}.`;
}

/**
 * Puts the chosen people in a unit and in a sector, picked the way the videos' assuntos are: search, pick, make the
 * one that is missing, take off the one not wanted. A person has one unit and one sector, so each list is a choice of
 * one. Only the list that was touched changes anyone; the trainings follow the people (the server says what they got).
 */
export default function PlacementDialog({ people, profiles, registry: givenRegistry, onClose, onSaved, onRegistryChanged }: {
  people: string[]; profiles: ReadonlyMap<string, ParticipantProfile>; registry: CompanyRegistry;
  onClose: () => void; onSaved: (message: string) => void | Promise<void>;
  onRegistryChanged?: (registry: CompanyRegistry) => void;
}) {
  const [registry, setRegistry] = useState(givenRegistry);
  const [tab, setTab] = useState<Tab>('unit');
  // what was picked in each list (undefined: not touched, so nobody changes)
  const [picked, setPicked] = useState<{ unit?: string; sector?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const text = words[tab];
  // the sectors offered are the ones of the unit: the one just picked in the other tab, else the one the people share
  const units = new Set(people.map(id => profiles.get(id)?.unitId ?? null));
  const sectorUnitId = picked.unit !== undefined ? (picked.unit === none ? null : picked.unit) : units.size === 1 ? [...units][0] : null;
  const sectorUnit = registry.units.find(unit => unit.id === sectorUnitId) ?? null;
  const links = sectorUnit && registry.unitSectors ? registry.unitSectors.filter(link => link.unitId === sectorUnit.id) : null;
  const inUnit = tab === 'sector' && links !== null;
  // a sector some of the people are in, or just picked, stays in view even if the unit does not have it yet
  const held = new Set([...people.map(id => profiles.get(id)?.sectorId ?? none), picked.sector ?? none]);
  const items = (inUnit ? registry.sectors.filter(sector => links.some(link => link.sectorId === sector.id) || held.has(sector.id)) : registry[text.kind])
    .map(item => inUnit ? { ...item, peopleCount: links.find(link => link.sectorId === item.id)?.peopleCount ?? 0 } : item);
  const placeOf = (id: string) => (tab === 'unit' ? profiles.get(id)?.unitId : profiles.get(id)?.sectorId) ?? none;
  const choices: Choice[] = [
    { id: none, title: text.without },
    ...items.filter(item => item.isActive).map(item => ({ id: item.id, title: item.name, hint: pluralize(item.peopleCount, 'pessoa', 'pessoas') })),
  ];
  const marks = new Map(choices.map(choice => {
    if (picked[tab] !== undefined) return [choice.id, (picked[tab] === choice.id ? 'all' : 'none') as Mark];
    const count = people.filter(id => placeOf(id) === choice.id).length;
    return [choice.id, (count === 0 ? 'none' : count === people.length ? 'all' : 'some') as Mark];
  }));

  function accept(next: CompanyRegistry) { setRegistry(next); onRegistryChanged?.(next); }

  async function create(name: string) {
    setError('');
    try {
      const next = inUnit && sectorUnit ? await addUnitSectors(sectorUnit.id, [name]) : await addRegistryItems(text.kind, [name]);
      accept(next);
      const made = next[text.kind].find(item => same(item.name, name));
      if (made) setPicked(current => ({ ...current, [tab]: made.id }));
    } catch (failure) { setError(getErrorMessage(failure)); throw failure; }
  }

  async function remove(id: string) {
    setError('');
    try {
      // inside a unit, a sector only leaves that unit; in the whole list, it is put away or deleted
      if (inUnit && sectorUnit) accept(await removeUnitSector(sectorUnit.id, id));
      else { await removeRegistryItem(text.kind, id); accept(await getCompanyRegistry()); }
      setPicked(current => current[tab] === id ? { ...current, [tab]: undefined } : current);
    } catch (failure) { setError(getErrorMessage(failure)); throw failure; }
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const parts: string[] = [];
      for (const field of ['unit', 'sector'] as const) {
        const value = picked[field];
        if (value === undefined) continue;
        const result = await changePlacement(people, field, value === none ? null : value);
        if (result.changed === 0) continue;
        parts.push(sentence(result, field, value === none ? null : registry[words[field].kind].find(item => item.id === value)?.name ?? ''));
      }
      await onSaved(parts.length > 0 ? parts.join(' ') : 'Nada mudou: as pessoas já estavam ali.');
    } catch (failure) { setError(getErrorMessage(failure)); setBusy(false); }
  }

  const tabButton = (value: Tab, Icon: typeof Building2) =>
    <button aria-selected={tab === value} className={cn('inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-semibold',
      tab === value ? 'bg-card text-foreground shadow-card' : 'bg-transparent text-muted-foreground hover:text-foreground')}
      onClick={() => setTab(value)} role="tab" type="button"><Icon className="size-4" /> {words[value].tab}{picked[value] !== undefined && <span aria-label="alterado" className="size-1.5 rounded-full bg-primary" />}</button>;

  return <Dialog busy={busy} description={`Vale para ${pluralize(people.length, 'colaborador escolhido', 'colaboradores escolhidos')}. Só muda o que você marcar.`} onClose={onClose} title="Unidade e setor">
    <div className="grid gap-3">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
        {tabButton('unit', Building2)}
        {tabButton('sector', Network)}
      </div>
      <p className="m-0 text-[0.8125rem] text-muted-foreground">{tab === 'sector' ? (inUnit && sectorUnit ? `Setores de ${sectorUnit.name}.` : 'O setor das pessoas. Com uma unidade escolhida, aparecem só os setores dela.') : text.hint}</p>
      <ChoiceList canRemove={choice => choice.id !== none} choices={choices} disabled={busy} key={tab} marks={marks} mode="single" noun={text.noun}
        onCreate={create} onRemove={remove} onToggle={id => setPicked(current => ({ ...current, [tab]: id }))}
        removeNote={choice => {
          const count = items.find(item => item.id === choice.id)?.peopleCount ?? 0;
          if (inUnit && sectorUnit) return count === 0 ? `Sai de ${sectorUnit.name}; continua na lista da empresa.` : `${pluralize(count, 'pessoa', 'pessoas')} de ${sectorUnit.name} ${count === 1 ? 'está' : 'estão'} nele: mude o setor antes.`;
          return count === 0 ? text.empty : `${pluralize(count, 'pessoa', 'pessoas')} ${count === 1 ? text.stayOne : text.stay}`;
        }}
        removeVerb="Tirar" someLabel="(em parte das pessoas)" />
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || (picked.unit === undefined && picked.sector === undefined)} onClick={() => void save()} type="button">{busy ? 'Salvando...' : 'Salvar'}</Button>
      </DialogActions>
    </div>
  </Dialog>;
}
