import type { AudienceTarget, CompanyRegistry, RegistryItem } from '@/api';
import { pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';

const people = (count: number) => pluralize(count, 'pessoa', 'pessoas');

/** What is marked in the tree: each unit, and the sectors it is narrowed to (none: the whole unit). */
export type UnitChoice = ReadonlyMap<string, ReadonlySet<string>>;

/** A sector to tap: lit when it is marked. Its count is of the people it would reach. */
export function SectorChip({ name, count, pressed, disabled, onClick }: { name: string; count?: number; pressed: boolean; disabled?: boolean; onClick: () => void }) {
  return <button aria-label={count === undefined ? name : `${name}, ${people(count)}`} aria-pressed={pressed} disabled={disabled} onClick={onClick} type="button"
    className={cn('m-0 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-[0.8125rem] font-medium transition-colors disabled:cursor-default disabled:opacity-60 max-[640px]:min-h-10',
      pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted')}>
    {name}{count !== undefined && <span className={cn('tabular-nums', pressed ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>}
  </button>;
}

/** Flips a unit in what is marked. */
export function toggleUnitIn(choice: UnitChoice, unitId: string): Map<string, Set<string>> {
  const next = new Map([...choice].map(([id, sectors]) => [id, new Set(sectors)]));
  if (!next.delete(unitId)) next.set(unitId, new Set());
  return next;
}

/** Flips a sector of a marked unit; `null` puts the unit back to whole. */
export function toggleSectorIn(choice: UnitChoice, unitId: string, sectorId: string | null): Map<string, Set<string>> {
  const next = new Map([...choice].map(([id, sectors]) => [id, new Set(sectors)]));
  const sectors = sectorId === null ? new Set<string>() : new Set(choice.get(unitId));
  if (sectorId !== null && !sectors.delete(sectorId)) sectors.add(sectorId);
  return next.set(unitId, sectors);
}

/** Whether a training (by who it is for) shows under what is marked: it is for the whole company, or reaches one of the marked units or sectors. */
export function inChoice(targets: readonly AudienceTarget[], choice: UnitChoice): boolean {
  if (choice.size === 0 || targets.length === 0) return true;
  return targets.some(target => [...choice].some(([unitId, sectors]) =>
    (target.unitId === null || target.unitId === unitId) && (sectors.size === 0 || target.sectorId === null || sectors.has(target.sectorId))));
}

/**
 * The units of a company to mark, each opening its sectors once marked: the tree of "Para quem", also used to filter
 * the list of trainings.
 */
export default function UnitTree({ registry, units, choice, disabled, sectorCount, onToggleUnit, onToggleSector }: {
  registry: CompanyRegistry;
  /** The units to show (already searched). */
  units: RegistryItem[];
  choice: UnitChoice;
  disabled?: boolean;
  /** How many people of a unit are in a sector, when it is known. */
  sectorCount?: (unitId: string, sectorId: string) => number;
  onToggleUnit: (unitId: string) => void;
  /** `null`: the whole unit. */
  onToggleSector: (unitId: string, sectorId: string | null) => void;
}) {
  // a sector put away shows only while it is still marked; under a unit, the sectors that unit has
  const sectorsIn = (unitId: string, marked: ReadonlySet<string>) => registry.sectors.filter(sector => (sector.isActive || marked.has(sector.id))
    && (!registry.unitSectors || marked.has(sector.id) || registry.unitSectors.some(link => link.unitId === unitId && link.sectorId === sector.id)));
  return <>
    {units.map(unit => {
      const marked = choice.get(unit.id);
      const sectors = marked ? sectorsIn(unit.id, marked) : [];
      return <div className={cn('rounded-md', marked ? 'bg-accent/60' : 'hover:bg-muted')} key={unit.id}>
        <label className="m-0 flex cursor-pointer items-center gap-2.5 px-2 py-2 text-sm max-[640px]:py-2.5">
          <input checked={!!marked} className="size-4 shrink-0 accent-[var(--brand-primary)]" disabled={disabled} onChange={() => onToggleUnit(unit.id)} type="checkbox" />
          <span className="min-w-0 flex-1 font-medium">{unit.name}{!unit.isActive && <span className="ml-1.5 text-xs font-normal text-muted-foreground">desativada</span>}</span>
          <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">{people(unit.peopleCount)}</span>
        </label>
        {marked && sectors.length > 0 && <div aria-label={`Setores de ${unit.name}`} className="flex flex-wrap gap-1.5 px-2 pb-2.5 pl-8.5" role="group">
          <SectorChip disabled={disabled} name="Toda a unidade" onClick={() => onToggleSector(unit.id, null)} pressed={marked.size === 0} />
          {sectors.map(sector => <SectorChip count={sectorCount?.(unit.id, sector.id)} disabled={disabled} key={sector.id} name={sector.name}
            onClick={() => onToggleSector(unit.id, sector.id)} pressed={marked.has(sector.id)} />)}
        </div>}
      </div>;
    })}
  </>;
}
