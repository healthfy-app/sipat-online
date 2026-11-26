import type { CompanyRegistry, RegistryItem } from '@/api';

/**
 * The sectors a person of this unit can be in: the ones the unit has. With no unit there is none to choose. `keepId` is
 * a sector the person is already in, which stays in the list even if it was put away or the unit does not have it, so
 * opening the form never changes anyone by itself. A company whose units have no sectors listed yet offers them all.
 */
export function sectorsOfUnit(registry: CompanyRegistry | null | undefined, unitId: string | null, keepId?: string | null): RegistryItem[] {
  if (!registry) return [];
  const links = registry.unitSectors;
  return registry.sectors.filter(sector => sector.id === keepId
    || (unitId !== null && sector.isActive && (!links || links.some(link => link.unitId === unitId && link.sectorId === sector.id))));
}
