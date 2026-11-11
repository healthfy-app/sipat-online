import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable, FilterBar, PageHeader, StatusChip } from './AdminComponents';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';
import LoadingState from './LoadingState';

export default function PlatformHomePage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [search, setSearch] = useState('');
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
    () => companies.filter((company) =>
      `${company.name} ${company.key}`.toLocaleLowerCase('pt-BR').includes(term)),
    [companies, term],
  );
  const activeEmployeeCount = companies.reduce((sum, company) => sum + company.employeeCount, 0);

  return (
    <div className="page-content platform-home">
      <PageHeader
        actions={<Link className="button button-primary" to="/platform/companies">
          <span aria-hidden="true">+</span> Nova empresa
        </Link>}
        description={`${companies.length.toLocaleString('pt-BR')} ${companies.length === 1 ? 'empresa' : 'empresas'} · ${activeEmployeeCount.toLocaleString('pt-BR')} colaboradores ativos`}
        title="Empresas"
      />

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <FilterBar label="Busca de empresas">
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
      </FilterBar>

      <section aria-labelledby="home-companies-heading" className="list-section platform-company-list-section">
        <div className="section-heading">
          <h2 id="home-companies-heading">Diretório de empresas</h2>
          {!isLoading && <span className="count-label">{visibleCompanies.length} resultados</span>}
        </div>
        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : visibleCompanies.length === 0 ? (
          <p className="compact-empty">Nenhuma empresa encontrada.</p>
        ) : (
          <DataTable label="Empresas clientes">
            <thead>
              <tr>
                <th scope="col">Empresa</th>
                <th scope="col">Colaboradores</th>
                <th scope="col">Admins</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Ação</span></th>
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
                    {company.administratorCount === 0
                      ? <StatusChip variant="warning">Sem admin</StatusChip>
                      : company.administratorCount.toLocaleString('pt-BR')}
                  </td>
                  <td>
                    <StatusChip variant={company.isActive ? 'success' : 'neutral'}>
                      {company.isActive ? 'Ativa' : 'Inativa'}
                    </StatusChip>
                  </td>
                  <td className="admin-table-action">
                    <Link
                      aria-label={`Ver colaboradores de ${company.name}`}
                      className="button button-quiet"
                      to={`/platform/companies/${company.id}`}
                    >
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
