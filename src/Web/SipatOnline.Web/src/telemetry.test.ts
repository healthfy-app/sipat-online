import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportClientError, reportFailedRequest, setErrorReportingEnabled } from './telemetry';

describe('error reporting', () => {
  afterEach(() => {
    setErrorReportingEnabled(false);
    vi.unstubAllGlobals();
  });

  it('is off in the test run', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    reportClientError({ kind: 'error', message: 'boom' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the error once, without the query string', () => {
    setErrorReportingEnabled(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    reportFailedRequest('PUT', '/api/learning/tracks/1/lessons/2/position?token=secret', new TypeError('Failed to fetch'));
    reportFailedRequest('PUT', '/api/learning/tracks/1/lessons/2/position?token=secret', new TypeError('Failed to fetch'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/client-errors');
    const body = JSON.parse(init.body as string);
    expect(body.kind).toBe('fetch');
    expect(body.message).toContain('/api/learning/tracks/1/lessons/2/position');
    expect(body.message).not.toContain('secret');
  });

  it('ignores cancelled requests and never reports itself', () => {
    setErrorReportingEnabled(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    reportFailedRequest('GET', '/api/tenant/branding', new DOMException('aborted', 'AbortError'));
    reportFailedRequest('POST', '/api/client-errors', 500);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
