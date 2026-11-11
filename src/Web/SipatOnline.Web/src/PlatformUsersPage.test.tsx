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

    expect(await screen.findByRole('heading', { name: 'Alex Participante' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Empresa selecionada' })).toHaveTextContent(
      'Acme Segurança',
    );
    expect(screen.getByText(/Matrícula: employee-100/)).toBeVisible();
    expect(screen.getByText('Ativo')).toBeVisible();
    expect(document.querySelectorAll('.platform-user-card')).toHaveLength(1);
    await user.selectOptions(screen.getByLabelText('Exibir usuários de'), 'tenant-1');
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === '/api/platform/users?offset=0&limit=50&tenantId=tenant-1',
    )).toBe(true));
    expect(screen.getByText(/Dados de autenticação nunca são exibidos/)).toBeVisible();
    await user.type(screen.getByLabelText('Nome completo'), 'Joana Exemplo');
    await user.type(screen.getByLabelText('Matrícula'), 'joana-200');
    await user.type(screen.getByLabelText('Senha inicial temporária'), 'SenhaDemo12345');
    await user.click(screen.getByRole('button', { name: 'Cadastrar usuário' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joana Exemplo foi cadastrado em Acme Segurança.',
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/platform/users', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: expect.stringContaining('"tenantId":"tenant-1"'),
    }));
    expect(screen.queryByText(/passwordHash|senha:|hash:/i)).not.toBeInTheDocument();
  });
});
