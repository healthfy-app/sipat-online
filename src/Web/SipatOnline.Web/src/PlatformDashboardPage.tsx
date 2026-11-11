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
  const activeCompanies = companies.filter((company) => company.isActive).length;

  return (
    <div className="page-content platform-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIPAT.ONLINE.ADMIN</p>
          <h1>Visão geral dos clientes</h1>
          <p className="muted-copy">
            Empresas organizadas pela quantidade de participantes ativos cadastrados.
          </p>
        </div>
        <button className="button button-quiet" onClick={() => void loadDashboard()} type="button">
          Atualizar
        </button>
      </div>

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-label="Resumo da plataforma" className="platform-summary-grid">
        <SummaryCard label="Empresas ativas" value={isLoading ? '—' : activeCompanies.toLocaleString('pt-BR')} />
        <SummaryCard label="Participantes ativos" value={isLoading ? '—' : totalEmployees.toLocaleString('pt-BR')} />
        <SummaryCard label="Contratos comerciais" value="Não disponíveis" note="O módulo de contratos ainda não existe" />
      </section>

      <section aria-labelledby="platform-clients-heading" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CLIENTES</p>
            <h2 id="platform-clients-heading">Empresas por número de participantes</h2>
          </div>
          <Link className="button button-secondary" to="/platform/companies">Cadastrar empresa</Link>
        </div>

        {isLoading ? (
          <LoadingState className="list-state">Carregando empresas...</LoadingState>
        ) : companies.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhuma empresa cadastrada ainda</h3>
            <p>Cadastre o primeiro cliente para começar a operação da plataforma.</p>
            <Link className="button button-primary" to="/platform/companies">Cadastrar empresa</Link>
          </div>
        ) : (
          <div className="platform-company-grid">
            {companies.map((company, index) => (
              <article className="platform-company-card" key={company.id}>
                <div className="platform-company-card-top">
                  <span className="platform-rank">#{index + 1}</span>
                  <span className={`status-pill${company.isActive ? ' status-active' : ''}`}>
                    {company.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <p className="eyebrow">{company.key}</p>
                <h3>{company.name}</h3>
                <strong className="platform-company-count">
                  {company.employeeCount.toLocaleString('pt-BR')}
                </strong>
                <span className="muted-copy">participantes ativos</span>
                <div className="platform-company-meta">
                  <span>{company.administratorCount} admins ativos</span>
                  <span>{company.totalUserCount} contas</span>
                </div>
                <Link className="learning-open-link" to={`/platform/users?tenant=${company.id}`}>
                  Ver usuários <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="platform-data-note">
        “Participantes ativos” conta usuários ativos com o perfil Participante. A plataforma ainda não
        armazena contratos, produtos vendidos ou limites contratados de funcionários.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <article className="platform-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar o painel.';
}
import LoadingState from './LoadingState';
