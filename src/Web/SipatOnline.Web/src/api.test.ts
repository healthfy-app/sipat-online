import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureCompanyAdministration, createParticipant, forgetAntiforgeryToken, getPlatformCompanyEmployees, getSession, uploadPlatformVideo, ApiError, listAllParticipants, signIn, saveLearningPosition, saveTenantAppearance, primeAntiforgeryToken, sendPlaybackQuality, createExternalPlatformVideo, isExtra, videoProvider } from './api';

afterEach(() => {
  configureCompanyAdministration(null);
  forgetAntiforgeryToken();
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

  it('reuses one antiforgery token across the participant saves', async () => {
    const progress = { lessonId: 'l1' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-1' }))
      .mockImplementation(async () => Response.json(progress));
    vi.stubGlobal('fetch', fetchMock);

    await saveLearningPosition('t1', 'l1', 1000);
    await saveLearningPosition('t1', 'l1', 11000);
    await saveLearningPosition('t1', 'l1', 21000);

    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/identity/antiforgery')).toHaveLength(1);
    const saves = fetchMock.mock.calls.filter(([url]) => url === '/api/learning/tracks/t1/lessons/l1/position');
    expect(saves).toHaveLength(3);
    for (const [, init] of saves) expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('csrf-1');
  });

  it('fetches a fresh token and sends once more when the server rejects the cached one', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'stale' }))
      .mockResolvedValueOnce(Response.json({ title: 'Token antifalsificação inválido.' }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ requestToken: 'fresh' }))
      .mockResolvedValueOnce(Response.json({ lessonId: 'l1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveLearningPosition('t1', 'l1', 1000)).resolves.toEqual({ lessonId: 'l1' });

    const saves = fetchMock.mock.calls.filter(([url]) => url === '/api/learning/tracks/t1/lessons/l1/position');
    expect(saves).toHaveLength(2);
    expect(new Headers(saves[0][1].headers).get('X-CSRF-TOKEN')).toBe('stale');
    expect(new Headers(saves[1][1].headers).get('X-CSRF-TOKEN')).toBe('fresh');
  });

  it('does not retry an ordinary validation error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json({ title: 'learning.invalid_position' }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(saveLearningPosition('t1', 'l1', -1)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it('sends the quality summary with keepalive and the cached token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf-q' }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await primeAntiforgeryToken();
    const summary = { id: 's1' } as never;
    await sendPlaybackQuality('track-1', summary);
    await sendPlaybackQuality('track-1', summary);
    const tokenCalls = fetchMock.mock.calls.filter(c => c[0] === '/api/identity/antiforgery');
    expect(tokenCalls).toHaveLength(1);
    const posts = fetchMock.mock.calls.filter(c => c[0] === '/api/learning/tracks/track-1/playback-quality');
    expect(posts).toHaveLength(2);
    for (const [, init] of posts) {
      expect(init.keepalive).toBe(true);
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('X-CSRF-TOKEN')).toBe('csrf-q');
    }
  });

  it('drops the cached token after a rejected quality send so the next one fetches a fresh token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'old' }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ requestToken: 'fresh' }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await primeAntiforgeryToken();
    const summary = { id: 's1' } as never;
    await expect(sendPlaybackQuality('track-1', summary)).resolves.toBeUndefined();
    await sendPlaybackQuality('track-1', summary);
    const posts = fetchMock.mock.calls.filter(c => c[0] === '/api/learning/tracks/track-1/playback-quality');
    expect(posts).toHaveLength(2);
    expect(new Headers(posts[0][1].headers).get('X-CSRF-TOKEN')).toBe('old');
    expect(new Headers(posts[1][1].headers).get('X-CSRF-TOKEN')).toBe('fresh');
  });
});

describe('external videos', () => {
  it('posts the provider link and reads an old payload without provider as a house video', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json({ id: 'v1', title: 'Dicas', provider: 'YouTube', externalId: 'dQw4w9WgXcQ' }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = { provider: 'YouTube' as const, url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Dicas', durationMilliseconds: null };

    const video = await createExternalPlatformVideo(data);

    expect(fetchMock.mock.calls[1][0]).toBe('/api/platform/catalog/videos/external');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(data);
    expect(video.externalId).toBe('dQw4w9WgXcQ');
    expect(isExtra(video)).toBe(true);
    const old: { provider?: 'Sipat' } = {};
    expect(videoProvider(old)).toBe('Sipat');
    expect(isExtra(old)).toBe(false);
  });
});

describe('video upload', () => {
  const file = new File(['abc'], 'a.mp4', { type: 'video/mp4' });
  const direct = {
    mode: 'direct', videoId: 'vid-1', uploadUrl: 'https://bucket.r2.cloudflarestorage.com/x?sig=1',
    method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, expiresAt: '2026-11-21T10:00:00Z', maxSizeBytes: 1000,
  };
  const video = { id: 'vid-1', title: 'Aula' };

  afterEach(() => {
    forgetAntiforgeryToken();
    vi.unstubAllGlobals();
  });

  it('uploads straight to storage when the API offers a direct upload', async () => {
    forgetAntiforgeryToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json(direct))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json(video, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadPlatformVideo('Aula', 1234, file)).resolves.toEqual(video);

    expect(fetchMock.mock.calls[0][0]).toBe('/api/identity/antiforgery');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/platform/catalog/videos/uploads');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ contentType: 'video/mp4', sizeBytes: 3 });
    const [putUrl, putInit] = fetchMock.mock.calls[2];
    expect(putUrl).toBe(direct.uploadUrl);
    expect(putInit.method).toBe('PUT');
    expect(putInit.body).toBe(file);
    expect(putInit.credentials).toBe('omit');
    const putHeaders = new Headers(putInit.headers);
    expect(putHeaders.get('Content-Type')).toBe('video/mp4');
    expect(putHeaders.has('X-CSRF-TOKEN')).toBe(false);
    expect(fetchMock.mock.calls[3][0]).toBe('/api/platform/catalog/videos/uploads/vid-1/complete');
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ title: 'Aula', durationMilliseconds: 1234, courseId: null });
  });

  it('sends the course id to complete when uploading into a course', async () => {
    forgetAntiforgeryToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json(direct))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json(video, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadPlatformVideo('Aula', 1234, file, 'course-9');

    expect(JSON.parse(fetchMock.mock.calls[3][1].body).courseId).toBe('course-9');
  });

  it('falls back to the multipart form when the API says multipart', async () => {
    forgetAntiforgeryToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json({ mode: 'multipart', maxSizeBytes: 1000 }))
      .mockResolvedValueOnce(Response.json(video, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadPlatformVideo('Aula', 1234, file)).resolves.toEqual(video);

    expect(fetchMock.mock.calls[2][0]).toBe('/api/platform/catalog/videos');
    const form = fetchMock.mock.calls[2][1].body as FormData;
    expect(form.get('title')).toBe('Aula');
    expect(form.get('durationMilliseconds')).toBe('1234');
    expect((form.get('video') as File).name).toBe('a.mp4');
  });

  it('falls back to the multipart form on an older API without the uploads route', async () => {
    forgetAntiforgeryToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(video, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadPlatformVideo('Aula', 1234, file, 'course-9')).resolves.toEqual(video);

    expect(fetchMock.mock.calls[2][0]).toBe('/api/platform/catalog/courses/course-9/videos');
  });

  it('reports a failed direct PUT in Portuguese and does not complete', async () => {
    forgetAntiforgeryToken();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ requestToken: 'csrf' }))
      .mockResolvedValueOnce(Response.json(direct))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await uploadPlatformVideo('Aula', 1234, file).catch(e => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.message).toBe('Não foi possível enviar o vídeo. Verifique a conexão e tente de novo.');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
