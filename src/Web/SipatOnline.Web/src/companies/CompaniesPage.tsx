import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, EllipsisVertical, LogIn, Plus, Power, PowerOff, Search, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { changeCompanyStatus, getPlatformDashboard, type PlatformCompanyOverview } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PlanBadge } from './PlanSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page } from '@/components/ui/page';
import '@/OpsIdentity.css';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import LoadingState from '@/LoadingState';
import AddAdministratorDialog from './AddAdministratorDialog';
import CompanyAddress from './CompanyAddress';
import CompanyAvatar from './CompanyAvatar';
import CreateCompanyDialog from './CreateCompanyDialog';

type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name' | 'participants' | 'status';
type SortDirection = 'ascending' | 'descending';
const pageSize = 10;

export default function CompaniesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminTarget, setAdminTarget] = useState<PlatformCompanyOverview | null>(null);
  const [statusTarget, setStatusTarget] = useState<PlatformCompanyOverview | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');

  /** Turns the chosen company off or back on, then reads the list again. */
  async function changeStatus() {
    if (!statusTarget) return;
    const activate = !statusTarget.isActive;
    setStatusBusy(true); setStatusError('');
    try {
      await changeCompanyStatus(statusTarget.id, activate);
      setNotice(activate
        ? `${statusTarget.name} foi reativada. O endereço volta a abrir em até 10 minutos.`
        : `${statusTarget.name} foi inativada. O portal dela não abre mais.`);
      setStatusTarget(null);
      await load();
    } catch (failure) {
      setStatusError(failure instanceof Error ? failure.message : 'Não foi possível alterar a empresa.');
    } finally { setStatusBusy(false); }
  }
  const isCreating = searchParams.get('nova-empresa') === '1';

  async function load() {
    setError('');
    try {
      setCompanies(await getPlatformDashboard());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as empresas.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function setParam(name: string, enabled: boolean) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (enabled) next.set(name, '1');
      else next.delete(name);
      return next;
    });
  }

  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visible = useMemo(() => companies.filter((company) =>
    `${company.name} ${company.key}`.toLocaleLowerCase('pt-BR').includes(term)
    && (statusFilter === 'all' || (statusFilter === 'active' ? company.isActive : !company.isActive))), [companies, statusFilter, term]);

  // the numbers of the top speak of what is running: an inactive company and its people are out of them
  const running = useMemo(() => companies.filter((company) => company.isActive), [companies]);
  const stopped = companies.length - running.length;
  const participants = running.reduce((sum, company) => sum + company.employeeCount, 0);

  const sorted = useMemo(() => [...visible].sort((a, b) => {
    // whatever the order asked for, the inactive ones come after the ones that are running
    if (sortKey !== 'status' && a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const comparison = sortKey === 'participants' ? a.employeeCount - b.employeeCount
        : sortKey === 'status' ? Number(a.isActive) - Number(b.isActive)
          : a.name.localeCompare(b.name, 'pt-BR');
    return sortDirection === 'ascending' ? comparison : -comparison;
  }), [sortDirection, sortKey, visible]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstItem = sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, sorted.length);
  const hasFilters = Boolean(term) || statusFilter !== 'all';

  function sortBy(key: SortKey) {
    setSortDirection(sortKey === key && sortDirection === 'ascending' ? 'descending' : 'ascending');
    setSortKey(key);
    setCurrentPage(1);
  }

  const sortable = (key: SortKey, label: string, className?: string) => (
    <TableHead aria-sort={sortKey === key ? sortDirection : 'none'} className={className} scope="col">
      <button
        aria-label={`Ordenar por ${label.toLocaleLowerCase('pt-BR')}`}
        aria-pressed={sortKey === key}
        className="m-0 inline-flex min-h-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 [color:inherit] [font:inherit] [letter-spacing:inherit] uppercase hover:text-foreground"
        onClick={() => sortBy(key)}
        type="button"
      >
        {label}
        {sortKey !== key ? <ArrowUpDown className="size-3 opacity-50" /> : sortDirection === 'ascending' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      </button>
    </TableHead>
  );

  return (
    <div className="page-content">
      <Page>
        <header className="ops-hero" data-slot="page-header">
          <div className="ops-hero-copy">
            <p className="ops-hero-eyebrow">Operação da plataforma</p>
            <h1 className="ops-hero-title">Empresas</h1>
            <p className="ops-hero-lead">{isLoading ? 'Carregando empresas...'
              : hasFilters ? `${visible.length} de ${companies.length} exibidas`
                : `${pluralize(running.length, 'empresa ativa', 'empresas ativas')} na plataforma`}</p>
            {!isLoading && <ul aria-label="Resumo das empresas" className="ops-hero-stats">
              <li><strong>{running.length}</strong> {running.length === 1 ? 'empresa ativa' : 'empresas ativas'}</li>
              <li><strong>{participants.toLocaleString('pt-BR')}</strong> {participants === 1 ? 'participante' : 'participantes'}</li>
              {stopped > 0 && <li className="opacity-70"><strong>{stopped}</strong> {stopped === 1 ? 'inativa' : 'inativas'}</li>}
            </ul>}
          </div>
          <div className="ops-hero-actions">
            <Button className="ops-primary" onClick={() => setParam('nova-empresa', true)}><Plus /> Nova empresa</Button>
          </div>
        </header>

        {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 size-4" />
            <Input aria-label="Buscar empresa" className="pl-9" placeholder="Buscar por nome ou identificador" type="search" value={search}
              onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} />
          </label>
          <NativeSelect aria-label="Status" className="w-auto max-sm:w-full max-sm:basis-full" value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setCurrentPage(1); }}>
            <option value="all">Todos os status</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </NativeSelect>
        </div>

        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : sorted.length === 0 ? (
          <EmptyState description="Tente outro nome ou identificador, ou limpe os filtros." title="Nenhuma empresa encontrada." />
        ) : (
          <div className="ops-table"><Table aria-label="Diretório de empresas">
            <TableHeader>
              <TableRow>
                {sortable('name', 'Empresa')}
                <TableHead className="max-lg:hidden" scope="col">Plano</TableHead>
                {sortable('participants', 'Participantes', 'max-md:hidden text-right')}
                {sortable('status', 'Status', 'max-sm:hidden')}
                <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((company) => (
                <TableRow className={cn('cursor-pointer', !company.isActive && 'bg-muted/40')} key={company.id} onClick={() => navigate(`/platform/companies/${company.id}`)}>
                  <TableCell>
                    <div className={cn('flex min-w-0 items-center gap-3', !company.isActive && 'opacity-60')}>
                      <CompanyAvatar logo={company.logoReference} name={company.name} />
                      <div className="grid min-w-0">
                        <Link
                          aria-label={`Abrir empresa ${company.name}`}
                          className="truncate font-extrabold tracking-[-0.01em] text-foreground no-underline hover:underline"
                          onClick={(event) => event.stopPropagation()}
                          to={`/platform/companies/${company.id}`}
                        >
                          {company.name}
                        </Link>
                        <CompanyAddress companyKey={company.key} inactive={!company.isActive} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-lg:hidden"><PlanBadge plan={company.plan ?? 'Diamante'} /></TableCell>
                  <TableCell className={cn('text-right tabular-nums max-md:hidden', !company.isActive && 'text-muted-foreground')}
                    title={company.isActive ? undefined : 'Não entram no total: a empresa está inativa'}>{company.employeeCount.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="max-sm:hidden">
                    {/* active is the normal case and stays quiet; only an inactive company stands out */}
                    {company.isActive
                      ? <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Ativa</span>
                      : <Badge variant="warning">Inativa</Badge>}
                  </TableCell>
                  <TableCell className="py-2 pr-2 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Link className="companies-open inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold text-primary no-underline hover:bg-accent"
                        tabIndex={-1} to={`/platform/companies/${company.id}`}>
                        Abrir <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-label={`Ações da empresa ${company.name}`} size="icon-sm" variant="ghost"><EllipsisVertical /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem asChild>
                            <a href={`/admin/dashboard?companyId=${encodeURIComponent(company.id)}`}><LogIn /> Entrar no painel da empresa</a>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setAdminTarget(company)}><UserPlus /> Adicionar administrador</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {company.isActive
                            ? <DropdownMenuItem onSelect={() => { setStatusError(''); setStatusTarget(company); }} variant="destructive"><PowerOff /> Inativar empresa</DropdownMenuItem>
                            : <DropdownMenuItem onSelect={() => { setStatusError(''); setStatusTarget(company); }}><Power /> Reativar empresa</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></div>
        )}

        {sorted.length > pageSize && (
          <nav aria-label="Paginação de empresas" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Exibindo {firstItem}–{lastItem} de {sorted.length} empresas</span>
            <div className="flex items-center gap-2">
              <Button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)} size="sm" variant="outline">Anterior</Button>
              <span aria-current="page" className="tabular-nums">Página {currentPage} de {pageCount}</span>
              <Button disabled={currentPage === pageCount} onClick={() => setCurrentPage((page) => page + 1)} size="sm" variant="outline">Próxima</Button>
            </div>
          </nav>
        )}
      </Page>

      {isCreating && (
        <CreateCompanyDialog
          onClose={() => setParam('nova-empresa', false)}
          onCreated={async (company) => {
            setParam('nova-empresa', false);
            setNotice(`${company.name} foi cadastrada e o administrador inicial foi criado.`);
            await load();
          }}
        />
      )}

      {adminTarget && (
        <AddAdministratorDialog
          companyId={adminTarget.id}
          companyName={adminTarget.name}
          onClose={() => setAdminTarget(null)}
          onCreated={async (administrator) => {
            setAdminTarget(null);
            setNotice(`${administrator.displayName} agora administra a ${adminTarget.name}.`);
            await load();
          }}
        />
      )}

      {statusTarget && (
        <Dialog
          description={statusTarget.isActive
            ? 'A empresa continua cadastrada, com participantes, treinamentos, progresso e certificados guardados.'
            : 'A empresa volta a funcionar como antes, com tudo o que tinha.'}
          onClose={() => { if (!statusBusy) setStatusTarget(null); }}
          title={statusTarget.isActive ? `Inativar ${statusTarget.name}?` : `Reativar ${statusTarget.name}?`}
        >
          <div className="grid gap-4">
            {statusTarget.isActive
              ? <ul className="m-0 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
                <li>O portal da empresa para de abrir na hora, para participantes e administradores.</li>
                <li>Ninguém entra, assiste ou emite certificado enquanto ela estiver inativa.</li>
                <li>Nada é apagado: reativar devolve tudo.</li>
              </ul>
              : <ul className="m-0 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
                <li>O portal volta a abrir para participantes e administradores.</li>
                <li>O endereço seguro (HTTPS) pode levar até 10 minutos para voltar.</li>
              </ul>}
            {statusError && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{statusError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={statusBusy} onClick={() => setStatusTarget(null)} variant="outline">Cancelar</Button>
              <Button disabled={statusBusy} onClick={() => void changeStatus()} variant={statusTarget.isActive ? 'destructive' : 'default'}>
                {statusBusy ? 'Salvando...' : statusTarget.isActive ? 'Inativar empresa' : 'Reativar empresa'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
