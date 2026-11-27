import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BrandThemeContext } from '@/branding';
import { keepTabInside, useIsolatedLayer } from '@/lib/isolatedLayer';
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
  // Escape closes the game wherever the focus is: a button that went away ("Jogar de novo") leaves it on the page
  const escape = useRef({ busy, onClose });
  escape.current = { busy, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || panel.current?.contains(event.target as Node)) return;
      event.stopPropagation();
      panel.current?.focus();
      if (!escape.current.busy) escape.current.onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
  useIsolatedLayer(panel, { focus: ['[autofocus], button'], keepInnerFocus: true });

  return createPortal(<div className="game-stage fixed inset-0 z-[1000] grid place-items-center overflow-y-auto p-2 sm:p-6" style={theme}>
    <div aria-label={label} aria-modal="true" className="game-stage-panel relative w-full max-w-3xl outline-none"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
        keepTabInside(event, panel.current);
      }} ref={panel} role="dialog" tabIndex={-1}>
      {children}
    </div>
  </div>, document.body);
}
