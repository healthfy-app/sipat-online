import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';
import { DataTable, FilterBar, PageHeader, StatusChip } from './AdminComponents';
import LoadingState from './LoadingState';

type CompanyStatusFilter = 'all' | 'active' | 'inactive';
type CompanySortKey = 'name' | 'participants' | 'administrators' | 'status';
type SortDirection = 'ascending' | 'descending';
const pageSize = 10;

export default function PlatformHomePage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>('all');
  const [sortKey, setSortKey] = useState<CompanySortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const showCompaniesWithoutAdmin = searchParams.get('sem-admin') === '1';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    getPlatformDashboard()
      .then((loadedCompanies) => {
        if (isCurrent) setCompanies(loadedCompanies);
      })
      .catch((loadError) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as empresas.');
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const term = search.trim().toLocaleLowerCase('pt-BR');
  const visibleCompanies = useMemo(
    () => companies.filter((company) => {
      const matchesSearch = `${company.name} ${company.key}`.toLocaleLowerCase('pt-BR').includes(term);
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active' ? company.isActive : !company.isActive);
      const matchesAdmin = !showCompaniesWithoutAdmin || company.administratorCount === 0;
      return matchesSearch && matchesStatus && matchesAdmin;
    }),
    [companies, showCompaniesWithoutAdmin, statusFilter, term],
  );
  const sortedCompanies = useMemo(() => [...visibleCompanies].sort((a, b) => {
    let comparison = 0;
    switch (sortKey) {
      case 'participants':
        comparison = a.employeeCount - b.employeeCount;
        break;
      case 'administrators':
        comparison = a.administratorCount - b.administratorCount;
        break;
      case 'status':
        comparison = Number(a.isActive) - Number(b.isActive);
        break;
      default:
        comparison = a.name.localeCompare(b.name, 'pt-BR');
    }
    return sortDirection === 'ascending' ? comparison : -comparison;
  }), [sortDirection, sortKey, visibleCompanies]);
  const pageCount = Math.max(1, Math.ceil(sortedCompanies.length / pageSize));
  const pageCompanies = sortedCompanies.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstItem = sortedCompanies.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, sortedCompanies.length);
  const companiesWithoutAdminCount = companies.filter((company) => company.administratorCount === 0).length;
  const hasActiveFilters = Boolean(term) || statusFilter !== 'all' || showCompaniesWithoutAdmin;
  function updateSort(nextKey: CompanySortKey) {
    setSortDirection(sortKey === nextKey && sortDirection === 'ascending' ? 'descending' : 'ascending');
    setSortKey(nextKey);
    setCurrentPage(1);
  }

  return (
    <div className="page-content platform-home">
      <PageHeader
        actions={<Link className="button button-primary" to="/platform/companies">+ Nova empresa</Link>}
        description="Pesquise, filtre e administre as empresas e os acessos da plataforma."
        eyebrow="SIPAT.ONLINE.ADMIN"
        title="Empresas"
        meta={!isLoading && (
          <span className="count-label">
            {hasActiveFilters
              ? `${visibleCompanies.length.toLocaleString('pt-BR')} de ${companies.length.toLocaleString('pt-BR')} exibidas`
              : `${companies.length.toLocaleString('pt-BR')} ${companies.length === 1 ? 'empresa' : 'empresas'}`}
          </span>
        )}
      />

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-labelledby="home-companies-heading" className="list-section platform-company-list-section">
        <div className="platform-company-list-heading">
          <div>
            <h2 id="home-companies-heading">Todas as empresas</h2>
            <p>Entre na administração de uma empresa ou consulte seus participantes.</p>
          </div>
          {!isLoading && !error && companiesWithoutAdminCount > 0 && (
            <aside aria-label="Empresas sem administrador" className="platform-company-admin-alert" role="status">
              <p>
                <strong>{companiesWithoutAdminCount.toLocaleString('pt-BR')} {companiesWithoutAdminCount === 1 ? 'empresa' : 'empresas'}</strong>
                {' '}sem administrador
              </p>
              <button
                aria-pressed={showCompaniesWithoutAdmin}
                className="button button-secondary"
                onClick={() => setSearchParams((current) => {
                  const next = new URLSearchParams(current);
                  if (showCompaniesWithoutAdmin) next.delete('sem-admin');
                  else next.set('sem-admin', '1');
                  setCurrentPage(1);
                  return next;
                })}
                type="button"
              >
                {showCompaniesWithoutAdmin ? 'Mostrar todas' : 'Ver quais'}
              </button>
            </aside>
          )}
        </div>
        <FilterBar className="platform-company-filters" label="Filtros de empresas">
          <div className="field">
            <label htmlFor="platform-home-search">Buscar empresa</label>
            <input
              id="platform-home-search"
              onChange={(event) => {
                setSearch(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Nome ou identificador"
              type="search"
              value={search}
            />
          </div>
          <div className="field">
            <label htmlFor="platform-company-status">Status</label>
            <select
              id="platform-company-status"
              onChange={(event) => {
                setStatusFilter(event.target.value as CompanyStatusFilter);
                setCurrentPage(1);
              }}
              value={statusFilter}
            >
              <option value="all">Todos</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
            </select>
          </div>
        </FilterBar>
        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : sortedCompanies.length === 0 ? (
          <p className="compact-empty">Nenhuma empresa encontrada. Tente outro nome ou identificador.</p>
        ) : (
          <DataTable className="platform-company-table" label="Diretório de empresas">
            <thead>
              <tr>
                <th aria-sort={sortKey === 'name' ? sortDirection : 'none'} scope="col">
                  <SortButton label="Empresa" active={sortKey === 'name'} direction={sortDirection}
                    onClick={() => updateSort('name')} />
                </th>
                <th aria-sort={sortKey === 'participants' ? sortDirection : 'none'} scope="col">
                  <SortButton label="Participantes" active={sortKey === 'participants'} direction={sortDirection}
                    onClick={() => updateSort('participants')} />
                </th>
                <th aria-sort={sortKey === 'administrators' ? sortDirection : 'none'} scope="col">
                  <SortButton label="Administradores" active={sortKey === 'administrators'} direction={sortDirection}
                    onClick={() => updateSort('administrators')} />
                </th>
                <th aria-sort={sortKey === 'status' ? sortDirection : 'none'} scope="col">
                  <SortButton label="Status" active={sortKey === 'status'} direction={sortDirection}
                    onClick={() => updateSort('status')} />
                </th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageCompanies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <small className="admin-table-secondary">{company.key}</small>
                  </td>
                  <td>{company.employeeCount.toLocaleString('pt-BR')}</td>
                  <td>
                    {company.administratorCount === 0 ? (
                      <Link
                        className="platform-admin-assignment-link"
                        to={`/platform/users?tenant=${company.id}&role=ClientAdmin`}
                      >
                        Atribuir administrador
                      </Link>
                    ) : (
                      `${company.administratorCount.toLocaleString('pt-BR')} ${company.administratorCount === 1 ? 'administrador' : 'administradores'}`
                    )}
                  </td>
                  <td>
                    <StatusChip variant={company.isActive ? 'success' : 'neutral'}>
                      {company.isActive ? 'Ativa' : 'Inativa'}
                    </StatusChip>
                  </td>
                  <td>
                    <div className="platform-company-actions">
                      <a
                        aria-label={`Administrar empresa ${company.name}`}
                        className="button button-primary platform-company-manage-action"
                        href={`/admin/dashboard?companyId=${encodeURIComponent(company.id)}`}
                      >
                        Administrar
                      </a>
                      <Link
                        aria-label={`Ver participantes de ${company.name}`}
                        className="button button-quiet platform-company-row-action"
                        to={`/platform/companies/${company.id}`}
                      >
                        Participantes
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {sortedCompanies.length > pageSize && (
          <nav aria-label="Paginação de empresas" className="platform-company-pagination">
            <span>Exibindo {firstItem}–{lastItem} de {sortedCompanies.length} empresas</span>
            <div>
              <button className="button button-quiet" disabled={currentPage === 1}
                onClick={() => setCurrentPage((page) => page - 1)} type="button">Anterior</button>
              <span aria-current="page">Página {currentPage} de {pageCount}</span>
              <button className="button button-quiet" disabled={currentPage === pageCount}
                onClick={() => setCurrentPage((page) => page + 1)} type="button">Próxima</button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`Ordenar por ${label.toLocaleLowerCase('pt-BR')}`}
      aria-pressed={active}
      className="platform-sort-button"
      onClick={onClick}
      type="button"
    >
      {label}
      <span aria-hidden="true">{active ? (direction === 'ascending' ? ' ↑' : ' ↓') : ' ↕'}</span>
    </button>
  );
}
