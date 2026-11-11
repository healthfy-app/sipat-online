import { describe, expect, it } from 'vitest';
import { developmentEntryRedirect } from '../developmentEntry';

describe('Development web entry', () => {
  it('redirects root navigation to the operational host preserving the port', () => {
    expect(developmentEntryRedirect('localhost:5188', 'GET', '/')).toBe('https://ops.localhost:5188/platform');
    expect(developmentEntryRedirect('localhost:5173', 'HEAD', '/login')).toBe('https://ops.localhost:5173/platform');
    expect(developmentEntryRedirect('localhost', 'GET', '/admin')).toBe('https://ops.localhost/platform');
  });

  it('does not redirect tenant or operational hosts', () => {
    for (const host of ['microsoft-demo.localhost:5188', 'google-demo.localhost:5188', 'ops.localhost:5188', 'example.com', 'localhost.evil:5188', 'localhost:99999', 'localhost:0']) {
      expect(developmentEntryRedirect(host, 'GET', '/')).toBeNull();
    }
  });

  it('does not redirect API traffic or mutations', () => {
    expect(developmentEntryRedirect('localhost:5188', 'GET', '/api/tenant/branding')).toBeNull();
    expect(developmentEntryRedirect('localhost:5188', 'POST', '/login')).toBeNull();
    expect(developmentEntryRedirect('localhost:5188', 'GET', '/@vite/client')).toBeNull();
    expect(developmentEntryRedirect(undefined, 'GET', '/')).toBeNull();
  });
});
