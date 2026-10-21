import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tenant portal', () => {
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

    expect(await screen.findByRole('heading', { name: 'Acesse sua SIPAT' })).toBeVisible();
    expect(screen.getByText('Acme Segurança')).toBeVisible();
    expect(screen.getByLabelText('Matrícula')).toBeVisible();
  });

  it('signs in and routes a Super Admin to the global shell', async () => {
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
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App />);

    await user.type(await screen.findByLabelText('Matrícula'), 'admin');
    await user.type(screen.getByLabelText('Senha'), 'SenhaForte123');
    await user.click(screen.getByRole('button', { name: 'Entrar no portal' }));

    expect(await screen.findByRole('heading', { name: 'Gestão global em preparação' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Acessar gestão de SIPATs' })).toHaveAttribute(
      'href',
      '/admin/sipats',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  });
});
