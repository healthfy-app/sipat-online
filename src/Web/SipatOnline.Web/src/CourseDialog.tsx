import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './PlatformCourses.css';
import { BrandThemeContext } from './branding';
import { keepTabInside, useIsolatedLayer } from './lib/isolatedLayer';

export default function CourseDialog({ title, onClose, children, wide = false, busy = false, drawer = false, className = '' }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; busy?: boolean; drawer?: boolean; className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const theme = useContext(BrandThemeContext);
  useIsolatedLayer(panel, { focus: ['[data-autofocus]', 'input:not([type=file]), textarea, button'] });
  useEffect(() => { if (busy) panel.current?.focus(); }, [busy]);
  return createPortal(<div className={`course-dialog-backdrop${drawer ? ' course-dialog-backdrop-drawer' : ''}`} style={theme} onClick={event => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <div aria-labelledby={titleId} aria-modal="true" className={`course-dialog${wide ? ' course-dialog-wide' : ''}${drawer ? ' course-dialog-drawer' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
        keepTabInside(event, panel.current);
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
