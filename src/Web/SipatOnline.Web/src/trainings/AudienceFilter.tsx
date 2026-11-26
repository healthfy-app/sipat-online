import { ChevronDown, Users } from 'lucide-react';
import { useState } from 'react';
import type { CompanyRegistry } from '@/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import UnitTree, { toggleSectorIn, toggleUnitIn, type UnitChoice } from './UnitTree';

const lower = (text: string) => text.toLocaleLowerCase('pt-BR');

/**
 * Filters the list of trainings by who they are for, with the same tree as "Para quem": mark a unit, then narrow it to
 * some of its sectors. The trainings of the whole company always show.
 */
export default function AudienceFilter({ registry, choice, onChange }: {
  registry: CompanyRegistry; choice: UnitChoice; onChange: (choice: Map<string, Set<string>>) => void;
}) {
  const [query, setQuery] = useState('');
  const units = registry.units.filter(unit => (unit.isActive || choice.has(unit.id)) && lower(unit.name).includes(lower(query.trim())));
  if (registry.units.filter(unit => unit.isActive).length === 0) return null;
  const marked = choice.size;
  return <DropdownMenu modal={false} onOpenChange={open => { if (!open) setQuery(''); }}>
    <DropdownMenuTrigger asChild>
      <button aria-label={marked > 0 ? `Para quem: ${marked} ${marked === 1 ? 'unidade marcada' : 'unidades marcadas'}` : 'Para quem'} type="button"
        className={cn('m-0 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm transition-colors hover:bg-muted data-[state=open]:border-primary max-sm:flex-1',
          marked > 0 ? 'border-primary font-semibold text-primary' : 'border-input text-foreground')}>
        <Users aria-hidden="true" className="size-4" />
        {marked > 0 ? `Para quem · ${marked}` : 'Para quem'}
        <ChevronDown aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="flex max-h-[min(28rem,70vh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col p-0">
      <div className="border-b border-border p-1.5">
        {/* typing here is searching, not the menu's own jump-to-letter */}
        <Input aria-label="Buscar unidade" onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}
          placeholder="Buscar unidade" type="search" value={query} />
      </div>
      <div className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto p-1.5">
        <UnitTree choice={choice} onToggleSector={(unitId, sectorId) => onChange(toggleSectorIn(choice, unitId, sectorId))}
          onToggleUnit={unitId => onChange(toggleUnitIn(choice, unitId))} registry={registry} units={units} />
        {units.length === 0 && <p className="m-0 p-3 text-sm text-muted-foreground">Nenhuma unidade com esse nome.</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
        <span className="text-xs text-muted-foreground">Os de toda a empresa sempre aparecem.</span>
        {marked > 0 && <Button onClick={() => onChange(new Map())} size="sm" variant="ghost">Limpar</Button>}
      </div>
    </DropdownMenuContent>
  </DropdownMenu>;
}
