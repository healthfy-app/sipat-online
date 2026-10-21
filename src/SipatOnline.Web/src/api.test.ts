import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSession, signIn } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('identity API client', () => {
  it('acquires antiforgery token and sends it with credentialed login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-value' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await signIn('matricula-123', 'SenhaSegura123');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/antiforgery');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[1][0]).toBe('/api/identity/login');
    const requestOptions = fetchMock.mock.calls[1][1] as RequestInit;
    expect(requestOptions.credentials).toBe('include');
    expect(new Headers(requestOptions.headers).get('X-CSRF-TOKEN')).toBe('csrf-value');
    expect(requestOptions.body).toBe(
      JSON.stringify({ loginIdentifier: 'matricula-123', password: 'SenhaSegura123' }),
    );
  });

  it('treats an unauthenticated session as an empty session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        Response.json({ title: 'Não autenticado.' }, { status: 401 }),
      ),
    );

    await expect(getSession()).resolves.toBeNull();
  });
});
