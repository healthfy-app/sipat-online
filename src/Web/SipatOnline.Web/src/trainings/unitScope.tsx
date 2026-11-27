import { Check, ChevronsUpDown, MapPin, Plus, Settings2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getCompanyRegistry, type AudienceTarget, type RegistryItem } from '@/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * The unit the company is being looked at through, chosen once at the top and followed by every page of the company:
 * trainings, collaborators, the overview. "Todas" (no unit) is where it starts, and shows everything. What is made
 * while a unit is chosen (a collaborator, a training) is made in it.
 */
interface UnitScope {
  /** null: every unit. */
  unitId: string | null;
  unit: RegistryItem | null;
  /** The active units of the company. */
  units: RegistryItem[];
  /** True once the units of the company are known: the switcher shows (even with one unit, or none yet) and the pages follow it. */
  active: boolean;
  setUnitId: (id: string | null) => void;
}

const everything: UnitScope = { unitId: null, unit: null, units: [], active: false, setUnitId: () => undefined };
const Context = createContext<UnitScope>(everything);

/** Said by whatever adds, renames or puts away a unit, so the switcher at the top follows without a reload. */
export const registryChangedEvent = 'sipat:registry-changed';

const storageKey = (scopeKey: string) => `sipat:unit:${scopeKey}`;
const read = (scopeKey: string) => { try { return localStorage.getItem(storageKey(scopeKey)); } catch { return null; } };
const write = (scopeKey: string, id: string | null) => {
  try { if (id === null) localStorage.removeItem(storageKey(scopeKey)); else localStorage.setItem(storageKey(scopeKey), id); } catch { /* no storage: the choice lasts while the page is open */ }
};

export function UnitScopeProvider({ scopeKey, companyId, enabled, children }: {
  /** Whose units these are (the company's key): each company remembers its own choice. */
  scopeKey: string;
  /** The company the operation is looking at from its own area, when it is not inside the company. */
  companyId?: string;
  /** False where no company is being managed (the participant's pages, the operation's own): nothing is read. */
  enabled: boolean;
  children: ReactNode;
}) {
  const [units, setUnits] = useState<RegistryItem[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(() => read(scopeKey));

  useEffect(() => { setChosen(read(scopeKey)); setUnits(null); }, [scopeKey]);
  useEffect(() => {
    if (!enabled) { setUnits(null); return; }
    let current = true;
    const load = () => getCompanyRegistry(companyId).then(
      registry => { if (current) setUnits(Array.isArray(registry?.units) ? registry.units.filter(unit => unit.isActive) : null); },
      () => { if (current) setUnits(null); });
    void load();
    window.addEventListener(registryChangedEvent, load);
    return () => { current = false; window.removeEventListener(registryChangedEvent, load); };
  }, [enabled, companyId, scopeKey]);

  // a unit remembered that is gone or was put away: back to everything, instead of pages that show nothing
  useEffect(() => {
    if (units && chosen !== null && !units.some(unit => unit.id === chosen)) { setChosen(null); write(scopeKey, null); }
  }, [units, chosen, scopeKey]);

  const setUnitId = useCallback((id: string | null) => { setChosen(id); write(scopeKey, id); }, [scopeKey]);
  const value = useMemo<UnitScope>(() => {
    const list = units ?? [];
    const active = units !== null;
    const unit = active ? list.find(item => item.id === chosen) ?? null : null;
    return { unitId: unit?.id ?? null, unit, units: list, active, setUnitId };
  }, [units, chosen, setUnitId]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useUnitScope = () => useContext(Context);

/** Whether a training shows while a unit is chosen: it is for the whole company, for that unit, or for a sector of every unit. */
export function trainingInUnit(training: { targets?: readonly AudienceTarget[] } | undefined, unitId: string | null): boolean {
  const targets = training?.targets ?? [];
  return unitId === null || targets.length === 0 || targets.some(target => target.unitId === null || target.unitId === unitId);
}

/** A test of "is this person of the unit chosen": everyone is, when no unit is chosen. */
export function inUnit(profiles: ReadonlyMap<string, { unitId: string | null }>, unitId: string | null): (personId: string) => boolean {
  return personId => unitId === null || profiles.get(personId)?.unitId === unitId;
}


/** From this many units on, the list opens with a field to search it. */
const searchFrom = 8;
const lower = (text: string) => text.toLocaleLowerCase('pt-BR');

/**
 * The unit the company is being looked at through, in the side bar right under the company's name: what is chosen here
 * is what the menu below it shows. It opens a list; a long name is cut in the button (and whole in its tooltip) and
 * wraps to two lines in the list, which is wider than the bar; many units bring a field to search them.
 */
export function UnitMenu({ manageHref, className }: {
  /** Where units and sectors are made, for who can make them. */
  manageHref?: string; className?: string;
}) {
  const { unitId, unit, units, active, setUnitId } = useUnitScope();
  const [query, setQuery] = useState('');
  if (!active) return null;

  const current = unit?.name ?? 'Todas as unidades';
  const shown = units.filter(item => lower(item.name).includes(lower(query.trim())));
  const option = (id: string | null, name: string) => <DropdownMenuItem className="items-start" key={id ?? 'all'} onSelect={() => setUnitId(id)}>
    <span className="min-w-0 flex-1 [overflow-wrap:anywhere] line-clamp-2 leading-snug" title={name}>{name}</span>
    {id === unitId && <Check aria-hidden="true" className="mt-0.5" />}
  </DropdownMenuItem>;

  return <DropdownMenu modal={false} onOpenChange={open => { if (!open) setQuery(''); }}>
    <DropdownMenuTrigger asChild>
      <button aria-label={`Unidade: ${current}`} title={current} type="button"
        className={cn('m-0 mb-2 flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[0.625rem] border border-[#dfe6e3] bg-white px-2.5 py-1.5 text-left transition-colors hover:border-[#cdd7d3] hover:bg-[#f6f8f7] data-[state=open]:border-primary data-[state=open]:bg-accent', className)}>
        <MapPin aria-hidden="true" className={cn('size-4 shrink-0', unit ? 'text-primary' : 'text-muted-foreground')} />
        <span className="grid min-w-0 flex-1">
          <span className="text-[0.625rem] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">Unidade</span>
          <span className="truncate text-[0.8125rem] font-semibold leading-snug text-[#12332c]">{current}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="flex max-h-[min(26rem,70vh)] w-[min(20rem,calc(100vw-1.5rem))] flex-col p-0">
      {units.length >= searchFrom && <div className="border-b border-border p-1.5">
        {/* typing here is searching, not the menu's own jump-to-letter */}
        <Input aria-label="Buscar unidade" autoFocus onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key !== 'Escape' && event.key !== 'ArrowDown') event.stopPropagation(); }}
          placeholder="Buscar unidade" type="search" value={query} />
      </div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {query.trim() === '' && option(null, 'Todas as unidades')}
        {shown.map(item => option(item.id, item.name))}
        {units.length === 0 && <p className="m-0 px-2.5 py-2 text-[0.8125rem] leading-snug text-muted-foreground">A empresa ainda não tem unidades.</p>}
        {units.length > 0 && shown.length === 0 && <p className="m-0 px-2.5 py-2 text-[0.8125rem] text-muted-foreground">Nenhuma unidade com esse nome.</p>}
      </div>
      {manageHref && <div className="border-t border-border p-1">
        <DropdownMenuItem asChild>
          <Link className="font-semibold text-primary no-underline" to={manageHref}>
            {units.length === 0 ? <Plus aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
            {units.length === 0 ? 'Criar unidades' : 'Unidades e setores'}
          </Link>
        </DropdownMenuItem>
      </div>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
