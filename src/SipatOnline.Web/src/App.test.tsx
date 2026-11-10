import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => {
  window.history.pushState({}, '', '/login');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tenant portal', () => {
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
        .mockResolvedValueOnce(Response.json({ offset: 0, limit: 20, totalCount: 0, items: [] })),
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Programação da SIPAT' })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/sipats');
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
    expect(screen.getByText('Acme Segurança')).toBeVisible();
    expect(screen.getByLabelText('Matrícula')).toBeVisible();
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
        Response.json({ offset: 0, limit: 20, totalCount: 0, items: [] }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText('Matrícula'), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Programação da SIPAT' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Programação da SIPAT' })).toHaveAttribute('href', '/admin/sipats');
    expect(screen.getByRole('link', { name: 'Trilhas e vídeos' })).toHaveAttribute('href', '/admin/content');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
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

    expect(await screen.findByRole('heading', { name: 'Identificação de riscos' })).toBeVisible();
    const sidebar = screen.getByRole('complementary', { name: 'Área do aluno' });
    expect(await within(sidebar).findByText('50% concluído')).toBeVisible();
    expect(within(sidebar).getByText('1 de 2 aulas')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Minha formação' })).toHaveAttribute('aria-current', 'page');
  });

  it('routes platform operators to the platform dashboard', async () => {
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
    await user.type(screen.getByLabelText('Matrícula'), 'operator');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Operação' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Gerenciar empresas' })).toHaveAttribute('href', '/platform/companies');
    expect(screen.getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/platform/dashboard');
    expect(screen.getByRole('link', { name: 'Usuários' })).toHaveAttribute('href', '/platform/users');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/platform/dashboard',
        expect.objectContaining({ credentials: 'include' }),
      );
    });
  });
});
