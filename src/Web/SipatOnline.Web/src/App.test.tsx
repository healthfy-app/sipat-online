import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { configureCompanyAdministration } from './api';

beforeEach(() => {
  configureCompanyAdministration(null);
  sessionStorage.clear();
  window.history.pushState({}, '', '/login');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tenant portal', () => {
  it.each(['ClientAdmin', 'Supervisor', 'Participant'])('restricts identity settings for a %s account', async (role) => {
    window.history.pushState({}, '', '/admin/appearance');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/tenant/branding') return Response.json({
        tenantKey: 'acme', tenantName: 'Acme', primaryColor: '#123456', secondaryColor: '#FFFFFF',
        logoReference: null, customDomain: null,
      });
      if (url === '/api/identity/session') return Response.json({
        id: 'user', loginIdentifier: 'user', displayName: 'User', roles: [role],
      });
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);
    if (role === 'ClientAdmin') {
      expect(await screen.findByRole('heading', { name: 'Identidade visual' })).toBeVisible();
      expect(screen.getByRole('link', { name: 'Identidade visual' })).toBeVisible();
    } else {
      expect(await screen.findByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible();
      expect(screen.queryByRole('link', { name: 'Identidade visual' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Salvar identidade visual' })).not.toBeInTheDocument();
    }
  });
  it('lets a supervisor view company progress without administration controls', async () => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/tenant/branding') return Response.json({
        tenantKey: 'acme', tenantName: 'Acme', primaryColor: '#123456', secondaryColor: '#FFFFFF',
        logoReference: null, customDomain: null,
      });
      if (url === '/api/identity/session') return Response.json({
        id: 'supervisor', loginIdentifier: 'supervisor', displayName: 'Supervisor', roles: ['Supervisor'],
      });
      if (url.startsWith('/api/admin/users/participants?')) return Response.json({
        offset: 0, limit: 100, totalCount: 0, items: [],
      });
      if (url === '/api/admin/learning/participation' || url === '/api/admin/learning/tracks') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/dashboard');
    expect(screen.queryByRole('link', { name: 'Trilhas e vídeos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Programação' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Acompanhamento' }));
    expect(await screen.findByText(/Modo de consulta/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Adicionar participantes' })).not.toBeInTheDocument();
  });

  it('opens the selected company for the owner while preserving the platform session and explicit exit', async () => {
    window.history.pushState({}, '', '/admin/dashboard?companyId=company-1');
    const requests: { url: string; company: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const company = new Headers(init?.headers).get('X-Sipat-Company');
      requests.push({ url, company });
      if (url === '/api/tenant/branding') return Response.json({
        tenantKey: company ? 'acme' : 'platform', tenantName: company ? 'Acme' : 'SIPAT Online',
        primaryColor: '#123456', secondaryColor: '#FFFFFF', logoReference: null, customDomain: null,
      });
      if (url === '/api/platform/identity/session') return Response.json({
        id: 'owner', loginIdentifier: 'owner', displayName: 'Owner', roles: ['PlatformOperator'],
      });
      if (url.startsWith('/api/admin/users/participants?')) return Response.json({
        offset: 0, limit: 100, totalCount: 0, items: [],
      });
      if (url === '/api/admin/learning/participation') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'Modo de administração da empresa' }))
      .toHaveTextContent('MODO DONO · Administrando Acme');
    expect(screen.getByRole('link', { name: 'Identidade visual' })).toHaveAttribute('href', '/admin/appearance');
    expect(screen.getByRole('link', { name: 'Voltar à plataforma' })).toHaveAttribute('href', '/platform');
    expect(screen.getByRole('link', { name: 'Trilhas e vídeos' })).toBeVisible();
    const companyNavigation = screen.getByRole('complementary', { name: 'Navegação principal' });
    expect(within(companyNavigation).getByText('GESTÃO DA EMPRESA')).toBeVisible();
    expect(within(companyNavigation).queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
    expect(within(companyNavigation).queryByRole('link', { name: 'Empresas' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('sipat-company-administration')).toBe('company-1');
    expect(requests).toContainEqual({ url: '/api/platform/identity/session', company: null });
    expect(requests.filter(request => request.url.startsWith('/api/admin/')))
      .toEqual(expect.arrayContaining([
        { url: '/api/admin/learning/participation', company: 'company-1' },
        { url: '/api/admin/users/participants?offset=0&limit=100', company: 'company-1' },
      ]));
  });

  it.each([
    { label: 'catalog', path: '/learning', coursesActive: true },
    { label: 'course player', path: '/learning/tracks/unassigned', coursesActive: true },
    { label: 'certificates', path: '/learning/certificates', coursesActive: false },
  ])('uses the favicon brand and one consistently styled active learner link in $label', async ({ path, coursesActive }) => {
    window.history.pushState({}, '', path);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/tenant/branding') return Response.json({
        tenantKey: 'acme', tenantName: 'Acme', logoReference: null,
        primaryColor: '#123456', secondaryColor: '#FFFFFF', customDomain: null,
      });
      if (url === '/api/identity/session') return Response.json({
        id: 'participant', loginIdentifier: 'participant', displayName: 'Maria', roles: ['Participant'],
      });
      if (url === '/api/learning/tracks' || url === '/api/learning/certificates') return Response.json([]);
      throw new Error(`Unexpected request: ${url}`);
    }));
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: 'Área do aluno' });
    const courses = within(sidebar).getByRole('link', { name: 'Minha formação' });
    const certificates = within(sidebar).getByRole('link', { name: 'Meus certificados' });
    expect(courses).toHaveClass('learner-sidebar-link');
    expect(certificates).toHaveClass('learner-sidebar-link');
    expect(coursesActive ? courses : certificates).toHaveClass('active');
    expect(coursesActive ? certificates : courses).not.toHaveClass('active');
    expect(coursesActive ? courses : certificates).toHaveAttribute('aria-current', 'page');
    expect(coursesActive ? certificates : courses).not.toHaveAttribute('aria-current');
    expect(within(sidebar).getByRole('img', { name: 'SIPAT Online' })).toHaveAttribute('src', '/favicon.svg');
  });
  it.each(['ClientAdmin', 'Participant', 'Supervisor'])('denies the operational editor to a %s account', async (role) => {
    window.history.pushState({}, '', '/platform/courses/course-1/edit');
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        tenantKey: 'acme', tenantName: 'Acme', logoReference: null,
        primaryColor: '#123456', secondaryColor: '#FFFFFF', customDomain: null,
      }))
      .mockResolvedValueOnce(Response.json({
        id: 'user-1', loginIdentifier: 'user', displayName: 'User', roles: [role],
      }));
    vi.stubGlobal('fetch', fetch);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('navigation', { name: 'Etapas do curso' })).not.toBeInTheDocument();
  });

  it('opens the sign-in page directly from the root when unauthenticated', async () => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }))
        .mockResolvedValueOnce(Response.json({ title: 'Não autenticado.' }, { status: 401 })),
    );
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Entre na sua área de aprendizagem' })).toBeVisible();
    expect(window.location.pathname).toBe('/login');
  });

  it('opens the appropriate portal from the root when already authenticated', async () => {
    window.history.pushState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }))
        .mockResolvedValueOnce(Response.json({
          id: 'admin-1',
          loginIdentifier: 'admin',
          displayName: 'Admin SIPAT',
          roles: ['SuperAdmin'],
        }))
        .mockResolvedValueOnce(Response.json({ offset: 0, limit: 100, totalCount: 0, items: [] }))
        .mockResolvedValueOnce(Response.json([])),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/dashboard');
  });

  it('loads the tenant brand and presents the company sign-in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(
          Response.json({
            tenantKey: 'acme',
            tenantName: 'Acme Segurança',
            logoReference: null,
            primaryColor: '#123456',
            secondaryColor: '#FFFFFF',
            customDomain: null,
          }),
        )
        .mockResolvedValueOnce(
          Response.json({ title: 'Não autenticado.' }, { status: 401 }),
        ),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Entre na sua área de aprendizagem' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Acesso ao portal da empresa' })).toBeVisible();
    expect(screen.getByText('Pequenos passos. Rotinas mais seguras.')).toBeInTheDocument();
    expect(screen.getByText('Acme Segurança')).toBeVisible();
    expect(screen.getByLabelText('Matrícula')).toBeVisible();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('placeholder', 'Digite sua senha');
  });

  it('toggles password visibility without changing the entered value', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }))
        .mockResolvedValueOnce(Response.json({ title: 'Não autenticado.' }, { status: 401 })),
    );
    const user = userEvent.setup();
    render(<App />);

    const password = await screen.findByLabelText('Senha');
    await user.type(password, 'Segredo123');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('Segredo123');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveValue('Segredo123');
  });

  it('keeps a tenant Super Admin inside the tenant administration portal', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ title: 'Não autenticado.' }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'a09c6796-0797-4bea-b46b-9888f6575904',
          loginIdentifier: 'admin',
          displayName: 'Admin SIPAT',
          roles: ['SuperAdmin'],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ offset: 0, limit: 100, totalCount: 0, items: [] }),
      )
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText('Matrícula'), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Visão geral' })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/dashboard');
    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute('href', '/admin/dashboard');
    expect(screen.getByRole('link', { name: 'Programação' })).toHaveAttribute('href', '/admin/sipats');
    expect(screen.getByRole('link', { name: 'Trilhas e vídeos' })).toHaveAttribute('href', '/admin/content');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(7));
  });

  it('shows the learner portal without the administration sidebar for participants', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ title: 'Não autenticado.' }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'b6f0ed4e-b3dd-40a4-b584-844fa71694b5',
          loginIdentifier: 'participant',
          displayName: 'Maria Participante',
          roles: ['Participant'],
        }),
      )
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText('Matrícula'), 'participant');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', {
      name: 'Você ainda não tem uma trilha atribuída',
    })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: 'Navegação principal' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Seções da área do aluno' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Minha formação' })).toHaveAttribute('href', '/learning');
    expect(screen.queryByText('Fórum')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buscar cursos' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  });

  it('shows assigned learning progress in the learner sidebar', async () => {
    let signedIn = false;
    const track = {
      id: 'track-1',
      sipatEventId: 'sipat-1',
      title: 'Segurança no trabalho',
      description: null,
      revisionNumber: 1,
      lessonCount: 2,
      completedLessonCount: 1,
      progressPercentage: 50,
    };
    const lesson = {
      id: 'lesson-1',
      title: 'Identificação de riscos',
      description: null,
      position: 1,
      durationMilliseconds: 5000,
      lastPlaybackPositionMilliseconds: 0,
      watchedPercentage: 0,
      isCompleted: false,
      completedAt: null,
    };
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input === '/api/tenant/branding') {
        return Response.json({
          tenantKey: 'acme',
          tenantName: 'Acme Segurança',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        });
      }
      if (input === '/api/identity/session') {
        return signedIn
          ? Response.json({ id: 'participant-1', loginIdentifier: 'participant', displayName: 'Maria', roles: ['Participant'] })
          : Response.json({ title: 'Não autenticado.' }, { status: 401 });
      }
      if (input === '/api/identity/antiforgery') return Response.json({ requestToken: 'csrf-token' });
      if (input === '/api/identity/login') {
        signedIn = true;
        return new Response(null, { status: 204 });
      }
      if (input === '/api/learning/tracks') return Response.json([track]);
      if (input === '/api/learning/tracks/track-1') return Response.json({ track, lessons: [lesson] });
      if (input.endsWith('/playback')) {
        return Response.json({ title: 'Vídeo indisponível.' }, { status: 503 });
      }
      throw new Error(`Unexpected request: ${input}`);
    }));
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText('Matrícula'), 'participant');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Seus cursos. Seu próximo passo.' })).toBeVisible();
    const sidebar = screen.getByRole('complementary', { name: 'Área do aluno' });
    expect(await within(sidebar).findByText('50% concluído')).toBeVisible();
    expect(within(sidebar).getByText('0 de 1 cursos')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Minha formação' })).toHaveAttribute('aria-current', 'page');
  });

  it('routes platform operators to the company list', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        Response.json({
          tenantKey: 'platform',
          tenantName: 'SIPAT Online',
          logoReference: null,
          primaryColor: '#123456',
          secondaryColor: '#FFFFFF',
          customDomain: null,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ title: 'Não autenticado.' }, { status: 401 }),
      )
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        Response.json({
          id: 'a09c6796-0797-4bea-b46b-9888f6575904',
          loginIdentifier: 'operator',
          displayName: 'Operador',
          roles: ['PlatformOperator'],
        }),
      )
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Acesse a plataforma' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Acesso à plataforma' })).toBeVisible();
    expect(screen.getByText('Acesso exclusivo para a equipe de operação.')).toBeVisible();
    await user.type(screen.getByLabelText('Matrícula'), 'operator');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Empresas' })).toBeVisible();
    expect(screen.getByRole('link', { name: '+ Nova empresa' })).toHaveAttribute('href', '/platform/companies');
    expect(screen.queryByRole('link', { name: 'Cadastrar empresa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Painel' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/platform/users');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/dashboard',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});
