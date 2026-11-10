import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getPlatformDashboard,
  listPlatformCourses,
  type PlatformCompanyOverview,
  type PlatformCourse,
} from './api';

const statusLabels = { Draft: 'Rascunho', Published: 'Publicado' } as const;

export default function PlatformHomePage() {
  const [companies, setCompanies] = useState<PlatformCompanyOverview[]>([]);
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    Promise.all([getPlatformDashboard(), listPlatformCourses()])
      .then(([loadedCompanies, loadedCourses]) => {
        if (!isCurrent) return;
        setCompanies(loadedCompanies);
        setCourses(loadedCourses);
      })
      .catch((loadError) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a operação.');
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
  const visibleCourses = useMemo(
    () => courses.filter((course) => course.title.toLowerCase().includes(term)),
    [courses, term],
  );

  return (
    <div className="page-content platform-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SIPAT.ONLINE.ADMIN</p>
          <h1>Operação</h1>
          <p className="muted-copy">Todas as empresas clientes e todos os treinamentos em andamento.</p>
        </div>
        <Link className="button button-secondary" to="/platform/dashboard">Ver painel de indicadores</Link>
      </div>

      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <div className="field platform-home-search">
        <label htmlFor="platform-home-search">Buscar empresa ou treinamento</label>
        <input
          id="platform-home-search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Digite um nome"
          type="search"
          value={search}
        />
      </div>

      <div className="platform-home-columns">
        <section aria-labelledby="home-companies-heading" className="list-section">
          <div className="section-heading">
            <h2 id="home-companies-heading">Empresas ({visibleCompanies.length})</h2>
            <Link className="button button-quiet" to="/platform/companies">Gerenciar empresas</Link>
          </div>
          {isLoading ? (
            <p className="list-state" aria-live="polite">Carregando...</p>
          ) : visibleCompanies.length === 0 ? (
            <p className="compact-empty">Nenhuma empresa encontrada.</p>
          ) : (
            <ul className="platform-home-list">
              {visibleCompanies.map((company) => (
                <li key={company.id}>
                  <span>
                    <strong>{company.name}</strong>
                    <small>{company.employeeCount.toLocaleString('pt-BR')} participantes ativos</small>
                  </span>
                  <span className={`status-pill${company.isActive ? ' status-active' : ''}`}>
                    {company.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                  <Link className="learning-open-link" to={`/platform/users?tenant=${company.id}`}>
                    Usuários <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="home-courses-heading" className="list-section">
          <div className="section-heading">
            <h2 id="home-courses-heading">Treinamentos ({visibleCourses.length})</h2>
            <Link className="button button-quiet" to="/platform/courses">Gerenciar cursos</Link>
          </div>
          {isLoading ? (
            <p className="list-state" aria-live="polite">Carregando...</p>
          ) : visibleCourses.length === 0 ? (
            <p className="compact-empty">Nenhum treinamento encontrado.</p>
          ) : (
            <ul className="platform-home-list">
              {visibleCourses.map((course) => (
                <li key={course.id}>
                  <span>
                    <strong>{course.title}</strong>
                    <small>{course.videos.length} vídeo(s){course.gamificationEnabled ? ' · gamificação' : ''}</small>
                  </span>
                  <span className={`status-badge status-${course.status === 'Published' ? 'published' : 'draft'}`}>
                    {statusLabels[course.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
