import { ChevronRight, CirclePlus, Gamepad2, Puzzle } from 'lucide-react';
import { Fragment, useState, type Ref } from 'react';
import { isExtra, type PlatformCourse, type PlatformCourseStatus } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { durationLabel, extrasSuffix, formatDuration, houseVideos, pluralize, statusLabels } from './courseFormat';
import ExtraBadge from './ExtraBadge';
import { gameTypeLabel, type LessonGroup } from './courseTrack';
import InlineText from './InlineText';

export const editorPanel = 'relative z-[1] flex min-h-0 min-w-0 flex-col overflow-y-auto bg-card shadow-panel max-[1180px]:min-h-auto max-[1180px]:overflow-visible';

/** What cannot be changed in the editor: the names and cover, the grid of videos, the games and questions. */
export interface EditorLocks { details: boolean; grid: boolean; activities: boolean; plan?: string }
export const noLocks: EditorLocks = { details: false, grid: false, activities: false };

export interface OutlineActions {
  onSelect: (key: string) => void;
  onTitle: (title: string) => void;
  onAddLesson: () => void;
  onAddVideo: (lessonId: string) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onMoveLesson: (lessonId: string, offset: -1 | 1) => void;
  onRemoveLesson: (lessonId: string) => void;
  onRenameVideo: (videoId: string, title: string) => void;
  onMoveVideo: (videoId: string, offset: -1 | 1) => void;
  onRemoveVideo: (videoId: string) => void;
  onManageActivities: () => void;
  onAddActivity: (afterVideoCount: number) => void;
  onDuplicate: () => void;
}

export default function CourseOutlinePanel({
  course,
  status,
  title,
  headingRef,
  groups,
  selectedKey,
  busy,
  actions,
  week = false,
  locks = noLocks,
  onCover,
}: {
  course: PlatformCourse;
  status: PlatformCourseStatus;
  title: string;
  headingRef: Ref<HTMLHeadingElement>;
  groups: LessonGroup[];
  selectedKey: string | null;
  busy: boolean;
  actions: OutlineActions;
  /** The week of a SIPAT: no status to publish and nothing to duplicate, each título is a day. */
  week?: boolean;
  /** What the company's plan does not let it change here; the operation has no locks. */
  locks?: EditorLocks;
  /** Opens the cover of the training (a company's training has no Configurar step to change it in). */
  onCover?: () => void;
}) {
  const house = houseVideos(course.videos);
  const totalMilliseconds = house.reduce((total, video) => total + video.durationMilliseconds, 0);
  const activityCount = groups.reduce((total, group) => total + group.items.filter((item) => item.kind === 'activity').length, 0);
  const flatItems = groups.flatMap((group) => group.items);
  const flatVideoIds = groups.flatMap((group) => group.items.flatMap((item) => (item.kind === 'video' ? [item.video.id] : [])));
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (key: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const gridBusy = busy || locks.grid;
  const actBusy = busy || locks.activities;
  // one line saying what the plan leaves out, instead of a note on every disabled control
  const lockNote = locks.grid
    ? 'Neste plano o treinamento é só para visualizar.'
    : locks.activities ? 'Perguntas, atividades e jogos estão disponíveis no plano Diamante.' : '';
  return (
    <section aria-labelledby="ce-track-title" className={editorPanel}>
      <header className="flex items-center gap-3 border-b border-border p-4">
        {onCover && !locks.details
          ? <button aria-label="Trocar a capa do treinamento" className="m-0 min-h-0 shrink-0 cursor-pointer rounded-sm border-0 bg-transparent p-0 transition-opacity hover:opacity-80" onClick={onCover} title="Trocar a capa" type="button"><CourseThumb coverUrl={course.coverUrl} title={title} /></button>
          : <CourseThumb coverUrl={course.coverUrl} title={title} />}
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="m-0 text-sm font-semibold leading-snug focus:outline-none" ref={headingRef} tabIndex={-1}>
            <InlineText className="font-semibold" disabled={busy || locks.details} label="Renomear treinamento" onCommit={actions.onTitle} value={title || course.title} />
          </h1>
          <div className="flex flex-wrap items-center gap-2 px-1.5 text-xs text-muted-foreground">
            {week
              ? <Badge variant="default">Treinamento da empresa</Badge>
              : <Badge variant={status === 'Published' ? 'default' : 'warning'}>{statusLabels[status]}</Badge>}
            <span>{pluralize(house.length, 'vídeo', 'vídeos')}{extrasSuffix(course.videos.length - house.length)}</span>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="m-0 text-xs font-medium text-muted-foreground" id="ce-track-title">Vídeos do treinamento</h2>
        <div className="flex gap-1.5">
          <Button aria-label="Gerenciar atividades" disabled={actBusy} onClick={actions.onManageActivities} size="icon-sm" title="Atividades e perguntas" variant="outline">
            <Puzzle />
          </Button>
          <Button aria-label="Adicionar vídeo" disabled={gridBusy} onClick={() => actions.onAddVideo('')} size="icon-sm" title="Novo vídeo">＋</Button>
        </div>
      </div>

      {lockNote && <p className="m-0 border-b border-border bg-muted px-4 py-2 text-xs leading-snug text-muted-foreground" role="status">{lockNote}</p>}
      {flatItems.length === 0 ? (
        <div className="m-4 grid justify-items-start gap-3 rounded-md border border-dashed border-input p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="m-0">Este treinamento ainda não tem vídeos. Escolha os vídeos do dia na biblioteca.</p>
          <Button disabled={gridBusy} onClick={() => actions.onAddVideo('')} size="sm">Adicionar vídeo</Button>
        </div>
      ) : (
        <div className="grid gap-2 p-3">
          <p className="m-0 px-2 text-xs tabular-nums text-muted-foreground">
            {pluralize(groups.length, 'título', 'títulos')} · {formatDuration(totalMilliseconds)}{activityCount > 0 && ` · ${pluralize(activityCount, 'atividade', 'atividades')}`}
          </p>
          {groups.map((group, groupIndex) => {
            const groupVideos = group.items.flatMap((item) => (item.kind === 'video' && !isExtra(item.video) ? [item.video] : []));
            const groupMs = groupVideos.reduce((sum, video) => sum + video.durationMilliseconds, 0);
            const groupKey = group.id || String(groupIndex);
            const isCollapsed = collapsed.has(groupKey);
            return (
            <section aria-label={group.title} className="grid gap-0.5" key={groupKey}>
              <div className="group/title flex items-center gap-1 rounded-md bg-accent py-1.5 pl-1 pr-2">
                <button
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? `Mostrar vídeos de ${group.title}` : `Recolher vídeos de ${group.title}`}
                  className="relative m-0 grid size-6 min-h-0 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-primary hover:bg-card"
                  onClick={() => toggleGroup(groupKey)}
                  title={isCollapsed ? 'Mostrar vídeos' : 'Recolher'}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'text-[0.6875rem] font-bold tabular-nums transition-opacity',
                      'group-hover/title:opacity-0 group-focus-within/title:opacity-0 max-[860px]:opacity-0',
                      isCollapsed && 'opacity-0',
                    )}
                  >
                    {groupIndex + 1}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-0 m-auto size-4 opacity-0 transition-[opacity,rotate] duration-150',
                      'group-hover/title:opacity-100 group-focus-within/title:opacity-100 max-[860px]:opacity-100',
                      isCollapsed ? 'opacity-100' : 'rotate-90',
                    )}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <InlineText className="font-semibold" disabled={gridBusy || !group.id} label={`Nome do título ${groupIndex + 1}`}
                    onCommit={(value) => actions.onRenameLesson(group.id, value)} value={group.title} />
                  <span className="block px-1.5 text-xs tabular-nums text-muted-foreground">
                    {pluralize(groupVideos.length, 'vídeo', 'vídeos')} · {formatDuration(groupMs)}
                  </span>
                </div>
                {group.id && <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100 max-[860px]:opacity-100">
                  <MiniButton disabled={gridBusy || groupIndex === 0} label={`Mover ${group.title} para cima`} onClick={() => actions.onMoveLesson(group.id, -1)}>↑</MiniButton>
                  <MiniButton disabled={gridBusy || groupIndex === groups.length - 1} label={`Mover ${group.title} para baixo`} onClick={() => actions.onMoveLesson(group.id, 1)}>↓</MiniButton>
                  <MiniButton danger disabled={gridBusy || groups.length === 1} label={`Remover o título ${group.title}`} onClick={() => actions.onRemoveLesson(group.id)}>×</MiniButton>
                </span>}
              </div>
              {!isCollapsed && (
              <div className="ml-4 grid gap-0.5 border-l border-border pl-2">
                  <ol aria-label={`Vídeos de ${group.title}`} className="m-0 mt-1 grid list-none gap-0.5 p-0">
                    {group.items.map((item) => {
                      const selected = item.key === selectedKey;
                      const flatIndex = item.kind === 'video' ? flatVideoIds.indexOf(item.video.id) : -1;
                      return (
                        <Fragment key={item.key}>
                        <li
                          className={cn(
                            'group/item relative grid min-h-8 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-1 rounded-sm px-1 transition-colors',
                            selected ? 'bg-accent' : 'hover:bg-background',
                          )}
                        >
                          <span aria-hidden="true" className={cn('grid place-items-center text-xs tabular-nums', item.kind === 'activity' ? 'text-[#b07d00]' : 'text-muted-foreground')}>
                            {item.kind === 'video' ? item.videoIndex + 1 : <Puzzle className="size-3.5" />}
                          </span>
                          {item.kind === 'video' ? (
                            <div className={cn("min-w-0", isExtra(item.video) && "flex items-center gap-1.5")} onClick={() => actions.onSelect(item.key)} onFocus={() => actions.onSelect(item.key)} role="presentation">
                              <InlineText
                                className={selected ? 'font-medium' : undefined}
                                disabled={gridBusy}
                                label={`Título do vídeo ${item.videoIndex + 1}`}
                                onCommit={(value) => actions.onRenameVideo(item.video.id, value)}
                                value={item.title}
                              />
                              {isExtra(item.video) && <ExtraBadge />}
                            </div>
                          ) : (
                            <button
                              aria-pressed={selected}
                              className={cn('m-0 min-h-0 cursor-pointer truncate border-0 bg-transparent px-1.5 py-1.5 text-left text-sm leading-snug text-foreground', selected && 'font-medium')}
                              onClick={() => actions.onSelect(item.key)}
                              title={`${gameTypeLabel(item.module)} · ${item.title}`}
                              type="button"
                            >
                              {item.title}
                            </button>
                          )}
                          {item.kind === 'video' && <>
                            <span
                              className={cn(
                                'whitespace-nowrap text-xs tabular-nums text-muted-foreground',
                                'group-hover/item:invisible group-focus-within/item:invisible max-[860px]:hidden',
                                selected && 'invisible',
                              )}
                            >
                              {durationLabel(item.video)}
                            </span>
                            <span
                              className={cn(
                                'relative z-[1] col-start-3 row-start-1 hidden gap-0.5',
                                'group-hover/item:flex group-focus-within/item:flex max-[860px]:flex',
                                selected && 'flex',
                              )}
                            >
                              <MiniButton disabled={gridBusy || flatIndex === 0} label={`Mover ${item.title} para cima`} onClick={() => actions.onMoveVideo(item.video.id, -1)}>↑</MiniButton>
                              <MiniButton disabled={gridBusy || flatIndex === flatVideoIds.length - 1} label={`Mover ${item.title} para baixo`} onClick={() => actions.onMoveVideo(item.video.id, 1)}>↓</MiniButton>
                              <MiniButton danger disabled={gridBusy} label={`Remover ${item.title} do treinamento`} onClick={() => actions.onRemoveVideo(item.video.id)}>×</MiniButton>
                            </span>
                          </>}
                        </li>
                        {item.kind === 'video' && (
                          <li className="min-h-0">
                            <button
                              className="m-0 ml-6 inline-flex min-h-6 cursor-pointer items-center gap-1.5 border-0 border-l border-dashed border-border bg-transparent py-0 pl-2 pr-2 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
                              disabled={actBusy}
                              onClick={() => actions.onAddActivity(item.videoIndex + 1)}
                              type="button"
                            >
                              <Gamepad2 className="size-3.5" /> Atividade depois deste vídeo
                            </button>
                          </li>
                        )}
                        </Fragment>
                      );
                    })}
                  </ol>
              <button
                className="m-0 inline-flex min-h-8 cursor-pointer items-center gap-2 justify-self-start border-0 bg-transparent py-0 pl-1 pr-2 text-sm text-primary hover:underline hover:underline-offset-4 disabled:opacity-50"
                disabled={gridBusy}
                onClick={() => actions.onAddVideo(group.id)}
                type="button"
              >
                <CirclePlus className="size-4" /> Novo vídeo
              </button>
              </div>
              )}
            </section>
            );
          })}
          <Button className="justify-self-start" disabled={gridBusy} onClick={actions.onAddLesson} size="sm" variant="outline">
            <CirclePlus /> Novo título
          </Button>
        </div>
      )}

      {!week && <footer className="mt-auto flex border-t border-border px-4 py-3">
        <Button disabled={busy} onClick={actions.onDuplicate} size="sm" variant="outline">Duplicar treinamento</Button>
      </footer>}
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
