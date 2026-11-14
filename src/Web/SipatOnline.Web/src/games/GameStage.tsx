import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BrandThemeContext } from '@/branding';
// The stage shows before the game chunk arrives, so its styles ship with the main bundle.
import './games.css';

/**
 * Full-screen stage for a game: the page (and the paused video) stays visible, dimmed and
 * blurred, behind the game. Traps focus, makes the page inert and closes with Escape.
 */
export default function GameStage({ label, onClose, busy = false, children }: {
  label: string; onClose: () => void; busy?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const theme = useContext(BrandThemeContext);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && !element.contains(panel.current),
    );
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    if (!panel.current?.contains(document.activeElement)) {
      (panel.current?.querySelector<HTMLElement>('[autofocus], button') ?? panel.current)?.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(<div className="game-stage fixed inset-0 z-[1000] grid place-items-center overflow-y-auto p-2 sm:p-6" style={theme}>
    <div aria-label={label} aria-modal="true" className="game-stage-panel relative w-full max-w-3xl outline-none"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
        if (event.key !== 'Tab') return;
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) ?? []).filter(element => element.tabIndex >= 0);
        if (!elements.length) { event.preventDefault(); return; }
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }} ref={panel} role="dialog" tabIndex={-1}>
      {children}
    </div>
  </div>, document.body);
}
