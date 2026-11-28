import type { CompanyCertificate } from '@/api';

/** One person and every certificate they were given, the newest first. */
export interface CertificatePerson {
  id: string;
  name: string;
  login: string;
  registrationNumber: string | null;
  isActive: boolean;
  certificates: CompanyCertificate[];
}

export interface CertificateSector {
  /** The sector's id, or "none" for the people without a sector. */
  key: string;
  name: string;
  people: CertificatePerson[];
  certificateCount: number;
}

export interface CertificateUnit {
  /** The unit's id, or "none" for the people without a unit. */
  key: string;
  name: string;
  sectors: CertificateSector[];
  peopleCount: number;
  certificateCount: number;
}

export const noUnitName = 'Sem unidade';
export const noSectorName = 'Sem setor';

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const byName = <T extends { key: string; name: string }>(a: T, b: T) =>
  // the people without a unit or sector come last
  Number(a.key === 'none') - Number(b.key === 'none') || collator.compare(a.name, b.name);

export const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();

/**
 * The certificates in the tree the administrator looks for them in, the same tree they are kept in: unit, then sector,
 * then person. With a search, only the people whose name, login or registration has it, with all their certificates,
 * and the certificates whose training has it.
 */
export function certificateTree(certificates: readonly CompanyCertificate[], search = ''): CertificateUnit[] {
  const wanted = normalizeSearch(search);
  const units = new Map<string, { name: string; sectors: Map<string, { name: string; people: Map<string, CertificatePerson> }> }>();
  for (const certificate of certificates) {
    if (wanted) {
      const person = normalizeSearch(`${certificate.participantName} ${certificate.login} ${certificate.registrationNumber ?? ''}`);
      if (!person.includes(wanted) && !normalizeSearch(certificate.eventTitle).includes(wanted)) continue;
    }
    const unitKey = certificate.unitId ?? 'none';
    let unit = units.get(unitKey);
    if (!unit) units.set(unitKey, unit = { name: certificate.unitName ?? noUnitName, sectors: new Map() });
    const sectorKey = certificate.sectorId ?? 'none';
    let sector = unit.sectors.get(sectorKey);
    if (!sector) unit.sectors.set(sectorKey, sector = { name: certificate.sectorName ?? noSectorName, people: new Map() });
    let person = sector.people.get(certificate.participantId);
    if (!person) {
      sector.people.set(certificate.participantId, person = {
        id: certificate.participantId,
        name: certificate.participantName,
        login: certificate.login,
        registrationNumber: certificate.registrationNumber,
        isActive: certificate.isActive,
        certificates: [],
      });
    }
    person.certificates.push(certificate);
  }

  return [...units].map(([key, unit]) => {
    const sectors = [...unit.sectors].map(([sectorKey, sector]) => {
      const people = [...sector.people.values()]
        .map(person => ({ ...person, certificates: [...person.certificates].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)) }))
        .sort((a, b) => collator.compare(a.name, b.name));
      return { key: sectorKey, name: sector.name, people, certificateCount: people.reduce((sum, person) => sum + person.certificates.length, 0) };
    }).sort(byName);
    return {
      key,
      name: unit.name,
      sectors,
      peopleCount: sectors.reduce((sum, sector) => sum + sector.people.length, 0),
      certificateCount: sectors.reduce((sum, sector) => sum + sector.certificateCount, 0),
    };
  }).sort(byName);
}
