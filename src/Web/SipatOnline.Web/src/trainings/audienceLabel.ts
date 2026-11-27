import type { AudienceTarget, CompanyRegistry } from '@/api';

/**
 * Who a training is for, in one line for its card and its page: "Toda a empresa", "Minas Gerais",
 * "Minas Gerais › RH · São Paulo › TI", "RH de todas as unidades". More than three groups are cut short.
 */
export function audienceLabel(targets: readonly AudienceTarget[], registry: Pick<CompanyRegistry, 'units' | 'sectors'>): string {
  if (targets.length === 0) return 'Toda a empresa';
  const unit = (id: string) => registry.units.find(item => item.id === id)?.name ?? 'Unidade';
  const sector = (id: string) => registry.sectors.find(item => item.id === id)?.name ?? 'Setor';
  const parts: string[] = [];
  const unitIds = [...new Set(targets.flatMap(target => target.unitId ? [target.unitId] : []))];
  for (const unitId of unitIds) {
    const own = targets.filter(target => target.unitId === unitId);
    const sectors = own.flatMap(target => target.sectorId ? [sector(target.sectorId)] : []);
    parts.push(own.some(target => !target.sectorId) || sectors.length === 0 ? unit(unitId) : `${unit(unitId)} › ${sectors.join(', ')}`);
  }
  for (const target of targets) if (!target.unitId && target.sectorId) parts.push(`${sector(target.sectorId)} de todas as unidades`);
  return parts.length > 3 ? `${parts.slice(0, 2).join(' · ')} +${parts.length - 2}` : parts.join(' · ');
}
