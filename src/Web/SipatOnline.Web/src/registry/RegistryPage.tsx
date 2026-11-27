import { useCallback, useEffect, useState } from 'react';
import {
  addRegistryItems, addUnitSectors, getCompanyRegistry, removeUnitSector, updateRegistryItem,
  type CompanyRegistry, type RegistryItem, type RegistryKind,
} from '@/api';
import { Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import RegistryList from './RegistryList';
import UnitTree from './UnitTree';

/**
 * How the company is organized: its units, each with its sectors inside; the names of the sectors, which are the same
 * across the units. No participant field is required: who has a registration, an e-mail or a sector keeps it, and who has
 * not is not held back.
 */
export default function RegistryPage() {
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setRegistry(await getCompanyRegistry()); } catch (failure) { setError(getErrorMessage(failure)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const replaceItem = (kind: RegistryKind, updated: RegistryItem) => setRegistry(current => current && {
    ...current, [kind]: current[kind].map(item => item.id === updated.id ? updated : item),
  });

  return <Page>
    <PageHeader
      description="As unidades da empresa e os setores de cada uma."
      eyebrow="Gestão da empresa"
      title="Cadastro"
    />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {!registry ? (error ? null : <LoadingState>Carregando o cadastro...</LoadingState>) : <>
      <UnitTree
        onAddSectors={async (unit, names) => setRegistry(await addUnitSectors(unit.id, names))}
        onAddUnits={async names => setRegistry(await addRegistryItems('units', names))}
        onChangeUnit={async (unit, change) => replaceItem('units', await updateRegistryItem('units', unit.id, change))}
        onRemoveSector={async (unit, sector) => setRegistry(await removeUnitSector(unit.id, sector.id))}
        registry={registry}
      />
      {registry.sectors.length > 0 && <RegistryList
        description="Os nomes dos setores valem para a empresa toda: o RH de Minas e o RH de São Paulo são o mesmo setor, em duas unidades. Renomear aqui muda em todas."
        idPrefix="sectors" items={registry.sectors} title="Nomes dos setores"
        onChange={async (item, change) => replaceItem('sectors', await updateRegistryItem('sectors', item.id, change))}
      />}
    </>}
  </Page>;
}
