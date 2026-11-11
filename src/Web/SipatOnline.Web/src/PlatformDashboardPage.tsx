import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';

export default function PlatformDashboardPage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setCompanies(await getPlatformDashboard());
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totalEmployees = companies.reduce((sum, company) => sum + company.employeeCount, 0);
  const companiesWithoutAdmin = companies.filter((company) => company.administratorCount === 0);

  return (
    <div className="page-content platform-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIPAT.ONLINE.ADMIN</p>
          <h1>Visão geral</h1>
          <p className="muted-copy">Acompanhe o tamanho de cada cliente e quem ainda precisa de um administrador.</p>
        </div>
        <button className="button button-quiet" onClick={() => void loadDashboard()} type="button">
          Atualizar
        </button>
      </div>

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-label="Resumo da plataforma" className="platform-summary-grid">
        <SummaryCard label="Empresas" value={isLoading ? '—' : companies.length.toLocaleString('pt-BR')} />
        <SummaryCard label="Participantes" value={isLoading ? '—' : totalEmployees.toLocaleString('pt-BR')} />
        <SummaryCard
          href="/platform?sem-admin=1"
          label="Empresas sem administrador"
          note="Ver quais"
          value={isLoading ? '—' : companiesWithoutAdmin.length.toLocaleString('pt-BR')}
        />
      </section>

      <section aria-labelledby="platform-clients-heading" className="list-section">
        <div className="section-heading">
          <div>
            <h2 id="platform-clients-heading">Empresas por participantes</h2>
          </div>
          <Link className="button button-secondary" to="/platform/companies">Nova empresa</Link>
        </div>

        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : companies.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhuma empresa cadastrada ainda</h3>
            <p>Cadastre o primeiro cliente para começar a operação da plataforma.</p>
            <Link className="button button-primary" to="/platform/companies">Nova empresa</Link>
          </div>
        ) : (
          <div className="platform-company-grid">
            {companies.map((company) => (
              <Link
                aria-label={`Ver participantes de ${company.name}`}
                className="platform-company-card-link"
                key={company.id}
                to={`/platform/users?tenant=${company.id}&role=Participant`}
              >
                <article className="platform-company-card">
                  <div className="platform-company-card-top">
                    <div className="platform-company-heading">
                      <h3>{company.name}</h3>
                      <span className="platform-company-key">{company.key}</span>
                    </div>
                    {!company.isActive && <span className="admin-status-chip admin-status-neutral">Inativa</span>}
                  </div>
                  <p className="platform-company-participant-count">
                    <strong>{company.employeeCount.toLocaleString('pt-BR')}</strong>
                    <span>participantes</span>
                  </p>
                  {company.administratorCount === 0 ? (
                    <span className="platform-company-no-admin">Sem administrador</span>
                  ) : (
                    <span className="platform-company-admin-count">
                      {company.administratorCount.toLocaleString('pt-BR')}{' '}
                      {company.administratorCount === 1 ? 'administrador' : 'administradores'}
                    </span>
                  )}
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, note, href }: { label: string; value: string; note?: string; href?: string }) {
  const content = <>
    <span>{label}</span>
    <strong>{value}</strong>
    {note && <small>{note} <span aria-hidden="true">→</span></small>}
  </>;

  if (href) {
    return <Link className="platform-summary-card platform-summary-card-link" to={href}>{content}</Link>;
  }

  return (
    <article className="platform-summary-card">
      {content}
    </article>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar o painel.';
}
import LoadingState from './LoadingState';
