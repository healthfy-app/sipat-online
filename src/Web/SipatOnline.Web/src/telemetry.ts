/**
 * Sends the browser's unhandled errors and failed requests to the API, which writes them as a log
 * line (they show up in the observability dashboard with the API's own logs). Fire and forget:
 * a report that fails is dropped, never retried and never reported again.
 */
export type ClientErrorKind = 'error' | 'unhandledrejection' | 'fetch' | 'http';

export interface ClientErrorReport {
  kind: ClientErrorKind;
  message: string;
  source?: string;
  stack?: string;
}

const endpoint = '/api/client-errors';
const maxReportsPerPage = 20;

// off in the test run, where fetch is mocked and every call is counted
let enabled = import.meta.env.MODE !== 'test';
let sent = 0;
const seen = new Set<string>();

export function setErrorReportingEnabled(value: boolean): void {
  enabled = value;
  sent = 0;
  seen.clear();
}

export function reportClientError(report: ClientErrorReport): void {
  if (!enabled || sent >= maxReportsPerPage) return;
  const key = `${report.kind}|${report.message}|${report.source ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent += 1;

  try {
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: report.kind,
        message: report.message.slice(0, 2000),
        url: window.location.pathname,
        source: report.source?.slice(0, 300),
        stack: report.stack?.slice(0, 2000),
      }),
    }).catch(() => undefined);
  } catch {
    // reporting must never break the page
  }
}

/** Failed calls to the API: no answer at all, or a server error (5xx). Normal 4xx answers are not errors. */
export function reportFailedRequest(method: string, path: string, failure: unknown): void {
  if (path.startsWith(endpoint)) return;
  const route = path.split('?')[0];
  if (typeof failure === 'number') {
    reportClientError({ kind: 'http', message: `${method} ${route} respondeu ${failure}`, source: route });
    return;
  }
  const message = failure instanceof Error ? failure.message : String(failure);
  // the participant left the page or the request was cancelled on purpose
  if (failure instanceof DOMException && failure.name === 'AbortError') return;
  reportClientError({ kind: 'fetch', message: `${method} ${route} falhou: ${message}`, source: route });
}

export function installErrorReporting(): void {
  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : null;
    reportClientError({
      kind: 'error',
      message: error?.message ?? event.message ?? 'Erro sem mensagem',
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      stack: error?.stack,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    reportClientError({
      kind: 'unhandledrejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
