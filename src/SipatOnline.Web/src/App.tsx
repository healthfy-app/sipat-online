import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import {
  ApiError,
  getSession,
  getTenantBranding,
  signIn,
  signOut,
  type IdentitySession,
  type TenantBranding,
} from './api';
import SipatEventsPage from './SipatEventsPage';
import LearningPage, { type LearningSummary } from './LearningPage';
import LearningAuthoringPage from './LearningAuthoringPage';
import LearningManagementPage from './LearningManagementPage';
import PlatformCompaniesPage from './PlatformCompaniesPage';
import PlatformUsersPage from './PlatformUsersPage';
import PlatformDashboardPage from './PlatformDashboardPage';
import PlatformHomePage from './PlatformHomePage';
import PlatformCoursesPage from './PlatformCoursesPage';
import PlatformSettingsPage from './PlatformSettingsPage';

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tenant: TenantBranding; session: IdentitySession | null };

const adminRoles = ['SuperAdmin', 'ClientAdmin'];

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const tenant = await getTenantBranding();
        const session = await getSession(tenant.tenantKey === 'platform');
        if (active) {
          setState({ status: 'ready', tenant, session });
        }
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof ApiError && error.status === 404
                ? 'Não encontramos uma empresa ativa para este endereço.'
                : getErrorMessage(error),
          });
        }
      }
    }

    void initialize();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') {
    return <main className="app-loading" aria-live="polite">Carregando o portal...</main>;
  }

  if (state.status === 'error') {
    return (
      <main className="standalone-message">
        <div className="message-card" role="alert">
          <p className="eyebrow">SIPAT ONLINE</p>
          <h1>Este portal não está disponível</h1>
          <p>{state.message}</p>
        </div>
      </main>
    );
  }

  const isPlatformPortal = state.tenant.tenantKey === 'platform';
  const theme = {
    '--brand-primary': state.tenant.primaryColor,
    '--brand-secondary': state.tenant.secondaryColor,
  } as CSSProperties;

  async function handleSignIn(
    loginIdentifier: string,
    password: string,
  ): Promise<IdentitySession> {
    await signIn(loginIdentifier, password, isPlatformPortal);
    const session = await getSession(isPlatformPortal);
    if (!session) {
      throw new Error('A sessão não foi iniciada. Confira suas credenciais.');
    }

    setState((current) =>
      current.status === 'ready' ? { ...current, session } : current,
    );
    return session;
  }

  async function handleSignOut() {
    await signOut(isPlatformPortal);
    setState((current) =>
      current.status === 'ready' ? { ...current, session: null } : current,
    );
  }

  return (
    <main className="app-root" style={theme}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Navigate
                to={state.session ? getLandingPage(state.session) : '/login'}
                replace
              />
            }
          />
          <Route
            path="/login"
            element={
              state.session ? (
                <Navigate to={getLandingPage(state.session)} replace />
              ) : (
                <LoginPage tenant={state.tenant} onSignIn={handleSignIn} />
              )
            }
          />
          <Route
            element={
              <ProtectedPortal
                tenant={state.tenant}
                session={state.session}
                onSignOut={handleSignOut}
              />
            }
          >
            <Route
              path="/admin/sipats"
              element={
                state.session && hasAdminRole(state.session) ? (
                  <SipatEventsPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/admin/learning"
              element={
                state.session && hasAdminRole(state.session) ? (
                  <LearningManagementPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/admin/content"
              element={
                state.session && hasAdminRole(state.session) ? (
                  <LearningAuthoringPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/learning"
              element={
                state.session?.roles.includes('Participant') ? (
                  <LearningPage
                    participantName={state.session.displayName}
                    tenantName={state.tenant.tenantName}
                  />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/learning/tracks/:trackId"
              element={
                state.session?.roles.includes('Participant') ? (
                  <LearningPage
                    participantName={state.session.displayName}
                    tenantName={state.tenant.tenantName}
                  />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform"
              element={
                state.tenant.tenantKey === 'platform' &&
                state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformHomePage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform/dashboard"
              element={
                state.tenant.tenantKey === 'platform' &&
                state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformDashboardPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform/companies"
              element={
                state.tenant.tenantKey === 'platform' &&
                state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformCompaniesPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform/users"
              element={
                state.tenant.tenantKey === 'platform' &&
                state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformUsersPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform/courses"
              element={
                state.tenant.tenantKey === 'platform' &&
                state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformCoursesPage />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/platform/settings"
              element={
                state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator') ? (
                  <PlatformSettingsPage tenant={state.tenant} session={state.session} />
                ) : (
                  <AccessDenied />
                )
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </main>
  );
}

function LoginPage({
  tenant,
  onSignIn,
}: {
  tenant: TenantBranding;
  onSignIn: (loginIdentifier: string, password: string) => Promise<IdentitySession>;
}) {
  const navigate = useNavigate();
  const [loginIdentifier, setLoginIdentifier] = useState(
    tenant.tenantKey === 'platform' ? 'sipat.online.admin' : '',
  );
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const session = await onSignIn(loginIdentifier.trim(), password);
      navigate(getLandingPage(session), { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="login-layout">
      <div className="login-brand-panel">
        <TenantIdentity tenant={tenant} compact={false} />
        <div className="login-intro">
          {tenant.tenantKey === 'platform' ? (
            <>
              <p className="eyebrow">SIPAT.ONLINE.ADMIN</p>
              <h1>Gestão segura dos clientes.</h1>
              <p>Acesse a área de operação do SIPAT Online.</p>
            </>
          ) : (
            <>
              <p className="eyebrow">CONTEÚDOS PARA A SEMANA DA SIPAT</p>
              <h1>Aprender também faz parte de cuidar.</h1>
              <p>
                Acesse os cursos e demais conteúdos que sua empresa preparou para
                a semana da SIPAT.
              </p>
            </>
          )}
        </div>
        <span className="login-caption">
          {tenant.tenantKey === 'platform' ? 'Acesso exclusivo para operadores' : 'Ambiente de aprendizagem da empresa'}
        </span>
      </div>
      <div className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <p className="eyebrow">BEM-VINDO(A)</p>
          <h2>{tenant.tenantKey === 'platform' ? 'Acesse a plataforma' : 'Entre na sua área de aprendizagem'}</h2>
          <p className="muted-copy">
            {tenant.tenantKey === 'platform'
              ? 'Entre com suas credenciais de operação.'
              : 'Entre com a matrícula e a senha fornecidas pela sua empresa.'}
          </p>
          <label htmlFor="login-identifier">Matrícula</label>
          <input
            autoComplete="username"
            id="login-identifier"
            name="loginIdentifier"
            onChange={(event) => setLoginIdentifier(event.target.value)}
            required
            value={loginIdentifier}
          />
          <label htmlFor="login-password">Senha</label>
          <input
            autoComplete="current-password"
            id="login-password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar no portal'}
          </button>
          <p className="login-help">
            Precisa de ajuda? Fale com o administrador da sua empresa.
          </p>
        </form>
      </div>
    </section>
  );
}

function ProtectedPortal({
  tenant,
  session,
  onSignOut,
}: {
  tenant: TenantBranding;
  session: IdentitySession | null;
  onSignOut: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [learningSummary, setLearningSummary] = useState<LearningSummary | null>(null);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const isLearnerOnly =
    session.roles.includes('Participant') &&
    !hasAdminRole(session) &&
    !session.roles.includes('PlatformOperator');

  async function handleSignOut() {
    setError('');
    setIsSigningOut(true);
    try {
      await onSignOut();
      navigate('/login', { replace: true });
    } catch (signOutError) {
      setError(getErrorMessage(signOutError));
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className={`portal-layout${isLearnerOnly ? ' portal-layout-learner' : ''}`}>
      {!isLearnerOnly && <header className="portal-header">
        <Link
          aria-label={`${tenant.tenantName} - início`}
          className="brand-link"
          to={getLandingPage(session)}
        >
          <TenantIdentity tenant={tenant} compact />
        </Link>
        <div className="header-actions">
          <span className="user-name">{session.displayName}</span>
          <button
            className="button button-quiet"
            disabled={isSigningOut}
            onClick={handleSignOut}
            type="button"
          >
            {isSigningOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </header>}
      <div className={`portal-body${isLearnerOnly ? ' portal-body-learner' : ''}`}>
        {isLearnerOnly && (
          <aside aria-label="Área do aluno" className="learner-sidebar">
            <Link aria-label={`${tenant.tenantName} - início`} className="brand-link" to="/learning">
              <TenantIdentity tenant={tenant} compact />
            </Link>
            <nav aria-label="Seções da área do aluno" className="learner-sidebar-nav">
              <NavLink className="learner-sidebar-link" to="/learning">Minha formação</NavLink>
              <span className="learner-sidebar-unavailable">Meu certificado <small>Em breve</small></span>
              <span className="learner-sidebar-unavailable">Fórum <small>Em breve</small></span>
            </nav>
            {learningSummary && (
              <div className="learner-sidebar-progress">
                <svg aria-hidden="true" viewBox="0 0 56 56">
                  <circle className="ring-background" cx="28" cy="28" r="22" />
                  <circle
                    className="ring-value"
                    cx="28" cy="28" r="22"
                    strokeDasharray={2 * Math.PI * 22}
                    strokeDashoffset={2 * Math.PI * 22 * (1 - learningSummary.percentage / 100)}
                  />
                </svg>
                <div>
                  <strong>{learningSummary.percentage}% concluído</strong>
                  <span>{learningSummary.completed} de {learningSummary.total} aulas</span>
                </div>
              </div>
            )}
            <button
              className="button button-outline learner-sign-out"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? 'Saindo...' : 'Sair'}
            </button>
          </aside>
        )}
        {!isLearnerOnly && <aside aria-label="Navegação principal" className="sidebar">
          {session.roles.includes('Participant') && (
            <>
              <p className="sidebar-label">APRENDIZAGEM</p>
              <NavLink className="sidebar-link" to="/learning">Minhas trilhas</NavLink>
            </>
          )}
          {hasAdminRole(session) && (
            <>
              <p className="sidebar-label">GESTÃO</p>
              <NavLink className="sidebar-link" to="/admin/sipats">Programação da SIPAT</NavLink>
              <NavLink className="sidebar-link" to="/admin/content">Trilhas e vídeos</NavLink>
              <NavLink className="sidebar-link" to="/admin/learning">Participantes e trilhas</NavLink>
            </>
          )}
          {session.roles.includes('PlatformOperator') && (
            <>
              <p className="sidebar-label sidebar-label-spaced">SIPAT.ONLINE.ADMIN</p>
              <NavLink className="sidebar-link" to="/platform" end>Operação</NavLink>
              <NavLink className="sidebar-link" to="/platform/dashboard">Painel</NavLink>
              <NavLink className="sidebar-link" to="/platform/companies">Empresas clientes</NavLink>
              <NavLink className="sidebar-link" to="/platform/users">Usuários</NavLink>
              <NavLink className="sidebar-link" to="/platform/courses">Cursos</NavLink>
              <NavLink className="sidebar-link" to="/platform/settings">Configurações</NavLink>
            </>
          )}
          <div className="sidebar-footer">
            <span className="tenant-indicator" />
            <span>{tenant.tenantKey === 'platform' ? 'Operação SIPAT Online' : 'Portal da empresa'}</span>
          </div>
        </aside>}
        <section className={`portal-content${isLearnerOnly ? ' portal-content-learner' : ''}`}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Outlet context={isLearnerOnly ? setLearningSummary : undefined} />
        </section>
      </div>
    </div>
  );
}

function TenantIdentity({
  tenant,
  compact,
}: {
  tenant: TenantBranding;
  compact: boolean;
}) {
  return (
    <div className={`tenant-identity${compact ? ' tenant-identity-compact' : ''}`}>
      {tenant.logoReference ? (
        <img alt="" className="tenant-logo" src={tenant.logoReference} />
      ) : (
        <span aria-hidden="true" className="tenant-mark">✓</span>
      )}
      <span className="tenant-name">{tenant.tenantName}</span>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="notice-card" role="alert">
      <span className="notice-icon" aria-hidden="true">!</span>
      <div>
        <h2>Acesso não autorizado</h2>
        <p>Seu perfil não tem permissão para acessar esta área.</p>
      </div>
    </div>
  );
}

function hasAdminRole(session: IdentitySession): boolean {
  return session.roles.some((role) => adminRoles.includes(role));
}

function getLandingPage(session: IdentitySession): string {
  if (session.roles.includes('PlatformOperator')) {
    return '/platform';
  }

  if (hasAdminRole(session)) {
    return '/admin/sipats';
  }

  return session.roles.includes('Participant') ? '/learning' : '/admin/sipats';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
