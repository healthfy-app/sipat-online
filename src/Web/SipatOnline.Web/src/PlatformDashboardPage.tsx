import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';
import { DataTable, PageHeader, StatusChip } from './AdminComponents';
import LoadingState from './LoadingState';

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
      <PageHeader
        actions={<button className="button button-quiet" onClick={() => void loadDashboard()} type="button">
          Atualizar
        </button>}
        description="Empresas organizadas pela quantidade de participantes ativos cadastrados."
        eyebrow="PLATAFORMA"
        title="Visão geral dos clientes"
      />

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-label="Resumo da plataforma" className="platform-summary-grid">
        <SummaryCard label="Empresas ativas" value={isLoading ? '—' : activeCompanies.toLocaleString('pt-BR')} />
        <SummaryCard label="Participantes ativos" value={isLoading ? '—' : totalEmployees.toLocaleString('pt-BR')} />
        <SummaryCard label="Contratos comerciais" value="Não disponíveis" note="O módulo de contratos ainda não existe" />
      </section>

      <section aria-labelledby="platform-clients-heading" className="list-section">
        <div className="section-heading">
          <div>
            <h2 id="platform-clients-heading">Empresas por número de participantes</h2>
          </div>
          <Link className="button button-secondary" to="/platform">Ver empresas</Link>
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
          <DataTable label="Empresas por número de participantes">
            <thead>
              <tr>
                <th scope="col">Empresa</th>
                <th scope="col">Participantes ativos</th>
                <th scope="col">Admins ativos</th>
                <th scope="col">Contas</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Ação</span></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <small className="admin-table-secondary">{company.key}</small>
                  </td>
                  <td>{company.employeeCount.toLocaleString('pt-BR')}</td>
                  <td>{company.administratorCount.toLocaleString('pt-BR')}</td>
                  <td>{company.totalUserCount.toLocaleString('pt-BR')}</td>
                  <td>
                    <StatusChip variant={company.isActive ? 'success' : 'neutral'}>
                      {company.isActive ? 'Ativa' : 'Inativa'}
                    </StatusChip>
                  </td>
                  <td className="admin-table-action">
                    <Link
                      aria-label={`Ver usuários de ${company.name}`}
                      className="button button-quiet"
                      to={`/platform/users?tenant=${company.id}`}
                    >
                      Ver usuários <span aria-hidden="true">→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
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
