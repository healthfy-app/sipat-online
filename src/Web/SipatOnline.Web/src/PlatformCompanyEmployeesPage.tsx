import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPlatformCompanyEmployees,
  getPlatformDashboard,
  type PlatformCompanyEmployeePage,
  type PlatformCompanyOverview,
} from './api';
import CompanyLearningPanel from './CompanyLearningPanel';
import ParticipantOutcomesPanel from './ParticipantOutcomesPanel';
import CompanyCertificateLogoPanel from './CompanyCertificateLogoPanel';
import { DataTable, PageHeader, StatusChip } from './AdminComponents';

const pageSize = 50;

export default function PlatformCompanyEmployeesPage() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const [page, setPage] = useState<PlatformCompanyEmployeePage | null>(null);
  const [companyOverview, setCompanyOverview] = useState<PlatformCompanyOverview | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    setSummaryError('');
    getPlatformDashboard()
      .then((companies) => {
        if (isCurrent) setCompanyOverview(companies.find((company) => company.id === companyId) ?? null);
      })
      .catch((loadError) => {
        if (isCurrent) {
          setCompanyOverview(null);
          setSummaryError(loadError instanceof Error
            ? loadError.message
            : 'Não foi possível carregar os indicadores da empresa.');
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [companyId]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setError('');
    getPlatformCompanyEmployees(companyId, { offset, limit: pageSize, search, includeInactive })
      .then((result) => {
        if (isCurrent) setPage(result);
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        setPage(null);
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os colaboradores.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [companyId, includeInactive, offset, search]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  }

  const currentPage = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil((page?.totalCount ?? 0) / pageSize));

  return (
    <div className="page-content platform-company-employees">
      <nav aria-label="Breadcrumb">
        <ol className="admin-breadcrumb">
          <li><Link to="/platform">Empresas</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{page?.companyName ?? 'Empresa'}</li>
        </ol>
      </nav>

      <PageHeader
        actions={(
          <div className="company-detail-actions">
            <CompanyLearningPanel companyId={companyId} />
            <CompanyCertificateLogoPanel companyId={companyId} />
            <a className="button button-primary" href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}>
              Administrar empresa
            </a>
          </div>
        )}
        description={page ? `Identificador · ${page.companyKey}` : 'Carregando dados da empresa...'}
        meta={companyOverview && (
          <StatusChip variant={companyOverview.isActive ? 'success' : 'neutral'}>
            {companyOverview.isActive ? 'Ativa' : 'Inativa'}
          </StatusChip>
        )}
        title={page?.companyName ?? (isLoading ? 'Carregando empresa...' : 'Colaboradores')}
      />

      {summaryError && <p className="form-error page-error" role="alert">{summaryError}</p>}
      {(page || companyOverview) && (
        <section aria-label="Resumo da empresa" className="company-summary-grid">
          <article className="company-summary-card">
            <span>Colaboradores</span>
            <strong>{(companyOverview?.employeeCount ?? page?.totalCount ?? 0).toLocaleString('pt-BR')}</strong>
            <small>{companyOverview ? 'Ativos' : 'Na listagem atual'}</small>
          </article>
          {companyOverview && (
            <article className="company-summary-card">
              <span>Administradores</span>
              <strong>{companyOverview.administratorCount.toLocaleString('pt-BR')}</strong>
              <small>Com acesso de administração</small>
            </article>
          )}
        </section>
      )}

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-label="Filtros de colaboradores" className="company-employee-filters">
        <form className="company-employee-search" onSubmit={handleSearch}>
          <div className="field">
            <label htmlFor="employee-search">Buscar por nome ou matrícula</label>
            <input
              id="employee-search"
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Digite para buscar"
              type="search"
              value={searchInput}
            />
          </div>
          <button className="button button-secondary" type="submit">Buscar</button>
        </form>
        <label className="company-employee-inactive-filter">
          <input
            checked={includeInactive}
            onChange={(event) => {
              setOffset(0);
              setIncludeInactive(event.target.checked);
            }}
            type="checkbox"
          />
          Incluir colaboradores inativos
        </label>
      </section>

      <section aria-labelledby="company-employees-heading" className="list-section">
        <div className="section-heading">
          <h2 id="company-employees-heading">Colaboradores</h2>
          <span className="count-label">
            {(page?.totalCount ?? 0).toLocaleString('pt-BR')} resultados
          </span>
        </div>
        {isLoading ? (
          <LoadingState className="list-state">Carregando colaboradores...</LoadingState>
        ) : page && page.items.length > 0 ? (
          <>
            <DataTable className="company-employee-table" label="Colaboradores da empresa">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Matrícula</th>
                  <th scope="col">Conclusão</th>
                  <th scope="col">Status</th>
                  <th scope="col">Atividades e certificados</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((employee) => (
                  <tr key={employee.id}>
                    <td><strong>{employee.displayName}</strong></td>
                    <td>{employee.loginIdentifier}</td>
                    <td>
                      <div
                        aria-label={`${employee.progressPercentage}% concluído; ${employee.completedLessonCount} de ${employee.lessonCount} aulas`}
                        className="employee-progress"
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={employee.progressPercentage}
                        role="progressbar"
                      >
                        <span aria-hidden="true" className="employee-progress-track">
                          <span style={{ width: `${employee.progressPercentage}%` }} />
                        </span>
                        <strong>{employee.progressPercentage}%</strong>
                      </div>
                    </td>
                    <td>
                      <StatusChip variant={employee.isActive ? 'success' : 'neutral'}>
                        {employee.isActive ? 'Ativo' : 'Inativo'}
                      </StatusChip>
                    </td>
                    <td><ParticipantOutcomesPanel participantId={employee.id} companyId={companyId} /></td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div aria-label="Paginação de colaboradores" className="company-employee-pagination">
              <span>
                Página {currentPage} de {pageCount} · {page.totalCount.toLocaleString('pt-BR')} resultados
              </span>
              <div>
                <button
                  className="button button-quiet"
                  disabled={offset === 0 || isLoading}
                  onClick={() => setOffset(Math.max(0, offset - pageSize))}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  className="button button-quiet"
                  disabled={offset + pageSize >= page.totalCount || isLoading}
                  onClick={() => setOffset(offset + pageSize)}
                  type="button"
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="compact-empty">
            {search ? 'Nenhum colaborador encontrado para essa busca.' : 'Nenhum colaborador para exibir.'}
          </p>
        )}
      </section>
    </div>
  );
}
import LoadingState from './LoadingState';
