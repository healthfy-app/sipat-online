import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, EllipsisVertical, LogIn, Plus, Search, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PlanBadge } from './PlanSelect';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page } from '@/components/ui/page';
import '@/OpsIdentity.css';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import AddAdministratorDialog from './AddAdministratorDialog';
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

  const sorted = useMemo(() => [...visible].sort((a, b) => {
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
        className="m-0 inline-flex min-h-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[inherit] font-[inherit] uppercase tracking-[inherit] text-[inherit] hover:text-foreground"
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
                : `${pluralize(companies.length, 'empresa', 'empresas')} na plataforma`}</p>
            {!isLoading && <ul aria-label="Resumo das empresas" className="ops-hero-stats">
              <li><strong>{companies.length}</strong> {companies.length === 1 ? 'empresa' : 'empresas'}</li>
              <li><strong>{companies.filter((company) => company.isActive).length}</strong> ativas</li>
              <li><strong>{companies.reduce((sum, company) => sum + company.employeeCount, 0).toLocaleString('pt-BR')}</strong> participantes</li>
            </ul>}
          </div>
          <div className="ops-hero-actions">
            <Button className="ops-primary" onClick={() => setParam('nova-empresa', true)}><Plus /> Nova empresa</Button>
          </div>
        </header>

        {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        <div className="ops-card flex flex-wrap items-center gap-2.5 p-4">
          <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 size-4" />
            <Input aria-label="Buscar empresa" className="pl-9" placeholder="Buscar por nome ou identificador" type="search" value={search}
              onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} />
          </label>
          <NativeSelect aria-label="Status" className="w-auto max-sm:flex-1" value={statusFilter}
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
                {sortable('participants', 'Participantes', 'max-md:hidden')}
                {sortable('status', 'Status', 'max-sm:hidden')}
                <TableHead className="w-12"><span className="sr-only">Ações</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((company) => (
                <TableRow className="cursor-pointer" key={company.id} onClick={() => navigate(`/platform/companies/${company.id}`)}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <CompanyAvatar name={company.name} />
                      <div className="grid min-w-0">
                        <Link
                          aria-label={`Abrir empresa ${company.name}`}
                          className="truncate font-extrabold tracking-[-0.01em] text-[#12332c] no-underline hover:underline"
                          onClick={(event) => event.stopPropagation()}
                          to={`/platform/companies/${company.id}`}
                        >
                          {company.name}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">{company.key}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-lg:hidden"><PlanBadge plan={company.plan ?? 'Diamante'} /></TableCell>
                  <TableCell className="tabular-nums max-md:hidden">{company.employeeCount.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="max-sm:hidden">
                    <Badge variant={company.isActive ? 'success' : 'neutral'}>{company.isActive ? 'Ativa' : 'Inativa'}</Badge>
                  </TableCell>
                  <TableCell className="py-2 pr-2 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Link className="ops-pill" to={`/platform/companies/${company.id}`}>Entrar <ArrowRight aria-hidden="true" /></Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button aria-label={`Ações da empresa ${company.name}`} size="icon-sm" variant="ghost"><EllipsisVertical /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem asChild>
                            <a href={`/admin/dashboard?companyId=${encodeURIComponent(company.id)}`}><LogIn /> Entrar no painel da empresa</a>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setAdminTarget(company)}><UserPlus /> Adicionar administrador</DropdownMenuItem>
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
    </div>
  );
}
