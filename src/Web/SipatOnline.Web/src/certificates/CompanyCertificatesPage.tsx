import { ChevronDown, ChevronRight, Download, FileText, MapPin, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { certificatePdfUrl, listCompanyCertificates, type CompanyCertificate } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Page, PageHeader, Stat } from '@/components/ui/page';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import { useUnitScope } from '@/trainings/unitScope';
import { certificateTree, type CertificatePerson, type CertificateUnit } from './certificateTree';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('') || '?';
// the date printed on the certificate
const issuedOn = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
/** Up to this many people every sector starts open; a bigger company starts with them closed and opens the one it wants. */
const openEverythingUpTo = 40;
const sectorKey = (unit: string, sector: string) => `${unit}/${sector}`;

/**
 * Every certificate of the company's people, in the order the administrator looks for them: unit, sector, person, and
 * under each person all their certificates, each one downloaded as the PDF kept in the archive.
 */
export default function CompanyCertificatesPage() {
  const unitScope = useUnitScope();
  const [certificates, setCertificates] = useState<CompanyCertificate[] | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // what the administrator opened or closed by hand; the rest is as it starts
  const [chosen, setChosen] = useState<Record<string, boolean>>({});

  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    // switching unit quickly: only the last answer asked for is shown
    const asked = ++lastLoad.current;
    setError('');
    try {
      const list = await listCompanyCertificates(unitScope.unitId);
      if (asked === lastLoad.current) setCertificates(list);
    } catch (failure) {
      if (asked !== lastLoad.current) return;
      setError(getErrorMessage(failure));
      setCertificates(current => current ?? []);
    }
  }, [unitScope.unitId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setChosen({}); }, [unitScope.unitId]);

  const everyone = useMemo(() => certificateTree(certificates ?? []), [certificates]);
  const tree = useMemo(() => certificateTree(certificates ?? [], search), [certificates, search]);
  const peopleCount = everyone.reduce((sum, unit) => sum + unit.peopleCount, 0);
  const foundCount = tree.reduce((sum, unit) => sum + unit.certificateCount, 0);
  const searching = search.trim().length > 0;

  const sectorStartsOpen = (unit: CertificateUnit) => peopleCount <= openEverythingUpTo || unit.sectors.length === 1;
  // a search shows everything it found
  const isOpen = (key: string, initially: boolean) => searching || (chosen[key] ?? initially);
  const toggle = (key: string, initially: boolean) => setChosen(current => ({ ...current, [key]: !(current[key] ?? initially) }));
  const everythingOpen = tree.every(unit => isOpen(unit.key, true) &&
    unit.sectors.every(sector => isOpen(sectorKey(unit.key, sector.key), sectorStartsOpen(unit))));
  const openAll = (open: boolean) => setChosen(Object.fromEntries(tree.flatMap(unit => [
    // closing keeps the units open, with their sectors listed
    ...(open ? [[unit.key, true] as const] : []),
    ...unit.sectors.map(sector => [sectorKey(unit.key, sector.key), open] as const),
  ])));

  return <Page>
    <PageHeader
      description="Todos os certificados emitidos, separados por unidade, setor e colaborador."
      eyebrow="Gestão da empresa"
      title="Certificados"
    />

    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {certificates && certificates.length > 0 && <>
      <section aria-label="Resumo dos certificados" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 max-[720px]:grid-cols-2">
        <Stat label="Certificados emitidos" value={certificates.length} />
        <Stat label="Colaboradores com certificado" value={peopleCount} />
      </section>

      <section aria-label="Busca" className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
          <Input aria-label="Buscar por colaborador, login ou treinamento" className="pl-9" onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por colaborador, login ou treinamento" type="search" value={search} />
        </label>
        {!searching && tree.length > 0 && <Button onClick={() => openAll(!everythingOpen)} size="sm" variant="ghost">
          {everythingOpen ? 'Fechar os setores' : 'Abrir tudo'}
        </Button>}
        <span aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground max-sm:ml-0">
          {searching ? `${foundCount} de ${certificates.length}` : pluralize(certificates.length, 'certificado', 'certificados')}
        </span>
      </section>
    </>}

    {!certificates && <LoadingState>Carregando os certificados...</LoadingState>}
    {certificates && certificates.length === 0 && !error && <EmptyState
      description="Assim que os colaboradores concluírem um treinamento e emitirem o certificado, ele aparece aqui, na unidade e no setor de cada um."
      title={unitScope.unit ? `Nenhum certificado emitido em ${unitScope.unit.name}.` : 'Nenhum certificado emitido ainda.'} />}
    {certificates && certificates.length > 0 && tree.length === 0 && <EmptyState description="Tente outro nome, login ou treinamento." title="Nenhum certificado encontrado." />}

    {tree.length > 0 && <div className="grid gap-4">
      {tree.map(unit => {
        const unitOpen = isOpen(unit.key, true);
        return <section aria-label={unit.name} className="overflow-hidden rounded-xl bg-card shadow-card" key={unit.key}>
          <button aria-expanded={unitOpen} className="m-0 flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-4 text-left text-foreground hover:bg-accent/40 max-sm:px-4"
            onClick={() => toggle(unit.key, true)} type="button">
            <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-lg', unit.key === 'none' ? 'bg-muted text-muted-foreground' : 'bg-accent text-accent-foreground')}>
              <MapPin className="size-4" />
            </span>
            <span className="grid min-w-0 flex-1">
              <strong className="truncate text-base font-semibold">{unit.name}</strong>
              <span className="text-[0.8125rem] text-muted-foreground">
                {pluralize(unit.peopleCount, 'colaborador', 'colaboradores')} · {pluralize(unit.certificateCount, 'certificado', 'certificados')}
              </span>
            </span>
            <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', !unitOpen && '-rotate-90')} />
          </button>

          {unitOpen && <div className="border-t border-border">
            {unit.sectors.map(sector => {
              const key = sectorKey(unit.key, sector.key);
              const startsOpen = sectorStartsOpen(unit);
              const open = isOpen(key, startsOpen);
              return <div className="border-b border-border last:border-b-0" key={sector.key}>
                <button aria-expanded={open} className="m-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-5 py-3 text-left text-foreground hover:bg-accent/40 max-sm:px-4"
                  onClick={() => toggle(key, startsOpen)} type="button">
                  <ChevronRight aria-hidden="true" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-90')} />
                  <span className={cn('min-w-0 flex-1 truncate text-sm font-semibold', sector.key === 'none' && 'text-muted-foreground')}>{sector.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {pluralize(sector.people.length, 'colaborador', 'colaboradores')} · {pluralize(sector.certificateCount, 'certificado', 'certificados')}
                  </span>
                </button>
                {open && <ul aria-label={`Colaboradores de ${sector.name}`} className="m-0 list-none divide-y divide-border/70 p-0 pb-1">
                  {sector.people.map(person => <PersonCertificates key={person.id} person={person} />)}
                </ul>}
              </div>;
            })}
          </div>}
        </section>;
      })}
    </div>}
  </Page>;
}

/** One person and, under them, every certificate they were given. */
function PersonCertificates({ person }: { person: CertificatePerson }) {
  return <li className="grid gap-2.5 py-3 pr-5 pl-11 max-sm:px-4">
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[0.6875rem] font-bold text-accent-foreground">{initials(person.name)}</span>
      <div className="grid min-w-0 flex-1">
        <strong className="truncate text-sm">{person.name}</strong>
        <span className="truncate text-xs text-muted-foreground">
          {person.login}{person.registrationNumber ? ` · Matrícula ${person.registrationNumber}` : ''}
        </span>
      </div>
      {!person.isActive && <Badge variant="neutral">Inativo</Badge>}
    </div>
    <ul aria-label={`Certificados de ${person.name}`} className="m-0 grid list-none gap-1.5 p-0 pl-11 max-sm:pl-0">
      {person.certificates.map(certificate => <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2" key={certificate.id}>
        <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="grid min-w-0 flex-[1_1_12rem]">
          <span className="truncate text-sm font-medium">{certificate.eventTitle}</span>
          <span className="text-xs text-muted-foreground">Emitido em {issuedOn(certificate.issuedAt)}</span>
        </span>
        {certificate.isDemonstration && <Badge variant="warning">Demonstrativo</Badge>}
        <Button asChild size="sm" variant="outline">
          <a aria-label={`Baixar o certificado de ${certificate.eventTitle} de ${person.name}`} href={certificatePdfUrl(certificate.id)}>
            <Download /> Baixar PDF
          </a>
        </Button>
      </li>)}
    </ul>
  </li>;
}
