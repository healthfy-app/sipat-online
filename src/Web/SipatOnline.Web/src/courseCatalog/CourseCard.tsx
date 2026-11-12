import type { PlatformCourse } from '../api';
import { getCourseCover } from '../courseCover';
import { formatDuration, getCourseOption, pluralize, statusLabels } from '../courseEditor/courseFormat';

export default function CourseCard({
  course,
  busy,
  onOpen,
  onDuplicate,
}: {
  course: PlatformCourse;
  busy: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
}) {
  const totalMilliseconds = course.videos.reduce((sum, video) => sum + video.durationMilliseconds, 0);
  const option = getCourseOption(course.description);
  const status = course.status.toLowerCase();

  return (
    <article className="cat-card">
      <div className="cat-card-media">
        <img alt="" decoding="async" loading="lazy" src={course.coverUrl ?? getCourseCover(course.title)} />
        <span className={`cat-status cat-status-${status}`}>{statusLabels[course.status]}</span>
      </div>
      <div className="cat-card-body">
        <div className="cat-card-tags">
          {option && <span className="cat-tag">Opção {option}</span>}
          {course.gamificationEnabled && <span className="cat-tag cat-tag-game">Gamificação</span>}
        </div>
        <h3 className="cat-card-title">
          {/* o botão cobre o card inteiro: um clique em qualquer lugar abre o curso */}
          <button aria-label={`Abrir curso ${course.title}`} className="cat-card-open" onClick={onOpen} type="button">
            {course.title}
          </button>
        </h3>
        <p className="cat-card-meta">
          {pluralize(course.videos.length, 'vídeo', 'vídeos')}
          {course.videos.length > 0 && ` · ${formatDuration(totalMilliseconds)}`}
        </p>
      </div>
      <footer className="cat-card-footer">
        <span aria-hidden="true" className="cat-card-cta">Abrir editor →</span>
        <button aria-label={`Duplicar curso ${course.title}`} className="cat-card-duplicate" disabled={busy}
          onClick={onDuplicate} title="Duplicar curso" type="button">
          <DuplicateIcon /> Duplicar
        </button>
      </footer>
    </article>
  );
}

function DuplicateIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 16 16" width="14">
      <rect height="9" rx="2" stroke="currentColor" strokeWidth="1.5" width="9" x="5.25" y="5.25" />
      <path d="M10.75 3.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v6.25a1.5 1.5 0 0 0 1.5 1.5h.5"
        stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
