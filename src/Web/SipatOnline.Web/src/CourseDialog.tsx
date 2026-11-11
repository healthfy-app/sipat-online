import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './PlatformCourses.css';
import { BrandThemeContext } from './branding';

export default function CourseDialog({ title, onClose, children, wide = false, busy = false, drawer = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean; drawer?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
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
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? panel.current?.querySelector<HTMLElement>('input:not([type=file]), textarea, button');
    (first ?? panel.current)?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  useEffect(() => { if (busy) panel.current?.focus(); }, [busy]);
  return createPortal(<div className={`course-dialog-backdrop${drawer ? ' course-dialog-backdrop-drawer' : ''}`} style={theme} onClick={event => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <div aria-labelledby={titleId} aria-modal="true" className={`course-dialog${wide ? ' course-dialog-wide' : ''}${drawer ? ' course-dialog-drawer' : ''}`}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
        if (event.key !== 'Tab') return;
        const elements = panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        );
        if (!elements?.length) { event.preventDefault(); return; }
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }} ref={panel} role="dialog" tabIndex={-1}>
      <div className="course-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button aria-label={`Fechar ${title.toLowerCase()}`} className="course-dialog-close" disabled={busy}
          onClick={onClose} type="button">×</button>
      </div>
      {children}
    </div>
  </div>, document.body);
}
