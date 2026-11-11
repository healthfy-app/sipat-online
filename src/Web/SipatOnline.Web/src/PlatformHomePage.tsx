import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';

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

  const term = search.trim().toLowerCase();
  const visibleCompanies = useMemo(
    () => companies.filter((company) => `${company.name} ${company.key}`.toLowerCase().includes(term)),
    [companies, term],
  );

  return (
    <div className="page-content platform-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIPAT.ONLINE.ADMIN</p>
          <h1>Empresas</h1>
          <p className="muted-copy">Acompanhe as empresas e acesse a lista de colaboradores.</p>
        </div>
        <Link className="button button-secondary" to="/platform/companies">Nova empresa</Link>
      </div>

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <div className="field platform-home-search">
        <label htmlFor="platform-home-search">Buscar empresa</label>
        <input
          id="platform-home-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nome ou identificador"
          type="search"
          value={search}
        />
      </div>

      <section aria-labelledby="home-companies-heading" className="list-section platform-company-list-section">
        <div className="section-heading">
          <h2 id="home-companies-heading">Empresas ({visibleCompanies.length})</h2>
        </div>
        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : visibleCompanies.length === 0 ? (
          <p className="compact-empty">Nenhuma empresa encontrada.</p>
        ) : (
          <ul className="platform-home-list">
            {visibleCompanies.map((company) => (
              <li key={company.id}>
                <span className="platform-company-row-copy">
                  <strong>{company.name}</strong>
                  <small>
                    {company.employeeCount.toLocaleString('pt-BR')} colaboradores ativos
                    <span aria-hidden="true"> · </span>
                    {company.administratorCount.toLocaleString('pt-BR')}{' '}
                    {company.administratorCount === 1 ? 'administrador' : 'administradores'}
                  </small>
                </span>
                <span className={`status-pill${company.isActive ? ' status-active' : ''}`}>
                  {company.isActive ? 'Ativa' : 'Inativa'}
                </span>
                {company.isActive && <a
                  aria-label={`Administrar ${company.name}`}
                  className="button button-secondary"
                  href={`/admin/dashboard?companyId=${encodeURIComponent(company.id)}`}
                >Administrar empresa</a>}
                <Link
                  aria-label={`Ver colaboradores de ${company.name}`}
                  className="button button-quiet"
                  to={`/platform/companies/${company.id}`}
                >
                  Ver colaboradores <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
import LoadingState from './LoadingState';
