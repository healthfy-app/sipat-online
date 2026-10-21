import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import {
  BrowserRouter,
  Link,
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
        const session = await getSession();
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

  const theme = {
    '--brand-primary': state.tenant.primaryColor,
    '--brand-secondary': state.tenant.secondaryColor,
  } as CSSProperties;

  async function handleSignIn(
    loginIdentifier: string,
    password: string,
  ): Promise<IdentitySession> {
    await signIn(loginIdentifier, password);
    const session = await getSession();
    if (!session) {
      throw new Error('A sessão não foi iniciada. Confira suas credenciais.');
    }

    setState((current) =>
      current.status === 'ready' ? { ...current, session } : current,
    );
    return session;
  }

  async function handleSignOut() {
    await signOut();
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
                to={state.session ? '/admin/sipats' : '/login'}
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
              path="/platform"
              element={
                state.session?.roles.includes('SuperAdmin') ? (
                  <SuperAdminHome />
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
  const [loginIdentifier, setLoginIdentifier] = useState('');
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
          <p className="eyebrow">SUA SIPAT, EM UM NOVO FORMATO</p>
          <h1>Aprender também faz parte de cuidar.</h1>
          <p>
            Acesse os conteúdos da SIPAT da sua empresa em um espaço feito para
            você.
          </p>
        </div>
        <span className="login-caption">Portal exclusivo da empresa</span>
      </div>
      <div className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit}>
          <p className="eyebrow">BEM-VINDO(A)</p>
          <h2>Acesse sua SIPAT</h2>
          <p className="muted-copy">
            Entre com a matrícula e a senha fornecidas pela sua empresa.
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

  if (!session) {
    return <Navigate to="/login" replace />;
  }

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
    <div className="portal-layout">
      <header className="portal-header">
        <Link aria-label={`${tenant.tenantName} - início`} className="brand-link" to="/admin/sipats">
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
      </header>
      <div className="portal-body">
        <aside aria-label="Navegação principal" className="sidebar">
          <p className="sidebar-label">GESTÃO</p>
          <Link className="sidebar-link" to="/admin/sipats">SIPATs</Link>
          {session.roles.includes('SuperAdmin') && (
            <>
              <p className="sidebar-label sidebar-label-spaced">PLATAFORMA</p>
              <Link className="sidebar-link" to="/platform">Super Admin</Link>
            </>
          )}
          <div className="sidebar-footer">
            <span className="tenant-indicator" />
            <span>Portal da empresa</span>
          </div>
        </aside>
        <section className="portal-content">
          {error && <p className="form-error" role="alert">{error}</p>}
          <Outlet />
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
        <span aria-hidden="true" className="tenant-mark">S</span>
      )}
      <span className="tenant-name">{tenant.tenantName}</span>
    </div>
  );
}

function SuperAdminHome() {
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO DA PLATAFORMA</p>
          <h1>Super Admin</h1>
          <p className="muted-copy">
            Área reservada à operação global do SIPAT Online.
          </p>
        </div>
      </div>
      <div className="notice-card">
        <span className="notice-icon" aria-hidden="true">i</span>
        <div>
          <h2>Gestão global em preparação</h2>
          <p>
            As funções globais de empresas e tenants ainda não estão disponíveis.
            Enquanto isso, a gestão de eventos SIPAT permanece no portal da empresa.
          </p>
          <Link className="text-link" to="/admin/sipats">Acessar gestão de SIPATs</Link>
        </div>
      </div>
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
  return session.roles.includes('SuperAdmin') ? '/platform' : '/admin/sipats';
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
