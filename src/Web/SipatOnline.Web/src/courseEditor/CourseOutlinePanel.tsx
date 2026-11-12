import type { Ref } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '../api';
import { formatDuration, pluralize, statusLabels } from './courseFormat';
import { gameTypeLabel, type TrackItem } from './courseTrack';

export default function CourseOutlinePanel({
  course,
  status,
  title,
  headingRef,
  track,
  selectedKey,
  busy,
  onSelect,
  onAddVideo,
  onManageActivities,
  onMoveVideo,
  onRemoveVideo,
  onDuplicate,
}: {
  course: PlatformCourse;
  status: PlatformCourseStatus;
  title: string;
  headingRef: Ref<HTMLHeadingElement>;
  track: TrackItem[];
  selectedKey: string | null;
  busy: boolean;
  onSelect: (key: string) => void;
  onAddVideo: () => void;
  onManageActivities: () => void;
  onMoveVideo: (videoIndex: number, offset: -1 | 1) => void;
  onRemoveVideo: (videoId: string) => void;
  onDuplicate: () => void;
}) {
  const totalMilliseconds = course.videos.reduce((total, video) => total + video.durationMilliseconds, 0);
  const activityCount = track.length - course.videos.length;

  return (
    <section aria-labelledby="ce-track-title" className="ce-panel ce-outline">
      <header className="ce-course-card">
        <CourseThumb coverUrl={course.coverUrl} title={title} />
        <div className="ce-course-card-text">
          <h1 ref={headingRef} tabIndex={-1}>{title || course.title}</h1>
          <div className="ce-course-meta">
            <span className={`ce-pill ce-pill-${status.toLowerCase()}`}>{statusLabels[status]}</span>
            <span>{pluralize(course.videos.length, 'vídeo', 'vídeos')}</span>
          </div>
        </div>
      </header>

      <div className="ce-panel-bar">
        <h2 id="ce-track-title">Trilha do curso</h2>
        <div className="ce-panel-bar-actions">
          <button aria-label="Gerenciar atividades" className="ce-icon-btn" disabled={busy}
            onClick={onManageActivities} title="Atividades e perguntas" type="button">
            <ActivityIcon />
          </button>
          <button aria-label="Adicionar vídeo" className="ce-icon-btn is-solid" disabled={busy}
            onClick={onAddVideo} title="Adicionar vídeo" type="button">＋</button>
        </div>
      </div>

      {track.length === 0 ? (
        <div className="ce-outline-empty">
          <p>Este curso ainda não tem vídeos. Vincule um da biblioteca ou envie um novo.</p>
          <button className="ce-btn ce-btn-primary" disabled={busy} onClick={onAddVideo} type="button">Adicionar vídeo</button>
        </div>
      ) : (
        <div className="ce-track-wrap">
          <div className="ce-track-group">
            <span className="ce-track-group-title">Conteúdo</span>
            <span className="ce-track-group-meta">
              {formatDuration(totalMilliseconds)}{activityCount > 0 && ` · ${pluralize(activityCount, 'atividade', 'atividades')}`}
            </span>
          </div>
          <ol className="ce-track">
            {track.map((item) => {
              const selected = item.key === selectedKey;
              return (
                <li className={`ce-track-item is-${item.kind}${selected ? ' is-selected' : ''}`} key={item.key}>
                  <span aria-hidden="true" className="ce-track-marker">
                    {item.kind === 'video' ? item.videoIndex + 1 : <ActivityIcon />}
                  </span>
                  <button aria-pressed={selected} className="ce-track-select" onClick={() => onSelect(item.key)}
                    title={item.kind === 'activity' ? `${gameTypeLabel(item.module)} · ${item.title}` : item.title} type="button">
                    {item.title}
                  </button>
                  {item.kind === 'video' && (
                    <span className="ce-track-meta">{formatDuration(item.video.durationMilliseconds)}</span>
                  )}
                  {item.kind === 'video' && (
                    <span className="ce-track-actions">
                      <button aria-label={`Mover ${item.title} para cima`} className="ce-mini-btn"
                        disabled={busy || item.videoIndex === 0} onClick={() => onMoveVideo(item.videoIndex, -1)} type="button">↑</button>
                      <button aria-label={`Mover ${item.title} para baixo`} className="ce-mini-btn"
                        disabled={busy || item.videoIndex === course.videos.length - 1}
                        onClick={() => onMoveVideo(item.videoIndex, 1)} type="button">↓</button>
                      <button aria-label={`Remover ${item.title} do curso`} className="ce-mini-btn is-danger"
                        disabled={busy} onClick={() => onRemoveVideo(item.video.id)} type="button">×</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <button className="ce-track-add" disabled={busy} onClick={onAddVideo} type="button">
            <span aria-hidden="true">⊕</span> Novo vídeo
          </button>
        </div>
      )}

      <footer className="ce-panel-footer">
        <button className="ce-btn" disabled={busy} onClick={onDuplicate} type="button">Duplicar curso</button>
      </footer>
    </section>
  );
}

function CourseThumb({ coverUrl, title }: { coverUrl: string | null; title: string }) {
  if (coverUrl) return <img alt="" className="ce-course-thumb" src={coverUrl} />;
  const initials = title.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className="ce-course-thumb is-placeholder">{initials || 'S'}</span>;
}

export function ActivityIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
      <rect height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" width="5.5" x="1.5" y="1.5" />
      <rect height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" width="5.5" x="9" y="1.5" />
      <rect height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" width="5.5" x="1.5" y="9" />
      <circle cx="11.75" cy="11.75" r="2.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
