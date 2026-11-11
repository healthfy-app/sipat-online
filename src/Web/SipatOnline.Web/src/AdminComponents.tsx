import type { ReactNode } from 'react';
import CourseDialog from './CourseDialog';

export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading admin-page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted-copy">{description}</p>}
        {meta && <div className="admin-page-meta">{meta}</div>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>
  );
}

export function DataTable({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-table-scroll">
      <table aria-label={label} className={`data-table admin-data-table ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

export function StatusChip({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'neutral' | 'danger';
}) {
  return <span className={`admin-status-chip admin-status-${variant}`}>{children}</span>;
}

export function FilterBar({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-label={label} className={`admin-filter-bar ${className}`.trim()} role="group">
      {children}
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  return (
    <CourseDialog busy={busy} drawer onClose={onClose} title={title}>
      {children}
    </CourseDialog>
  );
}

export function CourseCard({
  title,
  description,
  coverUrl,
  statusLabel,
  statusVariant,
  optionLabel,
  videoCount,
  duration,
  gamificationEnabled,
  onOpen,
  onDuplicate,
}: {
  title: string;
  description?: string;
  coverUrl: string;
  statusLabel: string;
  statusVariant: 'success' | 'neutral';
  optionLabel?: string;
  videoCount: number;
  duration?: string;
  gamificationEnabled: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  return (
    <article className="admin-course-card">
      <img alt="" className="admin-course-cover" decoding="async" loading="lazy" src={coverUrl} />
      <div className="admin-course-card-content">
        <div className="admin-course-badges">
          <StatusChip variant={statusVariant}>{statusLabel}</StatusChip>
          {optionLabel && <StatusChip>Opção {optionLabel}</StatusChip>}
          {gamificationEnabled && <StatusChip>Gamificação</StatusChip>}
        </div>
        <h3>{title}</h3>
        {description && <p className="admin-course-description">{description}</p>}
        <p className="admin-course-meta">
          {videoCount} {videoCount === 1 ? 'vídeo' : 'vídeos'}
          {duration ? ` · ${duration}` : ''}
        </p>
        <div className="admin-course-actions">
          <button aria-label={`Abrir curso ${title}`} className="button button-primary" onClick={onOpen} type="button">
            Abrir
          </button>
          <button aria-label={`Duplicar curso ${title}`} className="button button-secondary" onClick={onDuplicate} type="button">
            Duplicar
          </button>
        </div>
      </div>
    </article>
  );
}