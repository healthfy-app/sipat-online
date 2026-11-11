import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';
import { DataTable, FilterBar, PageHeader, StatusChip } from './AdminComponents';
import LoadingState from './LoadingState';

type CompanyStatusFilter = 'all' | 'active' | 'inactive';

export default function PlatformHomePage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>('all');
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
      return matchesSearch && matchesStatus;
    }),
    [companies, statusFilter, term],
  );
  const activeEmployeeCount = companies
    .filter((company) => company.isActive)
    .reduce((total, company) => total + company.employeeCount, 0);

  return (
    <div className="page-content platform-home">
      <PageHeader
        actions={<Link className="button button-primary" to="/platform/companies">+ Nova empresa</Link>}
        description={isLoading
          ? 'Carregando indicadores das empresas...'
          : `${companies.length.toLocaleString('pt-BR')} ${companies.length === 1 ? 'empresa' : 'empresas'} · ${activeEmployeeCount.toLocaleString('pt-BR')} colaboradores ativos`}
        eyebrow="SIPAT.ONLINE.ADMIN"
        title="Empresas"
        meta={<span className="count-label">{visibleCompanies.length.toLocaleString('pt-BR')} exibidas</span>}
      />

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <FilterBar className="platform-company-filters" label="Filtros de empresas">
        <div className="field">
          <label htmlFor="platform-home-search">Buscar empresa</label>
          <input
            id="platform-home-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou identificador"
            type="search"
            value={search}
          />
        </div>
        <div className="field">
          <label htmlFor="platform-company-status">Status</label>
          <select
            id="platform-company-status"
            onChange={(event) => setStatusFilter(event.target.value as CompanyStatusFilter)}
            value={statusFilter}
          >
            <option value="all">Todos</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </div>
      </FilterBar>

      <section aria-labelledby="home-companies-heading" className="list-section platform-company-list-section">
        <div className="section-heading">
          <h2 id="home-companies-heading">Diretório de empresas</h2>
        </div>
        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : visibleCompanies.length === 0 ? (
          <p className="compact-empty">Nenhuma empresa encontrada.</p>
        ) : (
          <DataTable className="platform-company-table" label="Diretório de empresas">
            <thead>
              <tr>
                <th scope="col">Empresa</th>
                <th scope="col">Colaboradores</th>
                <th scope="col">Admins</th>
                <th scope="col">Status</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <small className="admin-table-secondary">{company.key}</small>
                  </td>
                  <td>{company.employeeCount.toLocaleString('pt-BR')}</td>
                  <td>
                    {company.administratorCount === 0 ? (
                      <StatusChip variant="warning">Sem admin</StatusChip>
                    ) : (
                      company.administratorCount.toLocaleString('pt-BR')
                    )}
                  </td>
                  <td>
                    <StatusChip variant={company.isActive ? 'success' : 'neutral'}>
                      {company.isActive ? 'Ativa' : 'Inativa'}
                    </StatusChip>
                  </td>
                  <td>
                    <Link className="admin-link" to={`/platform/companies/${company.id}`}>
                      Ver colaboradores <span aria-hidden="true">→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
