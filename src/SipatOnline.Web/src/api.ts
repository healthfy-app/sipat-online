export interface TenantBranding {
  tenantKey: string;
  tenantName: string;
  logoReference: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
}

export interface IdentitySession {
  id: string;
  loginIdentifier: string;
  displayName: string;
  roles: string[];
}

export interface SipatEvent {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: 'Draft' | 'Published' | 'Cancelled';
  createdAt: string;
}

export interface SipatEventPage {
  offset: number;
  limit: number;
  totalCount: number;
  items: SipatEvent[];
}

export interface SipatEventData {
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Não foi possível concluir a solicitação (HTTP ${response.status}).`;

  try {
    const problem = (await response.json()) as { detail?: string; title?: string };
    message = problem.detail ?? problem.title ?? message;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  return new ApiError(message, response.status);
}

async function getAntiforgeryToken(): Promise<string> {
  const response = await fetch('/api/identity/antiforgery', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const payload = (await response.json()) as { requestToken?: string };
  if (!payload.requestToken) {
    throw new Error('A API não retornou o token antifalsificação.');
  }

  return payload.requestToken;
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    headers.set('X-CSRF-TOKEN', await getAntiforgeryToken());
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    method,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw await readError(response);
  }

  return response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>;
}

export function getTenantBranding(): Promise<TenantBranding> {
  return requestJson<TenantBranding>('/api/tenant/branding');
}

export async function getSession(): Promise<IdentitySession | null> {
  try {
    return await requestJson<IdentitySession>('/api/identity/session');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export async function signIn(
  loginIdentifier: string,
  password: string,
): Promise<void> {
  await request('/api/identity/login', {
    method: 'POST',
    body: JSON.stringify({ loginIdentifier, password }),
  });
}

export async function signOut(): Promise<void> {
  await request('/api/identity/logout', { method: 'POST' });
}

export function listSipatEvents(offset = 0, limit = 20): Promise<SipatEventPage> {
  return requestJson<SipatEventPage>(
    `/api/admin/sipats?offset=${offset}&limit=${limit}`,
  );
}

export async function createSipatEvent(data: SipatEventData): Promise<SipatEvent> {
  return requestJson<SipatEvent>('/api/admin/sipats', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSipatEvent(
  id: string,
  data: SipatEventData,
): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function publishSipatEvent(id: string): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function cancelSipatEvent(id: string): Promise<SipatEvent> {
  return requestJson<SipatEvent>(`/api/admin/sipats/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
