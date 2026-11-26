import { Menu } from 'lucide-react';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
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
  useNavigationType,
} from 'react-router-dom';
import {
  ApiError,
  configureCompanyAdministration,
  getCompanyCapabilities,
  setUploadScope,
  type CompanyCapabilities,
  getCompanyAdministrationId,
  getSession,
  getTenantBranding,
  signIn,
  signOut,
  type IdentitySession,
  type TenantBranding,
} from './api';
import { Button } from './components/ui/button';
import { Sheet } from './components/ui/sheet';
import { LegacySipatRedirect } from './trainings/LegacySipatRedirect';
import CompanyContext from './companies/CompanyContext';
import { UnitMenu, UnitScopeProvider } from './trainings/unitScope';
import LearningPage, { type LearningSummary } from './LearningPage';
import { isCompanyPanelMode } from './companies/companyContextMode';
import { linkedTraining } from './trainings/trainingLink';

import CompanyNav from './companies/CompanyNav';
import PlanMedal from './companies/PlanMedal';
import { BrandThemeContext, tenantTheme } from './branding';
import { imageEdgeColor } from './imageEdgeColor';
import LoadingState from './LoadingState';
import { useNewVersionReload } from './versionWatch';
import VideoUploadTray from './videoUploads/VideoUploadTray';

/**
 * A page that loads on demand is a file of the version the browser opened. After a new version goes up that file is
 * gone: the page is loaded again, once, to pick the new version up, instead of failing where it stands.
 */
function reloadForNewVersion(error: unknown): never | Promise<never> {
  const key = 'sipat:reloaded-for-version';
  let already = true;
  try { already = sessionStorage.getItem(key) === '1'; if (!already) sessionStorage.setItem(key, '1'); } catch { /* no storage: do not risk a loop */ }
  if (already) throw error;
  window.location.reload();
  return new Promise<never>(() => undefined);
}
// The pages of the company's administration and of the operation load when they are opened: a participant, who only
// ever sees the learning pages, does not download them.
const SipatsPage = lazy(() => import('./sipatBuilder/SipatsPage').catch(reloadForNewVersion));
const CompanyHome = lazy(() => import('./companies/CompanyHome').catch(reloadForNewVersion));
const CollaboratorsPage = lazy(() => import('./collaborators/CollaboratorsPage').catch(reloadForNewVersion));
const RegistryPage = lazy(() => import('./registry/RegistryPage').catch(reloadForNewVersion));
const TenantLearningDashboardPage = lazy(() => import('./TenantLearningDashboardPage').catch(reloadForNewVersion));
const PlatformCompaniesPage = lazy(() => import('./PlatformCompaniesPage').catch(reloadForNewVersion));
const PlatformCompanyEmployeesPage = lazy(() => import('./PlatformCompanyEmployeesPage').catch(reloadForNewVersion));
const PlatformUsersPage = lazy(() => import('./PlatformUsersPage').catch(reloadForNewVersion));
const PlatformHomePage = lazy(() => import('./PlatformHomePage').catch(reloadForNewVersion));
const PlatformCoursesPage = lazy(() => import('./PlatformCoursesPage').catch(reloadForNewVersion));
const SipatBuilderPage = lazy(() => import('./sipatBuilder/SipatBuilderPage').catch(reloadForNewVersion));
const TrainingEditorPage = lazy(() => import('./trainings/TrainingEditorPage').catch(reloadForNewVersion));
const PlaybackQualityPage = lazy(() => import('./quality/PlaybackQualityPage').catch(reloadForNewVersion));
const PlaybackQualityComparisonPage = lazy(() => import('./quality/PlaybackQualityComparisonPage').catch(reloadForNewVersion));
const PlatformSettingsPage = lazy(() => import('./PlatformSettingsPage').catch(reloadForNewVersion));
const CertificatesPage = lazy(() => import('./CertificatesPage').catch(reloadForNewVersion));
const TenantAppearancePage = lazy(() => import('./TenantAppearancePage').catch(reloadForNewVersion));
const VideoLibraryPage = lazy(() => import('./videoLibrary/VideoLibraryPage').catch(reloadForNewVersion));

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

  // the operation's portal painted as a company (the operator was inside one) and nobody signed in any more (the
  // session ended): the login is the operation's own, so the company is left and the operation's look comes back
  const strandedInCompany = state.status === 'ready' && state.platformPortal && !state.session && state.tenant.tenantKey !== 'platform';
  useEffect(() => {
    if (!strandedInCompany) return;
    let active = true;
    clearCompanyAdministration();
    getTenantBranding().then(tenant => {
      if (active) setState(current => (current.status === 'ready' ? { ...current, tenant } : current));
    }, () => undefined);
    return () => { active = false; };
  }, [strandedInCompany]);

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
        <ScrollToTopOnNavigate />
        <LeaveCompanyPanel active={isPlatformPortal && state.tenant.tenantKey !== 'platform'} />
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
                  <TenantLearningDashboardPage
                    brandColor={state.tenant.primaryColor}
                    companyName={state.tenant.tenantName}
                    readOnly={!hasAdminRole(state.session)}
                  />
                ) : (
                  <AccessDenied />
                )
              }
            />
            <Route
              path="/admin/treinamentos"
              element={state.session && hasAdminRole(state.session) ? <SipatsPage basePath="/admin/treinamentos" /> : <AccessDenied />}
            />
            <Route
              path="/admin/treinamentos/:sipatId"
              element={state.session && hasAdminRole(state.session) ? <SipatBuilderPage basePath="/admin/treinamentos" canEditThemes={false} /> : <AccessDenied />}
            />
            <Route
              path="/admin/videos"
              element={state.session && hasAdminRole(state.session) ? <VideoLibraryPage company /> : <AccessDenied />}
            />
            <Route
              path="/admin/treinamentos/:sipatId/editar"
              element={state.session && hasAdminRole(state.session) ? <TrainingEditorPage basePath="/admin/treinamentos" /> : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/treinamentos"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                ? <CompanyContext>{companyId => <SipatsPage basePath={`/platform/companies/${companyId}/treinamentos`} operator />}</CompanyContext>
                : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/treinamentos/:sipatId"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                ? <CompanyContext>{companyId => <SipatBuilderPage basePath={`/platform/companies/${companyId}/treinamentos`} canEditThemes />}</CompanyContext>
                : <AccessDenied />}
            />
            {/* old /sipats links (bookmarks, shared links) keep working */}
            <Route element={<LegacySipatRedirect to={() => '/admin/treinamentos'} />} path="/admin/sipats" />
            <Route element={<LegacySipatRedirect to={({ sipatId }) => `/admin/treinamentos/${sipatId}`} />} path="/admin/sipats/:sipatId" />
            <Route element={<LegacySipatRedirect to={({ companyId }) => `/platform/companies/${companyId}/treinamentos`} />} path="/platform/companies/:companyId/sipats" />
            <Route element={<LegacySipatRedirect to={({ companyId, sipatId }) => `/platform/companies/${companyId}/treinamentos/${sipatId}`} />} path="/platform/companies/:companyId/sipats/:sipatId" />
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
              path="/admin/cadastro"
              element={state.session && hasAdminRole(state.session) ? <RegistryPage /> : <AccessDenied />}
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
                    participantId={state.session.id}
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
                    participantId={state.session.id}
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
              path="/platform/qualidade"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator') ? <PlaybackQualityComparisonPage /> : <AccessDenied />}
            />
            <Route
              path="/platform/companies/:companyId/qualidade"
              element={state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator') ? <PlaybackQualityPage /> : <AccessDenied />}
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
              path="/platform/videos"
              element={
                state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                  ? <VideoLibraryPage />
                  : <AccessDenied />
              }
            />
            {/* a template of the operation on the same board of days a company's training uses */}
            <Route
              path="/platform/courses/:courseId"
              element={
                state.tenant.tenantKey === 'platform' && state.session?.roles.includes('PlatformOperator')
                  ? <SipatBuilderPage basePath="/platform/courses" canEditThemes template />
                  : <AccessDenied />
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
        <VideoUploadTray />
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

  // the company's cover is a finished 1:1 piece: it shows whole, with nothing over it, and the identity moves to the form
  const art = tenant.tenantKey === 'platform' ? null : tenant.bannerReference || null;
  // a piece that is not square leaves room around it: that room takes the colour of the piece's own edge
  const [artEdge, setArtEdge] = useState<string | null>(null);

  return (
    <section
      aria-label={tenant.tenantKey === 'platform' ? 'Acesso à plataforma' : 'Acesso ao portal da empresa'}
      className={`login-layout${art ? ' has-art' : ''}`}
    >
      {art ? (
        <div className="login-brand-panel login-art-panel" style={artEdge ? { background: artEdge } : undefined}>
          <img
            alt={`Capa de ${tenant.tenantName}`}
            className="login-art"
            onLoad={(event) => setArtEdge(imageEdgeColor(event.currentTarget))}
            src={art}
          />
        </div>
      ) : (
      <div
        className={`login-brand-panel${tenant.tenantKey === 'platform' ? ' has-banner' : ''}`}
        style={
          tenant.tenantKey === 'platform'
            ? ({ '--login-banner': 'url("/platform-login-banner.jpg")' } as React.CSSProperties)
            : undefined
        }
      >
        <TenantIdentity tenant={tenant} compact={false} />
        <div className="login-intro">
          {tenant.tenantKey === 'platform' ? (
            <>
              <p className="eyebrow">OPERAÇÃO DA PLATAFORMA</p>
              <h1>Gestão segura dos clientes.</h1>
              <p>Acesse a área de operação do SIPAT Online.</p>
            </>
          ) : (
            <>
              <p className="eyebrow">CONTEÚDOS DO SEU TREINAMENTO</p>
              <h1>Aprender também faz parte de cuidar.</h1>
              <p>
                Acesse os vídeos e demais conteúdos que sua empresa preparou para
                o treinamento.
              </p>
            </>
          )}
        </div>
        <span className="login-caption">
          {tenant.tenantKey === 'platform' ? 'Acesso exclusivo para operadores' : 'Ambiente de aprendizagem da empresa'}
        </span>
      </div>
      )}
      <div className="login-form-panel" id="app-content" tabIndex={-1}>
        {art && (
          <h1 className="login-form-brand">
            <TenantIdentity tenant={tenant} compact={false} />
          </h1>
        )}
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
            placeholder="Digite seu login"
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
  // what the company can do and its plan: the menu offers only what is available, the medal by the logo shows the plan
  const [capabilities, setCapabilities] = useState<CompanyCapabilities | null>(null);
  useEffect(() => {
    if (!session || !(hasAdminRole(session) || (session.roles.includes('PlatformOperator') && getCompanyAdministrationId() !== null))) return;
    let current = true;
    getCompanyCapabilities().then(result => { if (current) setCapabilities(result); }).catch(() => undefined);
    return () => { current = false; };
  }, [session]);
  // videos go to the operation's library or to the company's own, by who is signed in; the upload queue follows it
  // (the operation, while inside a company, sends for that company)
  setUploadScope(session && (!session.roles.includes('PlatformOperator') || getCompanyAdministrationId() !== null) ? 'company' : 'platform');
  // the phone menu (sheet) closes whenever the page changes, including after tapping one of its links
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useEffect(() => { setIsMenuOpen(false); }, [location.pathname]);
  // a tab left open picks a new version up on the next change of page, instead of showing screens that were replaced
  useNewVersionReload(location.pathname);

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
  // the pages of one company (its administrator's, or the operation's while it looks at a company): they follow the unit chosen at the top
  const companyPages = isPlatformOperator
    ? isPlatformCompanyContext ? location.pathname.startsWith('/admin') : companyWorkspaceId !== null
    : canViewCompany(session) && location.pathname.startsWith('/admin');
  const unitScopeCompany = isPlatformOperator ? (isPlatformCompanyContext ? getCompanyAdministrationId() : companyWorkspaceId) : null;

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

  // the same links serve the desktop sidebar and the phone menu
  const sidebarNav = (
    <>
      {/* the unit the company is looked at through: it sits above the menu it filters, in the side bar and in the phone's menu */}
      {companyPages && <UnitMenu manageHref={hasAdminRole(session) && location.pathname.startsWith('/admin') ? '/admin/cadastro' : undefined} />}
      {session.roles.includes('Participant') && !isPlatformCompanyContext && (
        <>
          <p className="sidebar-label">APRENDIZAGEM</p>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/learning">
            Meus treinamentos
          </NavLink>
        </>
      )}
      {canViewCompany(session) && (!isPlatformOperator || isPlatformCompanyContext) && (
        <>
          <p className="sidebar-label">GESTÃO DA EMPRESA</p>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/dashboard">Visão geral</NavLink>
          {hasAdminRole(session) && <>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/treinamentos">Conteúdos</NavLink>
            {capabilities?.internalVideos && <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/admin/videos">Vídeos da empresa</NavLink>}
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
          <p className="sidebar-label sidebar-label-spaced">OPERAÇÃO</p>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform" end>Empresas</NavLink>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/courses">Conteúdos</NavLink>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/videos">Biblioteca de vídeos</NavLink>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/qualidade">Monitor de Desempenho</NavLink>
          <NavLink className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`} to="/platform/settings">Configurações</NavLink>
        </>
      )}
    </>
  );

  return (
    <UnitScopeProvider companyId={isPlatformOperator && !isPlatformCompanyContext ? companyWorkspaceId ?? undefined : undefined} enabled={companyPages}
      scopeKey={unitScopeCompany ? `company:${unitScopeCompany}` : tenant.tenantKey}>
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
                aria-label="Meus treinamentos"
                to="/learning">
                <span className="learner-nav-desktop-label">Meus treinamentos</span>
                <span aria-hidden="true" className="learner-nav-mobile-label">Treinamentos</span>
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
          <div className="sidebar-brand">
            <Link
              aria-label={`${tenant.tenantName} - início`}
              className="brand-link sidebar-brand-link"
              // inside a company's panel the logo is that company's: it leads to its overview, not out of it
              to={isPlatformCompanyContext ? '/admin/dashboard' : getLandingPage(session)}
            >
              <TenantIdentity tenant={tenant} compact />
            </Link>
            {capabilities?.plan && (!isPlatformOperator || isPlatformCompanyContext) && <PlanMedal plan={capabilities.plan} />}
          </div>
          {/* on the phone the bar keeps only the logo and this button; the links and "Sair" open in a side panel */}
          <div className="contents max-[861px]:hidden">{sidebarNav}</div>
          <button
            aria-expanded={isMenuOpen}
            aria-label="Abrir menu"
            className="ml-auto hidden size-11 shrink-0 cursor-pointer place-items-center rounded-[0.625rem] border-0 bg-transparent p-0 text-[#12332c] transition-colors active:bg-[#eef3f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary max-[861px]:inline-grid"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-[1.375rem]" />
          </button>
          <div className="sidebar-account max-[861px]:hidden!">
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
        {!isLearnerOnly && isMenuOpen && (
          <Sheet className="w-[min(20rem,86vw)]" onClose={() => setIsMenuOpen(false)} title="Menu">
            <nav
              aria-label="Menu"
              className={[
                'flex min-h-full flex-col gap-0.5',
                '[&_.sidebar-label]:mx-2 [&_.sidebar-label]:mt-3 [&_.sidebar-label]:mb-1 [&_.sidebar-label]:text-[11px] [&_.sidebar-label]:font-semibold [&_.sidebar-label]:tracking-[0.08em] [&_.sidebar-label]:text-muted-foreground [&_.sidebar-label:first-child]:mt-0',
                '[&_.sidebar-link]:flex [&_.sidebar-link]:min-h-11 [&_.sidebar-link]:items-center [&_.sidebar-link]:rounded-lg [&_.sidebar-link]:bg-transparent [&_.sidebar-link]:px-3 [&_.sidebar-link]:text-[15px] [&_.sidebar-link]:font-medium [&_.sidebar-link]:text-muted-foreground [&_.sidebar-link]:shadow-none',
                '[&_.sidebar-link.active]:bg-accent [&_.sidebar-link.active]:font-semibold [&_.sidebar-link.active]:text-primary',
              ].join(' ')}
            >
              {sidebarNav}
              <div className="mt-auto grid gap-2.5 border-t border-border pt-4 text-sm font-bold text-foreground">
                <span>{session.displayName}</span>
                <Button disabled={isSigningOut} onClick={handleSignOut} type="button" variant="outline">
                  {isSigningOut ? 'Saindo...' : 'Sair'}
                </Button>
              </div>
            </nav>
          </Sheet>
        )}
        <section
          className={`portal-content${isLearnerOnly ? ' portal-content-learner' : ''}`}
          id="app-content"
          tabIndex={-1}
        >
          {error && <p className="form-error" role="alert">{error}</p>}
          {/* an administrator who also takes trainings keeps the admin menu, and the participant pages keep their look */}
          {/* a page that loads on demand shows this for the moment it takes; the menu around it stays */}
          <Suspense fallback={<LoadingState>Carregando...</LoadingState>}>
            {!isLearnerOnly && location.pathname.startsWith('/learning')
              ? <div className="portal-layout-learner contents"><Outlet /></div>
              : <Outlet context={isLearnerOnly ? setLearningSummary : undefined} />}
          </Suspense>
        </section>
      </div>
    </div>
    </UnitScopeProvider>
  );
}

function TenantIdentity({
  tenant,
  compact,
}: {
  tenant: TenantBranding;
  compact: boolean;
}) {
  // a wide logo is already the company name written out, so the compact header shows it alone, centered
  const [isWideLogo, setIsWideLogo] = useState(false);
  return (
    <div
      className={`tenant-identity${compact ? ' tenant-identity-compact' : ''}${compact && isWideLogo ? ' has-wide-logo' : ''}`}
    >
      {tenant.logoReference ? (
        <img
          alt=""
          className="tenant-logo"
          onLoad={(event) => {
            const image = event.currentTarget;
            setIsWideLogo(image.naturalHeight > 0 && image.naturalWidth / image.naturalHeight >= 2);
          }}
          src={tenant.logoReference}
        />
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

/**
 * The operation's portal painted as a company (the operator administering it): every /platform screen needs the
 * operation's own look and data, so reaching one leaves the company and loads it fresh, as "Voltar à plataforma" does.
 */
function LeaveCompanyPanel({ active }: { active: boolean }) {
  const location = useLocation();
  const leaving = active && /^\/platform(\/|$)/.test(location.pathname);
  useEffect(() => {
    if (!leaving) return;
    clearCompanyAdministration();
    window.location.assign(`${location.pathname}${location.search}${location.hash}`);
  }, [leaving, location.pathname, location.search, location.hash]);
  return null;
}

function getLandingPage(session: IdentitySession): string {
  // arrived by the link of a training: after signing in, straight to it
  if (session.roles.includes('Participant') && linkedTraining()) {
    return '/learning';
  }

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

/** A new screen opens at its top; going back (POP) keeps the browser's own scroll restore. */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
  }, [pathname, navigationType]);
  return null;
}
