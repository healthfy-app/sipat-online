import { useEffect, useState, type FormEvent } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import {
  ApiError,
  configureCompanyAdministration,
  getCompanyCapabilities,
  type CompanyCapabilities,
  getCompanyAdministrationId,
  getSession,
  getTenantBranding,
  signIn,
  signOut,
  type IdentitySession,
  type TenantBranding,
} from './api';
import SipatsPage from './sipatBuilder/SipatsPage';
import CompanyContext from './companies/CompanyContext';
import CompanyHome from './companies/CompanyHome';
import LearningPage, { type LearningSummary } from './LearningPage';
import CollaboratorsPage from './collaborators/CollaboratorsPage';
import TenantLearningDashboardPage from './TenantLearningDashboardPage';
import { isCompanyPanelMode } from './companies/companyContextMode';
import PlatformCompaniesPage from './PlatformCompaniesPage';
import PlatformCompanyEmployeesPage from './PlatformCompanyEmployeesPage';
import PlatformUsersPage from './PlatformUsersPage';
import PlatformHomePage from './PlatformHomePage';
import PlatformCoursesPage from './PlatformCoursesPage';
import SipatBuilderPage from './sipatBuilder/SipatBuilderPage';
import CompanyNav from './companies/CompanyNav';
import PlatformSettingsPage from './PlatformSettingsPage';
import CertificatesPage from './CertificatesPage';
import TenantAppearancePage from './TenantAppearancePage';
import { BrandThemeContext, tenantTheme } from './branding';
import LoadingState from './LoadingState';

type AppState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tenant: TenantBranding; session: IdentitySession | null; platformPortal: boolean };

const adminRoles = ['SuperAdmin', 'ClientAdmin'];
const companyContextKey = 'sipat-company-administration';

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        configureCompanyAdministration(null);
        const portalTenant = await getTenantBranding();
        const platformPortal = portalTenant.tenantKey === 'platform';
        const session = await getSession(platformPortal);
        let tenant = portalTenant;
        if (platformPortal && session?.roles.includes('PlatformOperator') &&
            window.location.pathname.startsWith('/admin/')) {
          const companyId = new URLSearchParams(window.location.search).get('companyId')
            ?? sessionStorage.getItem(companyContextKey);
          if (companyId) {
            configureCompanyAdministration(companyId);
            tenant = await getTenantBranding();
            sessionStorage.setItem(companyContextKey, companyId);
          }
        }
        if (active) {
          setState({ status: 'ready', tenant, session, platformPortal });
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
    return <main className="app-loading"><LoadingState>Carregando o portal...</LoadingState></main>;
  }

  if (state.status === 'error') {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
        <div className="grid w-full max-w-md gap-3 rounded-xl bg-card p-8 shadow-card" role="alert">
          <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">SIPAT ONLINE</p>
          <h1 className="m-0 text-2xl font-semibold leading-tight tracking-tight">Este portal não está disponível</h1>
          <p className="m-0 text-muted-foreground">{state.message}</p>
          <p className="m-0 text-sm text-muted-foreground">
            Endereço acessado: <strong className="text-foreground">{window.location.host}</strong>. O endereço de cada empresa
            começa pelo identificador dela. Confira se ele está escrito exatamente como foi cadastrado.
          </p>
          <a className="mt-2 inline-flex min-h-9 w-fit items-center rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground no-underline hover:bg-accent" href="/platform" onClick={clearCompanyAdministration}>
            Voltar ao início
          </a>
        </div>
      </main>
    );
  }

  const isPlatformPortal = state.platformPortal;
  const theme = tenantTheme(state.tenant.primaryColor, state.tenant.secondaryColor);

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
    clearCompanyAdministration();
    const tenant = await getTenantBranding();
    setState((current) =>
      current.status === 'ready' ? { ...current, tenant, session: null } : current,
    );
  }

  return (
    <BrandThemeContext.Provider value={theme}>
    <main className="app-root" style={theme}>
      <a className="skip-link" href="#app-content">Ir para o conteúdo</a>
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
              path="/admin/dashboard"
              element={
                state.session && canViewCompany(state.session) ? (
                  <TenantLearningDashboardPage readOnly={!hasAdminRole(state.session)} />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/admin/sipats"
              element={state.session && hasAdminRole(state.session) ? <SipatsPage basePath="/admin/sipats" /> : <AccessDenied />}
            />
            <Route
              path="/admin/sipats/:sipatId"
              element={state.session && hasAdminRole(state.session) ? <SipatBuilderPage basePath="/admin/sipats" canEditThemes={false} /> : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/sipats"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                ? <CompanyContext>{companyId => <SipatsPage basePath={`/platform/companies/${companyId}/sipats`} />}</CompanyContext>
                : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/sipats/:sipatId"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                ? <CompanyContext>{companyId => <SipatBuilderPage basePath={`/platform/companies/${companyId}/sipats`} canEditThemes />}</CompanyContext>
                : <AccessDenied />}
            />
            <Route
              path="/admin/learning"
              element={
                state.session && canViewCompany(state.session) ? (
                  <CollaboratorsPage readOnly={!hasAdminRole(state.session)} />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/admin/appearance"
              element={state.session && hasAdminRole(state.session) ? (
                <TenantAppearancePage tenant={state.tenant} onSaved={tenant => setState(current =>
                  current.status === 'ready' ? { ...current, tenant } : current)} />
              ) : <AccessDenied />}
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
            <Route path="/learning/certificates" element={state.session?.roles.includes('Participant') ? <CertificatesPage /> : <AccessDenied />} />
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
                  // the operator's overview left the menu: the companies list already says what it said
                  <Navigate replace to="/platform" />
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
              path="/platform/companies/:companyId"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator') ? <CompanyHome /> : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/:section"
              element={
                state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                  ? <PlatformCompanyEmployeesPage />
                  : <AccessDenied />
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
              path="/platform/courses/:courseId/edit"
              element={
                state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                  ? <PlatformCoursesPage />
                  : <AccessDenied />
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
    </BrandThemeContext.Provider>
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
  const [showPassword, setShowPassword] = useState(false);
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
    <section
      aria-label={tenant.tenantKey === 'platform' ? 'Acesso à plataforma' : 'Acesso ao portal da empresa'}
      className="login-layout"
    >
      <div
        className={`login-brand-panel${tenant.bannerReference ? ' has-banner' : ''}`}
        style={tenant.bannerReference ? ({ '--login-banner': `url("${tenant.bannerReference}")` } as React.CSSProperties) : undefined}
      >
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
                Acesse os vídeos e demais conteúdos que sua empresa preparou para
                a semana da SIPAT.
              </p>
            </>
          )}
        </div>
        <div aria-hidden="true" className="login-brand-art">
          <span className="login-brand-orbit login-brand-orbit-large" />
          <span className="login-brand-orbit login-brand-orbit-small" />
          <div className="login-brand-card">
            <span className="login-brand-symbol">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 19 6v5c0 4.7-2.9 8.3-7 10-4.1-1.7-7-5.3-7-10V6l7-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span className="login-brand-card-copy">
              <span>{tenant.tenantKey === 'platform' ? 'OPERAÇÃO DA PLATAFORMA' : 'FORMAÇÃO DA EQUIPE'}</span>
              <strong>
                {tenant.tenantKey === 'platform'
                  ? 'Empresas, cursos e usuários em um só lugar.'
                  : 'Pequenos passos. Rotinas mais seguras.'}
              </strong>
            </span>
            <span className="login-brand-card-check">✓</span>
          </div>
        </div>
        <span className="login-caption">
          {tenant.tenantKey === 'platform' ? 'Acesso exclusivo para operadores' : 'Ambiente de aprendizagem da empresa'}
        </span>
      </div>
      <div className="login-form-panel" id="app-content" tabIndex={-1}>
        <form aria-labelledby="login-form-title" className="login-card" onSubmit={handleSubmit}>
          <div className="login-form-heading">
            <span aria-hidden="true" className="login-form-symbol">
              <svg viewBox="0 0 24 24">
                <rect height="10" rx="2" width="14" x="5" y="11" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                <path d="M12 15v2" />
              </svg>
            </span>
            <div>
              <p className="eyebrow">ACESSO SEGURO</p>
              <h2 id="login-form-title">
                {tenant.tenantKey === 'platform' ? 'Acesse a plataforma' : 'Entre na sua área de aprendizagem'}
              </h2>
            </div>
          </div>
          <p className="muted-copy">
            {tenant.tenantKey === 'platform'
              ? 'Entre com suas credenciais de operação.'
              : 'Use o login e a senha fornecidas pela sua empresa.'}
          </p>
          <label htmlFor="login-identifier">Login</label>
          <input
            autoComplete="username"
            id="login-identifier"
            name="loginIdentifier"
            onChange={(event) => setLoginIdentifier(event.target.value)}
            required
            value={loginIdentifier}
          />
          <label htmlFor="login-password">Senha</label>
          <div className="login-password-field">
            <input
              autoComplete="current-password"
              id="login-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
            />
            <button
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              className="password-toggle"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" aria-busy={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : <>Entrar no portal <span aria-hidden="true">→</span></>}
          </button>
          <p className="login-help">
            {tenant.tenantKey === 'platform'
              ? 'Acesso exclusivo para a equipe de operação.'
              : 'Precisa de ajuda? Fale com o administrador da sua empresa.'}
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
  const location = useLocation();
  const [error, setError] = useState('');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [learningSummary, setLearningSummary] = useState<LearningSummary | null>(null);
  // what the company can do (its plan is never shown): the menu offers only what is available
  const [capabilities, setCapabilities] = useState<CompanyCapabilities | null>(null);
  useEffect(() => {
    if (!session || !(hasAdminRole(session) || (session.roles.includes('PlatformOperator') && getCompanyAdministrationId() !== null))) return;
    let current = true;
    getCompanyCapabilities().then(result => { if (current) setCapabilities(result); }).catch(() => undefined);
    return () => { current = false; };
  }, [session]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const isLearnerOnly =
    session.roles.includes('Participant') &&
    !hasAdminRole(session) &&
    !session.roles.includes('PlatformOperator');
  const isPlatformOperator = session.roles.includes('PlatformOperator');
  const companyWorkspaceId = /^\/platform\/companies\/([^/]+)/.exec(location.pathname)?.[1] ?? null;
  // inside the company workspace the operator keeps the workspace menu, even though the company is set for the calls to its admin routes
  const isPlatformCompanyContext = isCompanyPanelMode(isPlatformOperator, location.pathname, getCompanyAdministrationId());

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

  function handleReturnToPlatform() {
    configureCompanyAdministration(null);
    window.sessionStorage.removeItem(companyContextKey);
  }

  return (
    <div className={`portal-layout${isLearnerOnly ? ' portal-layout-learner' : ''}${isPlatformOperator ? ' portal-layout-platform' : ''}${isPlatformCompanyContext ? ' portal-layout-company-context' : ''}${/^\/platform\/courses\/[^/]+\/edit$/.test(location.pathname) ? ' portal-layout-course-editor' : ''}`}>
      {!isLearnerOnly && isPlatformCompanyContext && (
        <aside aria-label="Modo de administração da empresa" className="company-context-banner" role="status">
          <span>
            <strong>Modo operador · Administrando {tenant.tenantName}</strong>
            <span> · Você está agindo em nome desta empresa.</span>
          </span>
          <a className="button button-secondary company-context-return" href="/platform" onClick={handleReturnToPlatform}>
            Voltar à plataforma
          </a>
        </aside>
      )}
      <div className={`portal-body${isLearnerOnly ? ' portal-body-learner' : ''}`}>
        {isLearnerOnly && (
          <aside aria-label="Área do aluno" className="learner-sidebar">
            <Link aria-label={`${tenant.tenantName} - início`} className="brand-link" to="/learning">
              <TenantIdentity tenant={tenant} compact />
            </Link>
            <nav aria-label="Seções da área do aluno" className="learner-sidebar-nav">
              <Link aria-current={location.pathname === '/learning' || location.pathname.startsWith('/learning/tracks/') ? 'page' : undefined}
                className={`learner-sidebar-link${location.pathname === '/learning' || location.pathname.startsWith('/learning/tracks/') ? ' active' : ''}`}
                aria-label="Minha formação"
                to="/learning">
                <span className="learner-nav-desktop-label">Minha formação</span>
                <span aria-hidden="true" className="learner-nav-mobile-label">Formação</span>
              </Link>
              <NavLink
                aria-label="Meus certificados"
                className={({ isActive }) => `learner-sidebar-link${isActive ? ' active' : ''}`}
                to="/learning/certificates">
                <span className="learner-nav-desktop-label">Meus certificados</span>
                <span aria-hidden="true" className="learner-nav-mobile-label">Certificados</span>
              </NavLink>
            </nav>
            {location.pathname === '/learning' && (
              <button
                aria-label="Buscar cursos"
                className="learner-mobile-search"
                onClick={() => document.getElementById('learning-course-search')?.focus()}
                type="button"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="10.8" cy="10.8" r="6.8" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
              </button>
            )}
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
                  {learningSummary.percentage === 100 && (
                    <text
                      className="learner-sidebar-progress-complete-mark"
                      dominantBaseline="central"
                      textAnchor="middle"
                      x="28"
                      y="28"
                    >
                      ✓
                    </text>
                  )}
                </svg>
                <div>
                  <strong>{learningSummary.percentage}% concluído</strong>
                  <span>{learningSummary.completed} de {learningSummary.total} dias</span>
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
          <Link
            aria-label={`${tenant.tenantName} - início`}
            className="brand-link sidebar-brand"
            to={getLandingPage(session)}
          >
            <TenantIdentity tenant={tenant} compact />
          </Link>
          {session.roles.includes('Participant') && !isPlatformCompanyContext && (
            <>
              <p className="sidebar-label">APRENDIZAGEM</p>
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/learning">
                Minhas trilhas
              </NavLink>
            </>
          )}
          {canViewCompany(session) && (!isPlatformOperator || isPlatformCompanyContext) && (
            <>
              <p className="sidebar-label">GESTÃO DA EMPRESA</p>
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/dashboard">Visão geral</NavLink>
              {hasAdminRole(session) && <>
                <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/sipats">SIPATs</NavLink>
                {capabilities?.customBranding !== false && <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/appearance">Identidade visual</NavLink>}
              </>}
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/learning">
                {hasAdminRole(session) ? 'Colaboradores' : 'Acompanhamento'}
              </NavLink>
            </>
          )}
          {isPlatformOperator && !isPlatformCompanyContext && companyWorkspaceId && <CompanyNav companyId={companyWorkspaceId} />}
          {isPlatformOperator && !isPlatformCompanyContext && !companyWorkspaceId && (
            <>
              <p className="sidebar-label sidebar-label-spaced">SIPAT.ONLINE.ADMIN</p>
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform" end>Empresas</NavLink>
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/courses">Biblioteca</NavLink>
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/settings">Configurações</NavLink>
            </>
          )}
          <div className="sidebar-account">
            <span className="user-name">{session.displayName}</span>
            <button
              className="sidebar-signout"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? 'Saindo...' : 'Sair'}
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="tenant-indicator" />
            <span>{tenant.tenantKey === 'platform' ? 'Operação SIPAT Online' : 'Portal da empresa'}</span>
          </div>
        </aside>}
        <section
          className={`portal-content${isLearnerOnly ? ' portal-content-learner' : ''}`}
          id="app-content"
          tabIndex={-1}
        >
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
        <img alt="SIPAT Online" className="sipat-default-logo" height={48} src="/favicon.svg" width={48} />
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
  return session.roles.some((role) => adminRoles.includes(role)) ||
    (session.roles.includes('PlatformOperator') && getCompanyAdministrationId() !== null);
}

function canViewCompany(session: IdentitySession): boolean {
  return hasAdminRole(session) || session.roles.includes('Supervisor');
}

function clearCompanyAdministration(): void {
  configureCompanyAdministration(null);
  sessionStorage.removeItem(companyContextKey);
}

function getLandingPage(session: IdentitySession): string {
  if (session.roles.includes('PlatformOperator')) {
    return '/platform';
  }

  if (canViewCompany(session)) {
    return '/admin/dashboard';
  }

  return session.roles.includes('Participant') ? '/learning' : '/admin/dashboard';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
