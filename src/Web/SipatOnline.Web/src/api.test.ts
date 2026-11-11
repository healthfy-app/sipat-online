import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureCompanyAdministration, createParticipant, getPlatformCompanyEmployees, getSession, listAllParticipants, signIn, saveTenantAppearance } from './api';

afterEach(() => {
  configureCompanyAdministration(null);
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('sends company and antiforgery context when saving appearance', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-owner' }))
      .mockResolvedValueOnce(Response.json({ tenantKey: 'acme', primaryColor: '#123456' }));
    vi.stubGlobal('fetch', fetchMock);
    configureCompanyAdministration('company-1');
    await saveTenantAppearance({ primaryColor: '#123456', secondaryColor: '#FFFFFF', logoBase64: 'png-data' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/antiforgery');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('X-Sipat-Company')).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/tenant/branding/appearance');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-Sipat-Company')).toBe('company-1');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-CSRF-TOKEN')).toBe('csrf-owner');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      primaryColor: '#123456', secondaryColor: '#FFFFFF', logoBase64: 'png-data',
    });
  });
  it('keeps company context on owner mutations without leaking it to antiforgery bootstrap', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-owner' }))
      .mockResolvedValueOnce(Response.json({ id: 'p1', displayName: 'Participant', loginIdentifier: 'MAT-1', isActive: true }));
    vi.stubGlobal('fetch', fetchMock);
    configureCompanyAdministration('company-1');
    await createParticipant({ displayName: 'Participant', loginIdentifier: 'MAT-1', initialPassword: 'RuntimePassword123', role: 'Participant' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/antiforgery');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('X-Sipat-Company')).toBe(false);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-Sipat-Company')).toBe('company-1');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('X-CSRF-TOKEN')).toBe('csrf-owner');
  });

  it('scopes only tenant administration requests and clears the selected company on exit', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({ offset: 0, limit: 100, totalCount: 0, items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    configureCompanyAdministration('company-1');
    await listAllParticipants();
    await getPlatformCompanyEmployees('company-2');
    configureCompanyAdministration(null);
    await listAllParticipants();
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('X-Sipat-Company')).toBe('company-1');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).has('X-Sipat-Company')).toBe(false);
    expect(new Headers(fetchMock.mock.calls[2][1].headers).has('X-Sipat-Company')).toBe(false);
  });

  it('requests a filtered, paginated company employee list', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      companyId: 'company/1',
      companyKey: 'acme',
      companyName: 'Acme',
      items: [],
      offset: 50,
      limit: 50,
      totalCount: 0,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await getPlatformCompanyEmployees('company/1', {
      offset: 50,
      limit: 50,
      search: ' Mat-01 ',
      includeInactive: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/platform/companies/company%2F1/employees?offset=50&limit=50&search=Mat-01&includeInactive=true',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('loads every company participant page without exceeding the API page limit', async () => {
    const participant = (id: string) => ({
      id, loginIdentifier: `MAT-${id}`, displayName: `Pessoa ${id}`, isActive: true,
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({
        offset: 0, limit: 100, totalCount: 101, items: Array.from({ length: 100 }, (_, index) => participant(`${index + 1}`)),
      }))
      .mockResolvedValueOnce(Response.json({
        offset: 100, limit: 100, totalCount: 101, items: [participant('101')],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await listAllParticipants();

    expect(result).toHaveLength(101);
    expect(result.at(-1)?.id).toBe('101');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/users/participants?offset=0&limit=100',
      '/api/admin/users/participants?offset=100&limit=100',
    ]);
  });

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
