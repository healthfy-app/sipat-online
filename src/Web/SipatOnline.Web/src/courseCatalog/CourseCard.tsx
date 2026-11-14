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
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-[1.25rem] border border-[#dfe6e3] bg-card shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-[box-shadow,transform,border-color] duration-200 ease-out-soft has-[button[data-open]:focus-visible]:outline-2 has-[button[data-open]:focus-visible]:outline-offset-2 has-[button[data-open]:focus-visible]:outline-ring hover:-translate-y-1 hover:border-[#12332c] hover:shadow-[0_18px_34px_-18px_rgb(18_51_44/0.5)] motion-reduce:hover:translate-y-0">
      <div className="relative aspect-video overflow-hidden bg-[#12332c] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-1/3 after:bg-gradient-to-t after:from-[rgb(11_36_31/0.45)] after:to-transparent after:content-['']">
        <img
          alt=""
          className="block size-full object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
          decoding="async"
          loading="lazy"
          src={course.coverUrl ?? getCourseCover(course.title)}
        />
        <span
          className={published
            ? 'absolute left-3 top-3 z-10 rounded-full bg-[rgb(15_122_61/0.95)] px-2.5 py-0.5 text-[0.6875rem] font-bold text-white backdrop-blur-sm'
            : 'absolute left-3 top-3 z-10 rounded-full bg-[#ffd166] px-2.5 py-0.5 text-[0.6875rem] font-bold text-[#12332c] backdrop-blur-sm'}
        >
          {statusLabels[course.status]}
        </span>
      </div>

      <div className="grid flex-1 content-start gap-1.5 px-5 pb-3 pt-4">
        <div className="flex min-h-5 flex-wrap gap-1.5">
          {option && <Badge className="rounded-[0.3125rem] px-1.5 text-[0.6875rem]" variant="neutral">Opção {option}</Badge>}
          {course.gamificationEnabled && <Badge className="rounded-[0.3125rem] px-1.5 text-[0.6875rem]">Gamificação</Badge>}
        </div>
        <h3 className="m-0 min-h-[2.7em] text-[1.0625rem] font-extrabold leading-[1.3] tracking-[-0.01em] text-[#12332c]">
          {/* o botão cobre o card inteiro: um clique em qualquer lugar abre o curso */}
          <button
            aria-label={`Abrir assunto ${course.title}`}
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

      <footer className="mt-1 flex items-center justify-between gap-2 border-t border-[#dfe6e3] px-4 py-3">
        <span aria-hidden="true" className="whitespace-nowrap rounded-full bg-[#12332c] px-3.5 py-1.5 text-[0.8125rem] font-bold text-white transition-colors group-hover:bg-[#0f7a3d]">
          Abrir editor →
        </span>
        <div className="flex items-center">
        <Button
          aria-label={`Duplicar assunto ${course.title}`}
          className="relative z-10"
          disabled={busy}
          onClick={onDuplicate}
          size="icon-sm"
          title="Duplicar assunto"
          variant="ghost"
        >
          <Copy />
        </Button>
        <Button
          aria-label={`Excluir assunto ${course.title}`}
          className="relative z-10"
          disabled={busy}
          onClick={onDelete}
          size="icon-sm"
          title="Excluir assunto"
          variant="ghost"
        >
          <Trash2 />
        </Button>
        </div>
      </footer>
    </article>
  );
}
