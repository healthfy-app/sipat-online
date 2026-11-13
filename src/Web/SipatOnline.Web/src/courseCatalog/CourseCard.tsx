import { Copy, Trash2 } from 'lucide-react';
import type { PlatformCourse } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCourseCover } from '@/courseCover';
import { formatDuration, getCourseOption, pluralize, statusLabels } from '@/courseEditor/courseFormat';

export default function CourseCard({
  course,
  busy,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  course: PlatformCourse;
  busy: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const totalMilliseconds = course.videos.reduce((sum, video) => sum + video.durationMilliseconds, 0);
  const option = getCourseOption(course.description);
  const published = course.status === 'Published';

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-card transition-[box-shadow,transform] duration-200 ease-out-soft has-[button[data-open]:focus-visible]:outline-2 has-[button[data-open]:focus-visible]:outline-offset-2 has-[button[data-open]:focus-visible]:outline-ring hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:hover:translate-y-0">
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img
          alt=""
          className="block size-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          decoding="async"
          loading="lazy"
          src={course.coverUrl ?? getCourseCover(course.title)}
        />
        <span
          className={published
            ? 'absolute left-2.5 top-2.5 rounded-full bg-[rgb(14_74_52/0.88)] px-2 py-0.5 text-[0.6875rem] font-semibold text-white backdrop-blur-sm'
            : 'absolute left-2.5 top-2.5 rounded-full bg-[rgb(255_245_217/0.94)] px-2 py-0.5 text-[0.6875rem] font-semibold text-warning backdrop-blur-sm'}
        >
          {statusLabels[course.status]}
        </span>
      </div>

      <div className="grid flex-1 content-start gap-1.5 px-4 pb-2 pt-3.5">
        <div className="flex min-h-5 flex-wrap gap-1.5">
          {option && <Badge className="rounded-[0.3125rem] px-1.5 text-[0.6875rem]" variant="neutral">Opção {option}</Badge>}
          {course.gamificationEnabled && <Badge className="rounded-[0.3125rem] px-1.5 text-[0.6875rem]">Gamificação</Badge>}
        </div>
        <h3 className="m-0 min-h-[2.7em] text-[0.9375rem] font-semibold leading-[1.35]">
          {/* o botão cobre o card inteiro: um clique em qualquer lugar abre o curso */}
          <button
            aria-label={`Abrir tema ${course.title}`}
            className="m-0 line-clamp-2 min-h-0 w-full cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] text-inherit outline-none after:absolute after:inset-0 after:content-['']"
            data-open=""
            onClick={onOpen}
            type="button"
          >
            {course.title}
          </button>
        </h3>
        <p className="m-0 text-[0.8125rem] tabular-nums text-muted-foreground">
          {pluralize(course.videos.length, 'vídeo', 'vídeos')}
          {course.videos.length > 0 && ` · ${formatDuration(totalMilliseconds)}`}
        </p>
      </div>

      <footer className="mt-1 flex items-center justify-between gap-2 border-t border-border py-2 pl-4 pr-2">
        <span aria-hidden="true" className="text-[0.8125rem] font-semibold text-muted-foreground transition-colors group-hover:text-primary">
          Abrir editor →
        </span>
        <div className="flex items-center">
        <Button
          aria-label={`Duplicar tema ${course.title}`}
          className="relative z-10"
          disabled={busy}
          onClick={onDuplicate}
          size="sm"
          title="Duplicar tema"
          variant="ghost"
        >
          <Copy /> Duplicar
        </Button>
        <Button
          aria-label={`Excluir tema ${course.title}`}
          className="relative z-10"
          disabled={busy}
          onClick={onDelete}
          size="icon-sm"
          title="Excluir tema"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        </div>
      </footer>
    </article>
  );
}
