import { useEffect, useRef } from 'react';

/**
 * A tab left open keeps running the version it loaded, for hours: after a new version goes up it shows screens that
 * no longer exist. This watches for a new version (when the tab comes back into view, and every few minutes) and, once
 * there is one, loads it on the next change of page, which is a moment when nothing is being typed.
 */
const mainScript = /\/assets\/index-[\w-]+\.js/;

function runningScript(): string | null {
  for (const script of Array.from(document.querySelectorAll('script[src]'))) {
    const match = mainScript.exec(script.getAttribute('src') ?? '');
    if (match) return match[0];
  }
  return null;
}

export function useNewVersionReload(pathname: string): void {
  const stale = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const running = runningScript();
    // a development server has no versioned script: nothing to compare
    if (!running) return;
    let current = true;
    const check = () => {
      if (stale.current || document.visibilityState !== 'visible') return;
      fetch('/index.html', { cache: 'no-store' })
        .then(response => (response.ok ? response.text() : ''))
        .then(page => {
          const served = mainScript.exec(page)?.[0];
          if (current && served && served !== running) stale.current = true;
        }, () => undefined);
    };
    check();
    const timer = window.setInterval(check, 5 * 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { current = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (stale.current) window.location.reload();
  }, [pathname]);
}
