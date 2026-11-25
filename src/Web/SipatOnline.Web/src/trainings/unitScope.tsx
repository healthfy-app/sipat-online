import { Check, ChevronDown, MapPin } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getCompanyRegistry, type AudienceTarget, type RegistryItem } from '@/api';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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

/**
 * The switcher in its place at the top of the company's pages, with its caption. It is always there for a company, so
 * the way the company is organized is in sight from the first day: with no unit yet, it leads to making the first.
 */
export function UnitBar({ manageHref }: { /** Where units and sectors are made, for who can make them. */ manageHref?: string }) {
  const { active, units } = useUnitScope();
  if (!active) return null;
  return <div className="mb-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 max-[760px]:mb-4" data-slot="unit-bar">
    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Unidade</span>
    <UnitSwitcher />
    {manageHref && <Link className="text-[0.8125rem] font-semibold text-primary underline-offset-2 hover:underline" to={manageHref}>
      {units.length === 0 ? 'Criar unidades' : 'Unidades e setores'}
    </Link>}
  </div>;
}

/** Up to this many units sit side by side; more become one button that opens the list. */
const segmentLimit = 4;

/**
 * The switch at the top: "Todas" and the units side by side, with the lit pill sliding to the one tapped. With many
 * units it is one button that opens the list. It shows only when there is something to choose.
 */
export function UnitSwitcher({ className }: { className?: string }) {
  const { unitId, unit, units, active, setUnitId } = useUnitScope();
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const segmented = units.length <= segmentLimit;

  // the pill sits under the chosen one, and follows when the names change width (a rename, the phone turned)
  useLayoutEffect(() => {
    const element = group.current;
    if (!active || !segmented || !element) return;
    const place = () => {
      const chosen = element.querySelector<HTMLElement>('[aria-checked="true"]');
      if (chosen) setPill({ left: chosen.offsetLeft, width: chosen.offsetWidth });
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, segmented, unitId, units]);

  if (!active) return null;
  const options = [{ id: null as string | null, name: 'Todas' }, ...units];

  if (!segmented) return <DropdownMenu modal={false}>
    <DropdownMenuTrigger asChild>
      <button aria-label={`Unidade: ${unit?.name ?? 'Todas as unidades'}`} type="button"
        className={cn('m-0 inline-flex h-10 max-w-full cursor-pointer items-center gap-2 rounded-full border-0 bg-[#eef3f1] px-4 text-sm font-semibold text-[#12332c] shadow-[inset_0_0_0_1px_rgb(18_51_44/0.06)] transition-colors hover:bg-[#e4ece9]', className)}>
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="truncate">{unit?.name ?? 'Todas as unidades'}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 opacity-60" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-[60vh] min-w-56 overflow-y-auto">
      {options.map(option => <DropdownMenuItem key={option.id ?? 'all'} onSelect={() => setUnitId(option.id)}>
        <span className="min-w-0 flex-1 truncate">{option.id === null ? 'Todas as unidades' : option.name}</span>
        {option.id === unitId && <Check aria-hidden="true" />}
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;

  return <div aria-label="Unidade" ref={group} role="radiogroup"
    className={cn('relative inline-flex max-w-full items-center overflow-x-auto rounded-full bg-[#eef3f1] p-1 shadow-[inset_0_0_0_1px_rgb(18_51_44/0.06)] [scrollbar-width:none]', className)}>
    {pill && <span aria-hidden="true" style={{ transform: `translateX(${pill.left}px)`, width: pill.width }}
      className="pointer-events-none absolute left-0 top-1 h-[calc(100%-0.5rem)] rounded-full bg-white shadow-[0_1px_3px_rgb(18_51_44/0.14),0_1px_1px_rgb(18_51_44/0.06)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none" />}
    {options.map(option => {
      const chosen = option.id === unitId;
      return <button aria-checked={chosen} key={option.id ?? 'all'} onClick={() => setUnitId(option.id)} role="radio" type="button"
        className={cn('relative z-10 m-0 inline-flex h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border-0 bg-transparent px-4 text-[0.8125rem] transition-colors duration-200 max-[640px]:h-9',
          chosen ? 'font-semibold text-[#12332c]' : 'font-medium text-[#12332c]/60 hover:text-[#12332c]')}>
        {option.name}
      </button>;
    })}
  </div>;
}
