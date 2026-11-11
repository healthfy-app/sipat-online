import type { Plugin } from 'vite';

export function developmentEntryRedirect(host: string | undefined, method: string | undefined, path: string): string | null {
  if (!host || (method !== 'GET' && method !== 'HEAD') || path.startsWith('/api/') || path.startsWith('/@')) {
    return null;
  }
  const match = /^localhost(?::([0-9]{1,5}))?$/i.exec(host);
  if (!match || (match[1] && (Number(match[1]) < 1 || Number(match[1]) > 65535))) return null;
  const origin = new URL(`https://${host}`);
  origin.hostname = 'ops.localhost';
  return new URL('/platform', origin).href;
}

export function developmentEntry(): Plugin {
  return {
    name: 'sipat-development-entry',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const destination = developmentEntryRedirect(request.headers.host, request.method, request.url ?? '/');
        if (!destination) return next();
        response.writeHead(307, { Location: destination, 'Cache-Control': 'no-store' });
        response.end();
      });
    },
  };
}
