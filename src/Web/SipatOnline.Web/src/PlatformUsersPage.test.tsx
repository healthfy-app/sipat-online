import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlatformUsersPage from './PlatformUsersPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('platform user directory', () => {
  it('applies a participant role filter supplied by the company card link', async () => {
    const company = {
      id: 'tenant-1',
      key: 'acme',
      name: 'Acme',
      createdAt: '2026-10-21T12:00:00Z',
      isActive: true,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/platform/companies') return Response.json([company]);
      return Response.json({ offset: 0, limit: 50, totalCount: 0, items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/platform/users?tenant=tenant-1&role=Participant']}>
        <PlatformUsersPage />
      </MemoryRouter>,
    );

    await screen.findByText('Nenhum usuário corresponde aos filtros');
    expect(screen.getByLabelText('Perfil')).toHaveValue('Participant');
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === '/api/platform/users?offset=0&limit=50&tenantId=tenant-1&role=Participant',
    )).toBe(true);
  });

  it('creates a tenant-bound account and lists it without exposing authentication data', async () => {
    const userPage = {
      offset: 0,
      limit: 50,
      totalCount: 1,
      items: [{
        id: 'user-1',
        tenantId: 'tenant-1',
        tenantKey: 'acme',
        tenantName: 'Acme Segurança',
        loginIdentifier: 'employee-100',
        displayName: 'Alex Participante',
        roles: ['Participant'],
        isActive: true,
        createdAt: '2026-10-21T12:00:00Z',
      }],
    };
    const company = {
      id: 'tenant-1',
      key: 'acme',
      name: 'Acme Segurança',
      createdAt: '2026-10-21T12:00:00Z',
      isActive: true,
    };
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/platform/companies') {
        return Response.json([company]);
      }

      if (path === '/api/identity/antiforgery') {
        return Response.json({ requestToken: 'csrf-token' });
      }

      if (path === '/api/platform/users' && init?.method === 'POST') {
        created = true;
        return Response.json({
          ...userPage.items[0],
          id: 'user-2',
          loginIdentifier: 'joana-200',
          displayName: 'Joana Exemplo',
          tenantName: company.name,
        });
      }

      return Response.json(created
        ? {
          ...userPage,
          totalCount: 2,
          items: [
            ...userPage.items,
            {
              ...userPage.items[0],
              id: 'user-2',
              loginIdentifier: 'joana-200',
              displayName: 'Joana Exemplo',
            },
          ],
        }
        : userPage);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <PlatformUsersPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('row', { name: /Alex Participante/ })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Login' })).toBeVisible();
    expect(screen.getByRole('cell', { name: /Acme Segurança acme/ })).toBeVisible();
    expect(screen.getByText('Ativo')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Empresa'), 'tenant-1');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === '/api/platform/users?offset=0&limit=50&tenantId=tenant-1',
    )).toBe(true));
    expect(screen.getByText(/Dados de autenticação nunca são exibidos/)).toBeVisible();

    await user.type(screen.getByLabelText('Buscar usuário'), 'employee');
    await user.selectOptions(screen.getByLabelText('Perfil'), 'Participant');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === '/api/platform/users?offset=0&limit=50&tenantId=tenant-1&search=employee&role=Participant',
    )).toBe(true));

    const createButton = screen.getByRole('button', { name: '+ Novo usuário' });
    await waitFor(() => expect(createButton).toBeEnabled());
    await user.click(createButton);
    expect(screen.getByRole('dialog', { name: 'Novo usuário' })).toBeVisible();
    await user.type(screen.getByLabelText('Nome completo'), 'Joana Exemplo');
    await user.type(screen.getByLabelText('Login'), 'joana-200');
    await user.click(screen.getByRole('button', { name: 'Gerar senha' }));
    const generatedPassword = screen.getByLabelText('Senha inicial temporária');
    expect((generatedPassword as HTMLInputElement).value)
      .toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%&*+\-_=]).{16}$/);
    await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joana Exemplo foi cadastrado em Acme Segurança.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createButton).toHaveFocus();
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/users', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: expect.stringContaining('"tenantId":"tenant-1"'),
    }));
    expect(screen.queryByText(/passwordHash|senha:|hash:/i)).not.toBeInTheDocument();
  });
});
