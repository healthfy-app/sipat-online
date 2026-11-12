import { CirclePlus, Puzzle } from 'lucide-react';
import type { Ref } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDuration, pluralize, statusLabels } from './courseFormat';
import { gameTypeLabel, type TrackItem } from './courseTrack';

export const editorPanel = 'relative z-[1] flex min-h-0 min-w-0 flex-col overflow-y-auto bg-card shadow-panel max-[1180px]:min-h-auto max-[1180px]:overflow-visible';

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
    <section aria-labelledby="ce-track-title" className={editorPanel}>
      <header className="flex items-center gap-3 border-b border-border p-4">
        <CourseThumb coverUrl={course.coverUrl} title={title} />
        <div className="grid min-w-0 gap-1">
          <h1 className="m-0 truncate text-sm font-semibold leading-snug focus:outline-none" ref={headingRef} tabIndex={-1}>
            {title || course.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={status === 'Published' ? 'default' : 'warning'}>{statusLabels[status]}</Badge>
            <span>{pluralize(course.videos.length, 'vídeo', 'vídeos')}</span>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="m-0 text-xs font-medium text-muted-foreground" id="ce-track-title">Trilha do curso</h2>
        <div className="flex gap-1.5">
          <Button aria-label="Gerenciar atividades" disabled={busy} onClick={onManageActivities} size="icon-sm" title="Atividades e perguntas" variant="outline">
            <Puzzle />
          </Button>
          <Button aria-label="Adicionar vídeo" disabled={busy} onClick={onAddVideo} size="icon-sm" title="Adicionar vídeo">＋</Button>
        </div>
      </div>

      {track.length === 0 ? (
        <div className="m-4 grid justify-items-start gap-3 rounded-md border border-dashed border-input p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="m-0">Este curso ainda não tem vídeos. Vincule um da biblioteca ou envie um novo.</p>
          <Button disabled={busy} onClick={onAddVideo} size="sm">Adicionar vídeo</Button>
        </div>
      ) : (
        <div className="grid gap-1 p-4">
          <div className="flex flex-col gap-0.5 rounded-md bg-accent px-3 py-2">
            <span className="text-base leading-normal">Conteúdo</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(totalMilliseconds)}{activityCount > 0 && ` · ${pluralize(activityCount, 'atividade', 'atividades')}`}
            </span>
          </div>
          <ol className="m-0 ml-5 mt-1 grid list-none gap-0.5 border-l border-border p-0 pl-3">
            {track.map((item) => {
              const selected = item.key === selectedKey;
              return (
                <li
                  className={cn(
                    'group/item relative grid min-h-8 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-1.5 rounded-sm pl-2 pr-1 transition-colors',
                    selected ? 'bg-accent' : 'hover:bg-background',
                  )}
                  key={item.key}
                >
                  <span aria-hidden="true" className={cn('grid place-items-center text-xs tabular-nums', item.kind === 'activity' ? 'text-[#b07d00]' : 'text-muted-foreground')}>
                    {item.kind === 'video' ? item.videoIndex + 1 : <Puzzle className="size-3.5" />}
                  </span>
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "m-0 min-h-0 cursor-pointer truncate border-0 bg-transparent py-1.5 text-left text-sm leading-snug text-foreground before:absolute before:inset-0 before:content-['']",
                      selected && 'font-medium',
                    )}
                    onClick={() => onSelect(item.key)}
                    title={item.kind === 'activity' ? `${gameTypeLabel(item.module)} · ${item.title}` : item.title}
                    type="button"
                  >
                    {item.title}
                  </button>
                  {item.kind === 'video' && <>
                    <span
                      className={cn(
                        'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
                        'group-hover/item:invisible group-focus-within/item:invisible max-[860px]:hidden',
                        selected && 'invisible',
                      )}
                    >
                      {formatDuration(item.video.durationMilliseconds)}
                    </span>
                    <span
                      className={cn(
                        'relative z-[1] col-start-3 row-start-1 hidden gap-0.5',
                        'group-hover/item:flex group-focus-within/item:flex max-[860px]:flex',
                        selected && 'flex',
                      )}
                    >
                      <MiniButton disabled={busy || item.videoIndex === 0} label={`Mover ${item.title} para cima`} onClick={() => onMoveVideo(item.videoIndex, -1)}>↑</MiniButton>
                      <MiniButton disabled={busy || item.videoIndex === course.videos.length - 1} label={`Mover ${item.title} para baixo`}
                        onClick={() => onMoveVideo(item.videoIndex, 1)}>↓</MiniButton>
                      <MiniButton danger disabled={busy} label={`Remover ${item.title} do curso`} onClick={() => onRemoveVideo(item.video.id)}>×</MiniButton>
                    </span>
                  </>}
                </li>
              );
            })}
          </ol>
          <button
            className="m-0 ml-5 inline-flex min-h-8 cursor-pointer items-center gap-2 justify-self-start border-0 bg-transparent py-0 pl-5 pr-2 text-sm text-primary hover:underline hover:underline-offset-4 disabled:opacity-50"
            disabled={busy}
            onClick={onAddVideo}
            type="button"
          >
            <CirclePlus className="size-4" /> Novo vídeo
          </button>
        </div>
      )}

      <footer className="mt-auto flex border-t border-border px-4 py-3">
        <Button disabled={busy} onClick={onDuplicate} size="sm" variant="outline">Duplicar curso</Button>
      </footer>
    </section>
  );
}

function MiniButton({ label, danger = false, disabled, onClick, children }: {
  label: string;
  danger?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        'm-0 grid size-6 min-h-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-sm text-muted-foreground',
        'hover:bg-card disabled:cursor-default disabled:opacity-35',
        danger ? 'hover:text-destructive' : 'hover:text-primary',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function CourseThumb({ coverUrl, title }: { coverUrl: string | null; title: string }) {
  if (coverUrl) return <img alt="" className="size-11 shrink-0 rounded-sm object-cover" src={coverUrl} />;
  const initials = title.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return (
    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-sm bg-[linear-gradient(140deg,var(--brand-primary),var(--learner-forest,#12332c))] text-sm font-bold text-white">
      {initials || 'S'}
    </span>
  );
}
