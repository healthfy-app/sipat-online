import { CirclePlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  addRegistryItems, countAudience, saveTrainingAudience,
  type AudienceTarget, type CompanyRegistry, type ParticipantProfile, type RegistryItem, type TrainingAudience,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import UnitTree, { SectorChip, toggleSectorIn, toggleUnitIn } from './UnitTree';

const people = (count: number) => pluralize(count, 'pessoa', 'pessoas');
const lower = (text: string) => text.toLocaleLowerCase('pt-BR');

/**
 * Who a training is for. The whole company, or a choice: each unit marked is all of it, unless narrowed to some of its
 * sectors (the HR of Minas, the IT of São Paulo); a sector can also be marked for every unit. A unit that is missing
 * is made right here.
 */
export default function AudienceDialog({ sipatId, audience, registry: givenRegistry, profiles, onClose, onSaved, onRegistryChanged }: {
  sipatId: string; audience: TrainingAudience; registry: CompanyRegistry;
  /** Where each person is, to say how many of a unit are in each sector. */
  profiles: readonly ParticipantProfile[];
  onClose: () => void; onSaved: (audience: TrainingAudience) => void | Promise<void>;
  onRegistryChanged?: (registry: CompanyRegistry) => void;
}) {
  const [registry, setRegistry] = useState(givenRegistry);
  const [choosing, setChoosing] = useState(audience.targets.length > 0);
  // unit → the sectors it is narrowed to (none: the whole unit)
  const [units, setUnits] = useState(() => {
    const map = new Map<string, Set<string>>();
    for (const target of audience.targets) {
      if (!target.unitId) continue;
      const sectors = map.get(target.unitId) ?? new Set<string>();
      if (target.sectorId) sectors.add(target.sectorId);
      map.set(target.unitId, sectors);
    }
    // a unit named whole says it all, even beside one of its sectors
    for (const target of audience.targets) if (target.unitId && !target.sectorId) map.set(target.unitId, new Set());
    return map;
  });
  const [everywhere, setEverywhere] = useState(() => new Set(audience.targets.flatMap(target => !target.unitId && target.sectorId ? [target.sectorId] : [])));
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [count, setCount] = useState<{ receiving: number; leftOutUnplaced: number } | null>(null);

  const targets = useMemo<AudienceTarget[]>(() => {
    if (!choosing) return [];
    const order = (items: RegistryItem[], ids: Iterable<string>) => { const wanted = new Set(ids); return items.filter(item => wanted.has(item.id)).map(item => item.id); };
    return [
      ...order(registry.units, units.keys()).flatMap((unitId): AudienceTarget[] => {
        const sectors = order(registry.sectors, units.get(unitId) ?? []);
        return sectors.length === 0 ? [{ unitId, sectorId: null }] : sectors.map(sectorId => ({ unitId, sectorId }));
      }),
      ...order(registry.sectors, everywhere).map(sectorId => ({ unitId: null, sectorId })),
    ];
  }, [choosing, units, everywhere, registry]);
  const key = JSON.stringify(targets);
  const changed = key !== JSON.stringify(audience.targets);
  const nothingChosen = choosing && targets.length === 0;

  // the count follows what is marked, a moment after the last tap
  useEffect(() => {
    if (nothingChosen) { setCount(null); return; }
    let current = true;
    const timer = setTimeout(() => {
      countAudience({ targets: JSON.parse(key) as AudienceTarget[] }).then(result => { if (current) setCount(result); }, () => { if (current) setCount(null); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [key, nothingChosen]);

  const inSector = (unitId: string | null, sectorId: string) => profiles.filter(person => person.sectorId === sectorId && (unitId === null || person.unitId === unitId)).length;
  const toggleEverywhere = (sectorId: string) => setEverywhere(current => { const next = new Set(current); if (!next.delete(sectorId)) next.add(sectorId); return next; });

  const needle = query.trim().replace(/\s+/g, ' ');
  // a unit or sector put away shows only while the training still names it
  const shownUnits = registry.units.filter(unit => (unit.isActive || units.has(unit.id)) && lower(unit.name).includes(lower(needle)));
  const sectorsOf = (marked: ReadonlySet<string>) => registry.sectors.filter(sector => sector.isActive || marked.has(sector.id));
  const canCreate = needle.length > 0 && !registry.units.some(unit => lower(unit.name) === lower(needle));

  async function createUnit() {
    setCreating(true); setError('');
    try {
      const next = await addRegistryItems('units', [needle]);
      setRegistry(next); onRegistryChanged?.(next);
      const made = next.units.find(unit => lower(unit.name) === lower(needle));
      if (made) setUnits(current => new Map(current).set(made.id, new Set()));
      setQuery('');
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setCreating(false); }
  }

  async function save() {
    setBusy(true); setError('');
    try { await onSaved(await saveTrainingAudience(sipatId, { targets })); }
    catch (failure) { setError(getErrorMessage(failure)); setBusy(false); }
  }

  const option = (value: boolean, label: string, hint: string) => <label className={cn('m-0 flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors',
    choosing === value ? 'border-primary bg-accent' : 'border-border hover:bg-muted')}>
    <input aria-label={label} checked={choosing === value} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-primary)]" name="audience-mode" onChange={() => setChoosing(value)} type="radio" />
    <span className="grid gap-0.5"><strong className="font-semibold">{label}</strong><span className="text-xs text-muted-foreground">{hint}</span></span>
  </label>;

  return <Dialog busy={busy} description="Quem recebe este treinamento. Quem entrar depois na unidade ou no setor recebe sozinho." onClose={onClose} size="lg" title="Para quem">
    <div className="grid gap-4">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex gap-2 max-[640px]:flex-col" role="radiogroup" aria-label="Para quem">
        {option(false, 'Toda a empresa', 'Todos os colaboradores, de qualquer unidade.')}
        {option(true, 'Escolher unidades e setores', 'Só quem é das unidades e dos setores marcados.')}
      </div>

      {choosing && <>
        <Input aria-label="Buscar ou criar unidade" onChange={event => setQuery(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (canCreate && shownUnits.length === 0 && !creating) void createUnit(); } }}
          placeholder="Buscar ou criar unidade" type="search" value={query} />
        <div className="grid max-h-[42vh] content-start gap-1 overflow-y-auto rounded-md border border-border p-1.5">
          {canCreate && <button className="m-0 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-accent px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-accent/70 disabled:cursor-default disabled:opacity-60"
            disabled={creating || busy} onClick={() => void createUnit()} type="button">
            <CirclePlus aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{creating ? 'Criando...' : <>Criar unidade “{needle}”</>}</span>
          </button>}
          {shownUnits.length === 0 && !canCreate && <p className="m-0 p-3 text-sm text-muted-foreground">
            {registry.units.length === 0 ? 'A empresa ainda não tem unidades. Digite o nome de uma para criar.' : 'Nada encontrado.'}
          </p>}
          <UnitTree choice={units} disabled={busy} onToggleSector={(unitId, sectorId) => setUnits(current => toggleSectorIn(current, unitId, sectorId))}
            onToggleUnit={unitId => setUnits(current => toggleUnitIn(current, unitId))} registry={registry} sectorCount={inSector} units={shownUnits} />
        </div>
        {sectorsOf(everywhere).length > 0 && <div className="grid gap-1.5">
          <p className="m-0 text-[0.8125rem] font-medium" id="audience-everywhere">Em todas as unidades</p>
          <div aria-labelledby="audience-everywhere" className="flex flex-wrap gap-1.5" role="group">
            {sectorsOf(everywhere).map(sector => <SectorChip count={inSector(null, sector.id)} disabled={busy} key={sector.id} name={sector.name}
              onClick={() => toggleEverywhere(sector.id)} pressed={everywhere.has(sector.id)} />)}
          </div>
        </div>}
      </>}

      <p aria-live="polite" className="m-0 min-h-5 text-sm">
        {nothingChosen
          ? <span className="text-muted-foreground">Marque pelo menos uma unidade ou um setor.</span>
          : count && <>
            <strong>{people(count.receiving)} {count.receiving === 1 ? 'vai' : 'vão'} receber</strong>
            {count.leftOutUnplaced > 0 && <span className="text-muted-foreground"> · {people(count.leftOutUnplaced)} sem unidade ou setor não {count.leftOutUnplaced === 1 ? 'vai' : 'vão'} receber</span>}
          </>}
      </p>
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || !changed || nothingChosen} onClick={() => void save()} type="button">{busy ? 'Salvando...' : 'Salvar'}</Button>
      </DialogActions>
    </div>
  </Dialog>;
}
