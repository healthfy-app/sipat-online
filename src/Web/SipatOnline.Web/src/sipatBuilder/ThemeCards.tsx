import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, CalendarRange, ChevronDown, CirclePlus, CloudUpload, ExternalLink, Film, Gamepad2, GripVertical, Layers, Pencil, Play, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isExtra, videoProvider } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ExternalVideoFrame } from '@/ExternalVideoPreview';
import VideoPreview from '@/VideoPreview';
import { Input, NativeSelect } from '@/components/ui/input';
import { extrasSuffix } from '@/courseEditor/courseFormat';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { cn } from '@/lib/utils';
import {
  formatClock, formatSpan, maxVideoRows, normalize, subjectColor, themeLabel, titleColor,
  type Catalog, type CatalogVideo, type Subject, type TrainingTitle, type TrayTraining,
} from './model';

export const dropId = (dayIndex: number) => `theme-day-${dayIndex}`;

function Cover({ subject, className }: { subject: Subject; className?: string }) {
  if (subject.coverUrl) return <img alt="" className={cn('shrink-0 rounded-md object-cover', className)} src={subject.coverUrl} />;
  const initials = subject.title.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-md text-xs font-bold text-white', className)} style={{ backgroundColor: subjectColor(subject.title) }}>{initials || 'T'}</span>;
}

const summary = (subject: Subject) => {
  const extras = subject.extraCount ?? 0;
  const house = subject.videoIds.length - extras;
  return `${house} ${house === 1 ? 'vídeo' : 'vídeos'} · ${formatSpan(subject.totalMs) || '0:00'}${extrasSuffix(extras)}`;
};

const videoTime = (video: CatalogVideo) => (isExtra(video) && video.durationMs <= 0 ? videoProvider(video) : formatClock(video.durationMs));

/**
 * What goes onto the days. A plan that personalizes the grid sees the complete list of videos, narrowed by an assunto
 * (a filter); Bronze sees the ready trainings, each one a whole day.
 */
export function ThemeTray({ subjects, videos = [], canCustomizeGrid = false, canEditThemes = false, trainings = [], usedIn, onUseTraining, trainingId = '', onTraining }: {
  subjects: Subject[]; videos?: CatalogVideo[]; canCustomizeGrid?: boolean; canEditThemes?: boolean;
  /** The trainings of Conteúdo: picking one puts its Títulos and their videos at the start of the list. */
  trainings?: TrayTraining[];
  /** Where each video already is, as "Dia 2", so the operator sees what is placed. */
  usedIn?: Map<string, string>;
  /** Lays the whole training on the days, Título 1 on day 1 and so on. */
  onUseTraining?: (training: TrayTraining) => void;
  /** The picked training (empty for none); the board keeps it so the empty days can offer its next Título. */
  trainingId?: string;
  onTraining?: (trainingId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  // the video being watched from its card, before placing it on a day
  const [playing, setPlaying] = useState<CatalogVideo | null>(null);
  // personalized grid: one complete list of videos, narrowed by an assunto
  const current = canCustomizeGrid ? 'videos' : 'subjects';
  const shownSubjects = useMemo(() => subjects.filter(subject => normalize(subject.title).includes(normalize(query))), [subjects, query]);
  const filterIds = subjects.find(item => item.id === filter)?.videoIds;
  const shownVideos = useMemo(() => videos.filter(video => normalize(video.title).includes(normalize(query)) && (!filterIds || filterIds.includes(video.id))), [videos, query, filterIds]);
  // a picked training leads the same list: each Título, then its videos; the rest of the library follows
  const training = canCustomizeGrid ? trainings.find(item => item.id === trainingId) : undefined;
  const shownById = useMemo(() => new Map(shownVideos.map(video => [video.id, video])), [shownVideos]);
  const inTraining = useMemo(() => new Set(training?.titles.flatMap(title => title.videoIds) ?? []), [training]);
  const looseVideos = training ? shownVideos.filter(video => !inTraining.has(video.id)) : shownVideos;
  const narrowed = query.trim() !== '' || filter !== '';
  const groups = (training?.titles ?? [])
    .map(title => ({ title, videos: title.videoIds.flatMap(id => shownById.get(id) ?? []) }))
    .filter(group => !narrowed || group.videos.length > 0);
  const empty = groups.length === 0 && looseVideos.length === 0;

  return <section aria-label={current === 'videos' ? 'Biblioteca de vídeos' : 'Assuntos do acervo'} className="builder-tray ops-card grid gap-3 p-4 max-[760px]:hidden">
    <div className="flex flex-wrap items-center gap-2">
      {canCustomizeGrid
        ? <>
          <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Film aria-hidden="true" className="size-4" /> Lista completa
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{shownVideos.length}{training && ` · ${plural(groups.length, 'título', 'títulos')}`}</span></h2>
          {trainings.length > 0 && <span className="inline-flex items-center gap-1.5">
            {/* a pill that says what it is: "Treinamento:" then the name, whole on hover, with its own way out */}
            <label className={cn('relative m-0 inline-flex h-9 max-w-96 items-center rounded-full border pl-3 text-sm shadow-none transition-colors',
              training ? 'border-primary bg-accent text-primary' : 'border-input bg-background text-foreground hover:border-primary/60')} title={training?.title}>
              <span className={cn('shrink-0 font-medium', training ? 'text-primary/75' : 'text-muted-foreground')}>Treinamento:</span>
              <select aria-label="Treinamento" className={cn('m-0 h-full min-h-0 min-w-0 flex-1 cursor-pointer appearance-none truncate rounded-none border-0 bg-transparent py-0 pr-9 pl-1.5 text-sm shadow-none outline-none',
                training ? 'font-bold text-primary' : 'text-foreground')}
                onChange={event => onTraining?.(event.target.value)} value={training?.id ?? ''}>
                <option value="">escolher…</option>
                {/* two trainings can share a name: their size tells them apart */}
                {trainings.map(item => <option key={item.id} value={item.id}>{item.title} · {plural(item.titles.length, 'título', 'títulos')} · {plural(item.titles.reduce((sum, title) => sum + title.videoIds.length, 0), 'vídeo', 'vídeos')}</option>)}
              </select>
              {training
                ? <button aria-label="Tirar o treinamento da lista" className="absolute right-1 m-0 grid size-7 min-h-0 cursor-pointer place-items-center rounded-full border-0 bg-card p-0 text-primary hover:bg-background"
                  onClick={event => { event.preventDefault(); onTraining?.(''); }} type="button"><X className="size-3.5" /></button>
                : <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-4 text-muted-foreground" />}
            </label>
            {training && onUseTraining && <Button onClick={() => onUseTraining(training)} size="sm" title="Título 1 no dia 1, título 2 no dia 2…" variant="outline"><CalendarRange /> Usar como dias</Button>}
          </span>}
          <NativeSelect aria-label="Filtrar por assunto" className="h-9 w-auto max-w-64" onChange={event => setFilter(event.target.value)} value={filter}>
            <option value="">Filtrar por assunto</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{item.title} ({item.videoIds.length})</option>)}
          </NativeSelect>
        </>
        : <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Layers aria-hidden="true" className="size-4" /> Assuntos do acervo</h2>}
      <span className="text-sm text-muted-foreground max-[640px]:hidden">
        · {current !== 'videos' ? 'arraste para um dia e ele traz todos os vídeos e jogos' : training ? 'arraste um título ou um vídeo para um dia' : 'arraste um vídeo para um dia'}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* personalized grid: sending videos and tagging their assuntos both live in the library, so one link */}
        {canEditThemes && (canCustomizeGrid
          ? <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/videos" rel="noreferrer" target="_blank" title="Enviar vídeos e marcar os assuntos deles">
            <CloudUpload aria-hidden="true" className="size-4" /> Gerenciar biblioteca
          </a>
          : <>
            <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/videos" rel="noreferrer" target="_blank">
              <CloudUpload aria-hidden="true" className="size-4" /> Enviar vídeos
            </a>
            <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/courses" rel="noreferrer" target="_blank">
              <Pencil aria-hidden="true" className="size-4" /> Editar assuntos
            </a>
          </>)}
        <label className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={current === 'videos' ? 'Buscar vídeo' : 'Buscar assunto'} className="h-9 w-56 pl-8 max-[640px]:w-full" onChange={event => setQuery(event.target.value)}
            placeholder={current === 'videos' ? 'Buscar vídeo' : 'Buscar assunto'} value={query} />
        </label>
      </div>
    </div>
    {current === 'videos'
      ? empty
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{videos.length === 0 ? 'A biblioteca ainda não tem vídeos prontos. Envie em Biblioteca de vídeos.' : 'Nenhum vídeo encontrado.'}</p>
        : <ul className="m-0 flex list-none items-end gap-2 overflow-x-auto p-0 pb-1">
          {groups.map((group, index) => <TitleGroup index={index} key={group.title.id} onPlay={setPlaying} title={group.title} usedIn={usedIn} videos={group.videos} />)}
          {/* after the training's Títulos, the rest of the library the company can use (videos private to other companies never come) */}
          {groups.length > 0 && looseVideos.length > 0 && <li aria-hidden="true" className="ml-1 grid shrink-0 self-stretch place-content-center border-l border-dashed border-border pr-1 pl-3 text-[0.6875rem] leading-tight font-bold tracking-[0.06em] text-muted-foreground uppercase">
            <span>Biblioteca</span><span>de vídeos</span><span className="font-semibold tracking-normal tabular-nums normal-case">{looseVideos.length}</span>
          </li>}
          {looseVideos.map(video => <li className="shrink-0" key={video.id}><VideoCard onPlay={setPlaying} place={usedIn?.get(video.id)} video={video} /></li>)}
        </ul>
      : shownSubjects.length === 0
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{subjects.length === 0 ? 'Ainda não há assuntos no acervo. Crie em Conteúdo.' : 'Nenhum assunto encontrado.'}</p>
        : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shownSubjects.map(subject => <li className="shrink-0" key={subject.id}><TrayCard subject={subject} /></li>)}</ul>}
    {playing?.source && <Dialog description={<>{videoTime(playing)}{usedIn?.get(playing.id) && <> · já está no {usedIn.get(playing.id)}</>}</>} onClose={() => setPlaying(null)} size="lg" title={playing.title}>
      <div className="aspect-video overflow-hidden rounded-xl bg-[#0b1f19] [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
        {isExtra(playing.source)
          ? <ExternalVideoFrame title={playing.title} video={playing.source} />
          : <VideoPreview preload="metadata" src={playing.source.fileUrl} title={playing.title} />}
      </div>
    </Dialog>}
  </section>;
}

function TrayCard({ subject }: { subject: Subject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `theme:${subject.id}`, data: { subject } });
  return <div className={cn('flex w-60 items-center gap-2.5 rounded-[0.875rem] border border-border bg-card p-2 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-card motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o assunto ${subject.title}`} className="grid size-7 min-h-0 shrink-0 cursor-grab touch-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    <Cover className="size-10" subject={subject} />
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="truncate text-[0.8125rem] leading-tight" title={themeLabel(subject)}>{subject.title}</strong>
      <span className="text-xs text-muted-foreground">{subject.option ? `${subject.option} · ` : ''}{summary(subject)}</span>
    </div>
  </div>;
}

function VideoCard({ video, place, dragId = `video:${video.id}`, onPlay }: { video: CatalogVideo; place?: string; dragId?: string; onPlay?: (video: CatalogVideo) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { video } });
  return <div className={cn('flex w-60 items-center gap-2 rounded-[0.875rem] border border-border bg-card p-2 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-card motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o vídeo ${video.title}`} className="grid size-7 min-h-0 shrink-0 cursor-grab touch-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    {/* the dark square plays the video; the grip beside it is what drags */}
    {onPlay && video.source
      ? <button aria-label={`Assistir ${video.title}`} className="group/play relative m-0 grid size-10 min-h-0 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-[#0b1f19] p-0 text-white/85 transition-colors hover:bg-primary"
        onClick={() => onPlay(video)} title="Assistir" type="button">
        <Film aria-hidden="true" className="size-4 transition-opacity group-hover/play:opacity-0" />
        <Play aria-hidden="true" className="absolute size-4 fill-current opacity-0 transition-opacity group-hover/play:opacity-100" />
      </button>
      : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-[#0b1f19] text-white/85"><Film className="size-4" /></span>}
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={video.title}>{video.title}</strong>
      <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
        {videoTime(video)}{isExtra(video) && <> · <ExtraBadge className="align-middle" /></>}
        {place && <span className="rounded-full bg-accent px-1.5 py-px text-[0.625rem] font-bold text-primary" title={`Já está no ${place}`}>{place}</span>}
      </span>
    </div>
  </div>;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * What rides under the pointer while dragging: the same card, lifted (a little bigger, tilted, with a deep shadow), so
 * the operator sees what is being carried the whole way to the day.
 */
export function DragPreview({ data }: { data: { title?: TrainingTitle; video?: CatalogVideo; subject?: Subject } }) {
  const lifted = 'flex w-60 rotate-[-2deg] scale-[1.03] cursor-grabbing items-center gap-2 rounded-[0.875rem] border p-2 shadow-overlay motion-reduce:rotate-0 motion-reduce:scale-100';
  if (data.title) return <div className={cn(lifted, 'border-primary bg-accent')}>
    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Layers aria-hidden="true" className="size-4" /></span>
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight text-primary">{data.title.title}</strong>
      <span className="text-xs text-muted-foreground">{plural(data.title.videoIds.length, 'vídeo', 'vídeos')}</span>
    </div>
  </div>;
  if (data.video) return <div className={cn(lifted, 'border-primary bg-card')}>
    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-[#0b1f19] text-white/85"><Film aria-hidden="true" className="size-4" /></span>
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight">{data.video.title}</strong>
      <span className="text-xs tabular-nums text-muted-foreground">{videoTime(data.video)}</span>
    </div>
  </div>;
  if (data.subject) return <div className={cn(lifted, 'border-primary bg-card')}>
    <Cover className="size-10" subject={data.subject} />
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="truncate text-[0.8125rem] leading-tight">{data.subject.title}</strong>
      <span className="text-xs text-muted-foreground">{summary(data.subject)}</span>
    </div>
  </div>;
  return null;
}

/**
 * A Título of the picked training as its own block: a header in the Título's color (its number, name, size; the
 * handle that drags the whole Título onto a day), and under it its videos on a ground tinted the same color.
 * Neighbouring Títulos never share a color, so where one ends and the next begins reads at a glance.
 */
function TitleGroup({ title, videos, index, usedIn, onPlay }: { title: TrainingTitle; videos: CatalogVideo[]; index: number; usedIn?: Map<string, string>; onPlay?: (video: CatalogVideo) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `title:${title.id}`, data: { title }, disabled: title.videoIds.length === 0 });
  const totalMs = videos.filter(video => !isExtra(video)).reduce((sum, video) => sum + video.durationMs, 0);
  const color = titleColor(index);
  return <li aria-label={`${title.title}, ${plural(title.videoIds.length, 'vídeo', 'vídeos')}`}
    className={cn('shrink-0 overflow-hidden rounded-2xl border-2 bg-card shadow-card transition-opacity', isDragging && 'opacity-50')}
    ref={setNodeRef} style={{ borderColor: color }}>
    <button aria-label={`Arrastar o título ${title.title} com todos os vídeos`}
      className="m-0 flex min-h-0 w-full cursor-grab touch-none items-center gap-2 rounded-none border-0 px-3 py-1.5 text-left text-white shadow-none active:cursor-grabbing disabled:cursor-default"
      disabled={title.videoIds.length === 0} style={{ backgroundColor: color }} title="Arraste para um dia: leva todos os vídeos deste título" type="button" {...attributes} {...listeners}>
      <GripVertical aria-hidden="true" className="size-4 shrink-0 opacity-80" />
      <span className="shrink-0 rounded-full bg-white/20 px-2 py-px text-[0.625rem] font-extrabold tracking-[0.08em] uppercase">Título {index + 1}</span>
      <strong className="min-w-0 truncate text-sm leading-tight">{title.title}</strong>
      <span className="ml-auto shrink-0 pl-2 text-xs tabular-nums opacity-85">{plural(title.videoIds.length, 'vídeo', 'vídeos')}{totalMs > 0 && ` · ${formatClock(totalMs)}`}</span>
    </button>
    {videos.length === 0
      ? <p className="m-0 w-60 px-3 py-4 text-xs text-muted-foreground">Sem vídeos prontos neste título.</p>
      : <ul className="m-0 flex list-none gap-2 p-2" style={{ backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)` }}>
        {videos.map(video => <li className="shrink-0" key={video.id}><VideoCard dragId={`video:${title.id}:${video.id}`} onPlay={onPlay} place={usedIn?.get(video.id)} video={video} /></li>)}
      </ul>}
  </li>;
}

/**
 * One day, whole: the subject dropped on it (a label and a shortcut), its videos and the games that came with the
 * subject. With a plan that personalizes the grid the videos are the operator's: videos are dropped or picked one
 * by one, reordered and removed right here.
 */
export function DayBox({ dayIndex, subject, themes, catalog, videoIds, gameIds, onChoose, onClear, onVideos, canEditThemes = true, canCustomizeGrid = false, suggestion }: {
  dayIndex: number; subject: Subject | undefined; themes: Subject[]; catalog: Catalog; videoIds: string[]; gameIds: string[];
  onChoose: (title: string) => void; onClear: () => void; canEditThemes?: boolean;
  canCustomizeGrid?: boolean;
  /** The new list of videos of the day; only with canCustomizeGrid. */
  onVideos?: (videoIds: string[]) => void;
  /** The next Título of the picked training not on any day yet, offered on an empty day as one click. */
  suggestion?: { title: TrainingTitle; onApply: () => void };
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(dayIndex) });
  const { active } = useDndContext();
  const editable = canCustomizeGrid && !!onVideos;
  const full = videoIds.length >= maxVideoRows;
  const empty = !subject && videoIds.length === 0;
  // while something is dragged every day shows it can take it; the one under the pointer says what the drop will do
  const dragged = active?.data.current as { title?: TrainingTitle; video?: CatalogVideo; subject?: Subject } | undefined;
  const preview = !isOver || !dragged ? '' : dragged.title
    ? videoIds.length > 0 ? `Troca ${plural(videoIds.length, 'vídeo', 'vídeos')} por ${dragged.title.title}` : `${dragged.title.title} · ${plural(dragged.title.videoIds.length, 'vídeo', 'vídeos')}`
    : dragged.video
      ? videoIds.includes(dragged.video.id) ? 'Já está neste dia' : full ? `Dia cheio (${maxVideoRows} vídeos)` : '+ 1 vídeo'
      : dragged.subject ? dragged.subject.title : '';
  // on the phone the day card is the frame: no box inside the box, the chooser under the subject, then the videos and games
  const frame = cn('relative grid content-start gap-2 rounded-[0.875rem] border p-2 transition-[border-color,background-color,box-shadow] duration-150',
    isOver ? 'border-primary bg-accent ring-2 ring-primary/40' : dragged ? 'border-dashed border-primary/60 bg-accent/30' : 'border-border bg-card',
    'max-[760px]:min-h-0 max-[760px]:content-start max-[760px]:justify-stretch max-[760px]:gap-3 max-[760px]:rounded-none max-[760px]:border-0 max-[760px]:bg-transparent max-[760px]:p-0 max-[760px]:text-left max-[760px]:ring-0');
  const dropBadge = dragged && <span aria-hidden="true" className={cn('pointer-events-none absolute -top-2.5 left-1/2 z-10 max-w-[90%] -translate-x-1/2 truncate rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold whitespace-nowrap shadow-card transition-colors max-[760px]:hidden',
    isOver ? 'bg-primary text-primary-foreground' : 'bg-card text-primary')}>{preview || 'Solte aqui'}</span>;
  const phoneSelect = 'max-[760px]:h-12 max-[760px]:rounded-xl max-[760px]:px-3.5 max-[760px]:text-base max-[760px]:focus-visible:outline-3 max-[760px]:focus-visible:outline-offset-2 max-[760px]:focus-visible:outline-primary/40';
  // personalized grid: the assunto only narrows "+ Adicionar vídeo"; on the computer the list above does that, so it shows on the phone only
  const chooser = <select aria-label={editable ? `Filtrar os vídeos do dia ${dayIndex + 1} por assunto` : `Assunto do dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-input bg-background px-2 text-sm', phoneSelect, 'max-[760px]:order-1',
    editable && !subject && 'min-[761px]:hidden',
    empty ? 'max-[760px]:border-[1.5px] max-[760px]:border-primary max-[760px]:bg-accent max-[760px]:font-bold max-[760px]:text-primary' : 'max-[760px]:border-border max-[760px]:bg-card max-[760px]:font-semibold max-[760px]:text-foreground')} onChange={event => onChoose(event.target.value)} value={subject?.id ?? ''}>
    <option value="">{editable ? (subject ? 'Todos os assuntos' : 'Filtrar por assunto') : subject ? 'Trocar assunto' : 'Escolher assunto'}</option>
    {themes.map(item => <option key={item.id} value={item.id}>{themeLabel(item)}</option>)}
  </select>;
  // the subject of the day filters the picker: only its videos are offered
  const available = editable ? [...catalog.videos.values()].filter(video => !videoIds.includes(video.id) && (!subject || subject.videoIds.includes(video.id))).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) : [];
  const videoPicker = editable && !full && available.length > 0 && <select aria-label={`Adicionar vídeo ao dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-dashed border-input bg-background px-2 text-sm text-muted-foreground', phoneSelect, 'max-[760px]:order-3')}
    onChange={event => {
      const value = event.target.value;
      if (value === 'all') onVideos!([...videoIds, ...available.map(video => video.id)].slice(0, maxVideoRows));
      else if (value) onVideos!([...videoIds, value]);
    }} value="">
    <option value="">+ Adicionar vídeo</option>
    {subject && available.length > 1 && <option value="all">Todos os vídeos de {subject.title} ({available.length})</option>}
    {available.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
  </select>;
  const move = (from: number, to: number) => {
    const next = [...videoIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onVideos!(next);
  };

  if (empty) {
    return <div className={cn(frame, 'min-h-40 place-content-center border-dashed text-center')} ref={setNodeRef}>
      {dropBadge}
      {editable ? <Film aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" /> : <Layers aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" />}
      <p className="builder-drag-hint m-0 text-xs text-muted-foreground max-[760px]:hidden">{editable ? 'Arraste um título ou vídeos para este dia' : 'Arraste um assunto para este dia'}</p>
      {editable && suggestion && <button className="mx-auto inline-flex max-w-full min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-primary/40 bg-accent px-3 text-[0.8125rem] font-semibold text-primary transition-colors hover:border-primary hover:bg-accent/70 max-[760px]:hidden"
        onClick={suggestion.onApply} title={`Coloca ${suggestion.title.title} neste dia`} type="button">
        <CirclePlus aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{suggestion.title.title}</span>
        <span className="shrink-0 font-normal text-primary/70">· {plural(suggestion.title.videoIds.length, 'vídeo', 'vídeos')}</span>
      </button>}
      {chooser}
      {videoPicker}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
    {dropBadge}
    {chooser}
    {subject
      ? <div className="flex items-center gap-2.5">
        <Cover className="size-11" subject={subject} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong className="line-clamp-2 text-[0.8125rem] leading-tight max-[760px]:text-base" title={themeLabel(subject)}>{subject.title}{subject.option ? <span className="ml-1 font-normal text-muted-foreground">· {subject.option}</span> : null}</strong>
          {canEditThemes && <a className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-primary hover:underline max-[760px]:-my-2 max-[760px]:py-2 max-[760px]:text-[0.8125rem]" href={`/platform/courses/${subject.id}/edit`} rel="noreferrer" target="_blank">
            Editar vídeos e jogos <ExternalLink aria-hidden="true" className="size-3" />
          </a>}
        </div>
        <button aria-label={`Tirar o assunto do dia ${dayIndex + 1}`} className="grid size-7 min-h-0 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted" onClick={onClear} type="button"><X className="size-4" /></button>
      </div>
      : !editable && <p className="m-0 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground max-[760px]:px-3 max-[760px]:py-2.5 max-[760px]:text-sm">Vídeos vindos de uma importação. <span className="max-[760px]:hidden">Arraste um assunto para trocar.</span><span className="hidden max-[760px]:inline">Escolha um assunto abaixo para trocar.</span></p>}

    <div aria-label={`Conteúdo do dia ${dayIndex + 1}`} className="builder-day-content grid max-h-72 gap-1 overflow-y-auto pr-0.5 max-[760px]:order-2 max-[760px]:max-h-none max-[760px]:gap-1.5 max-[760px]:overflow-visible max-[760px]:pr-0" role="group">
      <ol className="m-0 grid list-none gap-1 p-0">
        {videoIds.map((id, index) => {
          const video = catalog.videos.get(id);
          const title = video?.title ?? 'Vídeo removido do catálogo';
          return <li className="group/video flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 max-[760px]:px-2.5 max-[760px]:py-2" key={id}>
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.6875rem] font-bold text-primary-foreground">{index + 1}</span>
            <span className="min-w-0 flex-1 text-xs leading-snug font-medium break-words max-[760px]:text-sm">{title}{video && isExtra(video) && <> <ExtraBadge className="align-middle" /></>}</span>
            {video && <span className={cn('shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground', editable && 'group-hover/video:hidden group-focus-within/video:hidden max-[640px]:hidden')}>{videoTime(video)}</span>}
            {editable && <span className="hidden shrink-0 items-center group-hover/video:flex group-focus-within/video:flex max-[640px]:flex">
              <button aria-label={`Subir ${title}`} className="grid size-6 min-h-0 place-items-center rounded border-0 bg-transparent p-0 text-muted-foreground hover:bg-card disabled:opacity-30 max-[640px]:size-8" disabled={index === 0} onClick={() => move(index, index - 1)} type="button"><ArrowUp className="size-3.5" /></button>
              <button aria-label={`Descer ${title}`} className="grid size-6 min-h-0 place-items-center rounded border-0 bg-transparent p-0 text-muted-foreground hover:bg-card disabled:opacity-30 max-[640px]:size-8" disabled={index === videoIds.length - 1} onClick={() => move(index, index + 1)} type="button"><ArrowDown className="size-3.5" /></button>
              <button aria-label={`Tirar ${title} do dia ${dayIndex + 1}`} className="grid size-6 min-h-0 place-items-center rounded border-0 bg-transparent p-0 text-muted-foreground hover:bg-card hover:text-destructive max-[640px]:size-8" onClick={() => onVideos!(videoIds.filter(item => item !== id))} type="button"><X className="size-3.5" /></button>
            </span>}
          </li>;
        })}
      </ol>
      {editable && full && <p className="m-0 px-1 text-[0.6875rem] text-muted-foreground">Limite de {maxVideoRows} vídeos por dia.</p>}
      {gameIds.length > 0 && <ul aria-label="Jogos do dia" className="m-0 mt-1 grid list-none gap-1 p-0">
        {gameIds.map(id => <li className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning-soft px-2 py-1.5 text-warning" key={id}>
          <Gamepad2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-xs leading-snug font-semibold break-words">{catalog.games.get(id)?.title ?? 'Jogo removido'}</span>
          <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[0.625rem] font-bold tracking-wide uppercase">Jogo</span>
        </li>)}
      </ul>}
    </div>
    {videoPicker}
  </div>;
}
