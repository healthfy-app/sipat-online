import { Search, Settings2, X } from 'lucide-react';
import type { CourseCategory } from '@/api';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import type { CatalogFilters, StatusFilter } from './catalogFilters';

export type CatalogTab = 'courses' | 'videos' | 'modules' | 'plans';

const searchLabel: Record<CatalogTab, { label: string; placeholder: string }> = {
  courses: { label: 'Buscar assunto', placeholder: 'Buscar por nome ou descrição' },
  videos: { label: 'Buscar vídeo', placeholder: 'Buscar vídeo por nome' },
  modules: { label: 'Buscar jogo', placeholder: 'Buscar jogo por nome' },
  plans: { label: 'Buscar', placeholder: 'Buscar' },
};

/**
 * One toolbar under the tabs, the way catalogs filter: a search box that follows the tab you are in, the
 * filters that only make sense for that tab, a count, and a single "Limpar" when something is applied.
 * What is typed or chosen lives in the address, so it survives changing tabs and coming back.
 */
export default function CatalogToolbar({
  tab,
  filters,
  categories,
  hasUncategorized,
  countText,
  isFiltered,
  onChange,
  onClear,
  onManageCategories,
}: {
  tab: CatalogTab;
  filters: CatalogFilters;
  categories: CourseCategory[];
  hasUncategorized: boolean;
  countText: string;
  isFiltered: boolean;
  onChange: (patch: Partial<CatalogFilters>) => void;
  onClear: () => void;
  onManageCategories: () => void;
}) {
  const search = searchLabel[tab];
  return (
    <div className="flex flex-wrap items-center gap-2.5" role="search">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-md">
        <Search className="pointer-events-none absolute left-3 size-4" />
        <Input
          aria-label={search.label}
          className="pl-9"
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder={search.placeholder}
          type="search"
          value={filters.query}
        />
      </label>

      {tab === 'courses' && (
        <>
          <NativeSelect aria-label="Status" className="w-auto max-sm:flex-1" onChange={(event) => onChange({ status: event.target.value as StatusFilter })} value={filters.status}>
            <option value="all">Todos os status</option>
            <option value="Draft">Rascunho</option>
            <option value="Published">Publicado</option>
          </NativeSelect>
          <NativeSelect aria-label="Filtrar por categoria" className="w-auto max-sm:flex-1" onChange={(event) => onChange({ category: event.target.value })} value={filters.category}>
            <option value="all">Todas as categorias</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            {hasUncategorized && categories.length > 0 && <option value="none">Sem categoria</option>}
          </NativeSelect>
          <Button className="text-muted-foreground max-sm:order-3" onClick={onManageCategories} size="sm" variant="ghost"><Settings2 /> Gerenciar categorias</Button>
        </>
      )}

      {isFiltered && <Button onClick={onClear} size="sm" variant="ghost"><X /> Limpar filtros</Button>}

      <span aria-live="polite" className="ml-auto whitespace-nowrap text-[0.8125rem] tabular-nums text-muted-foreground max-sm:ml-0">{countText}</span>
    </div>
  );
}
