import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlatformDashboard, type PlatformCompanyOverview } from './api';
import { PageHeader } from './AdminComponents';

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
      <PageHeader
        actions={<button className="button button-quiet" onClick={() => void loadDashboard()} type="button">
          Atualizar
        </button>}
        description="Acompanhe os indicadores e resolva pendências de acesso da plataforma."
        eyebrow="SIPAT.ONLINE.ADMIN"
        title="Visão geral"
      />

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-label="Indicadores da plataforma" className="platform-summary-grid platform-dashboard-summary">
        <SummaryCard label="Empresas cadastradas" value={isLoading || error ? '—' : companies.length.toLocaleString('pt-BR')} />
        <SummaryCard label="Participantes" value={isLoading || error ? '—' : totalEmployees.toLocaleString('pt-BR')} />
        <SummaryCard
          href="/platform?sem-admin=1"
          label="Empresas sem administrador"
          note="Ver quais"
          value={isLoading || error ? '—' : companiesWithoutAdmin.length.toLocaleString('pt-BR')}
        />
      </section>

      <section aria-label="Acompanhamento da plataforma" className="platform-dashboard-panels">
        <article className={`platform-dashboard-attention${isLoading || error ? ' is-loading' : companiesWithoutAdmin.length ? ' is-warning' : ' is-clear'}`}>
          <div>
            <p className="eyebrow">
              {isLoading ? 'ACOMPANHAMENTO' : error ? 'ERRO NA CONSULTA' : companies.length === 0 ? 'COMECE POR AQUI'
                : companiesWithoutAdmin.length ? 'PENDÊNCIA DE ACESSO' : 'TUDO EM DIA'}
            </p>
            <h2>
              {isLoading ? 'Verificando administradores...'
                : error ? 'Não foi possível verificar os dados'
                  : companies.length === 0 ? 'Nenhuma empresa cadastrada'
                    : companiesWithoutAdmin.length
                      ? 'Algumas empresas precisam de um administrador'
                      : 'Todas as empresas têm administrador'}
            </h2>
            <p>
              {isLoading ? 'Os dados serão atualizados assim que o carregamento terminar.'
                : error ? 'Atualize o painel para tentar novamente.'
                  : companies.length === 0 ? 'Cadastre o primeiro cliente para começar a operação da plataforma.'
                    : companiesWithoutAdmin.length
                      ? 'Revise essas empresas e associe uma pessoa responsável para liberar a gestão local.'
                      : 'Não há empresas aguardando a configuração de um administrador.'}
            </p>
          </div>
          {!isLoading && !error && companies.length === 0
            ? <Link className="button button-secondary" to="/platform/companies">Cadastrar empresa</Link>
            : !isLoading && !error && companiesWithoutAdmin.length > 0
              ? <Link className="button button-secondary" to="/platform?sem-admin=1">Revisar empresas</Link>
              : null}
        </article>

        <section aria-labelledby="platform-dashboard-shortcuts" className="platform-dashboard-shortcuts">
          <div>
            <h2 id="platform-dashboard-shortcuts">Acessos rápidos</h2>
            <p>Vá direto para a tarefa que precisa resolver.</p>
          </div>
          <Link className="platform-dashboard-shortcut" to="/platform">
            <span><strong>Gerenciar empresas</strong><small>Buscar, filtrar e administrar clientes</small></span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link className="platform-dashboard-shortcut" to="/platform/companies">
            <span><strong>Cadastrar empresa</strong><small>Criar um novo espaço de cliente</small></span>
            <span aria-hidden="true">→</span>
          </Link>
        </section>
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
