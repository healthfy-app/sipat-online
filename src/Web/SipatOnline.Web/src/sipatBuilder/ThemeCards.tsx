import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, CloudUpload, ExternalLink, Film, Gamepad2, GripVertical, Layers, Pencil, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isExtra, videoProvider } from '@/api';
import { Input } from '@/components/ui/input';
import { extrasSuffix } from '@/courseEditor/courseFormat';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { cn } from '@/lib/utils';
import { formatClock, formatSpan, maxVideoRows, normalize, subjectColor, themeLabel, type Catalog, type CatalogVideo, type Subject } from './model';

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

type TrayTab = 'videos' | 'subjects';

/**
 * What goes onto the days: the standalone videos of the library, one by one, and the subjects (a ready set of
 * videos and games). With a plan that does not personalize the grid (Bronze), only subjects.
 */
export function ThemeTray({ subjects, videos = [], canCustomizeGrid = false, canEditThemes = false }: {
  subjects: Subject[]; videos?: CatalogVideo[]; canCustomizeGrid?: boolean; canEditThemes?: boolean;
}) {
  const [tab, setTab] = useState<TrayTab>(canCustomizeGrid ? 'videos' : 'subjects');
  const [query, setQuery] = useState('');
  const current = canCustomizeGrid ? tab : 'subjects';
  const shownSubjects = useMemo(() => subjects.filter(subject => normalize(subject.title).includes(normalize(query))), [subjects, query]);
  const shownVideos = useMemo(() => videos.filter(video => normalize(video.title).includes(normalize(query))), [videos, query]);
  const tabButton = (value: TrayTab, label: string, count: number, Icon: typeof Film) => (
    <button aria-pressed={current === value} className={cn(
      'inline-flex h-8 min-h-0 cursor-pointer items-center gap-1.5 rounded-md border-0 px-3 text-[0.8125rem] font-semibold transition-colors',
      current === value ? 'bg-card text-foreground shadow-sm' : 'bg-transparent text-muted-foreground hover:text-foreground',
    )} onClick={() => setTab(value)} type="button">
      <Icon aria-hidden="true" className="size-3.5" /> {label} <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
    </button>
  );

  return <section aria-label={current === 'videos' ? 'Vídeos avulsos' : 'Assuntos do acervo'} className="builder-tray ops-card grid gap-3 p-4 max-[760px]:hidden">
    <div className="flex flex-wrap items-center gap-2">
      {canCustomizeGrid
        ? <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="O que arrastar para os dias">
          {tabButton('videos', 'Vídeos avulsos', videos.length, Film)}
          {tabButton('subjects', 'Assuntos', subjects.length, Layers)}
        </div>
        : <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Layers aria-hidden="true" className="size-4" /> Assuntos do acervo</h2>}
      <span className="text-sm text-muted-foreground max-[640px]:hidden">
        · {current === 'videos' ? 'arraste um vídeo para um dia' : 'arraste para um dia e ele traz todos os vídeos e jogos'}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {canEditThemes && <>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/videos" rel="noreferrer" target="_blank">
            <CloudUpload aria-hidden="true" className="size-4" /> Enviar vídeos
          </a>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/courses" rel="noreferrer" target="_blank">
            <Pencil aria-hidden="true" className="size-4" /> Editar assuntos
          </a>
        </>}
        <label className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={current === 'videos' ? 'Buscar vídeo' : 'Buscar assunto'} className="h-9 w-56 pl-8 max-[640px]:w-full" onChange={event => setQuery(event.target.value)}
            placeholder={current === 'videos' ? 'Buscar vídeo' : 'Buscar assunto'} value={query} />
        </label>
      </div>
    </div>
    {current === 'videos'
      ? shownVideos.length === 0
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{videos.length === 0 ? 'A biblioteca ainda não tem vídeos prontos. Envie em Biblioteca de vídeos.' : 'Nenhum vídeo encontrado.'}</p>
        : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shownVideos.map(video => <li className="shrink-0" key={video.id}><VideoCard video={video} /></li>)}</ul>
      : shownSubjects.length === 0
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{subjects.length === 0 ? 'Ainda não há assuntos no acervo. Crie em Conteúdo.' : 'Nenhum assunto encontrado.'}</p>
        : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shownSubjects.map(subject => <li className="shrink-0" key={subject.id}><TrayCard subject={subject} /></li>)}</ul>}
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

function VideoCard({ video }: { video: CatalogVideo }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `video:${video.id}`, data: { video } });
  return <div className={cn('flex w-60 items-center gap-2 rounded-[0.875rem] border border-border bg-card p-2 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-card motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o vídeo ${video.title}`} className="grid size-7 min-h-0 shrink-0 cursor-grab touch-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-[#0b1f19] text-white/85"><Film className="size-4" /></span>
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={video.title}>{video.title}</strong>
      <span className="text-xs tabular-nums text-muted-foreground">{videoTime(video)}{isExtra(video) && <> · <ExtraBadge className="align-middle" /></>}</span>
    </div>
  </div>;
}

/**
 * One day, whole: the subject dropped on it (a label and a shortcut), its videos and the games that came with the
 * subject. With a plan that personalizes the grid the videos are the operator's: videos are dropped or picked one
 * by one, reordered and removed right here.
 */
export function DayBox({ dayIndex, subject, themes, catalog, videoIds, gameIds, onChoose, onClear, onVideos, canEditThemes = true, canCustomizeGrid = false }: {
  dayIndex: number; subject: Subject | undefined; themes: Subject[]; catalog: Catalog; videoIds: string[]; gameIds: string[];
  onChoose: (title: string) => void; onClear: () => void; canEditThemes?: boolean;
  canCustomizeGrid?: boolean;
  /** The new list of videos of the day; only with canCustomizeGrid. */
  onVideos?: (videoIds: string[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(dayIndex) });
  const editable = canCustomizeGrid && !!onVideos;
  const full = videoIds.length >= maxVideoRows;
  const empty = !subject && videoIds.length === 0;
  // on the phone the day card is the frame: no box inside the box, the chooser under the subject, then the videos and games
  const frame = cn('grid content-start gap-2 rounded-[0.875rem] border p-2 transition-colors', isOver ? 'border-primary bg-accent ring-2 ring-primary/40' : 'border-border bg-card',
    'max-[760px]:min-h-0 max-[760px]:content-start max-[760px]:justify-stretch max-[760px]:gap-3 max-[760px]:rounded-none max-[760px]:border-0 max-[760px]:bg-transparent max-[760px]:p-0 max-[760px]:text-left max-[760px]:ring-0');
  const phoneSelect = 'max-[760px]:h-12 max-[760px]:rounded-xl max-[760px]:px-3.5 max-[760px]:text-base max-[760px]:focus-visible:outline-3 max-[760px]:focus-visible:outline-offset-2 max-[760px]:focus-visible:outline-primary/40';
  const chooser = <select aria-label={`Assunto do dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-input bg-background px-2 text-sm', phoneSelect, 'max-[760px]:order-1',
    empty ? 'max-[760px]:border-[1.5px] max-[760px]:border-primary max-[760px]:bg-accent max-[760px]:font-bold max-[760px]:text-primary' : 'max-[760px]:border-border max-[760px]:bg-card max-[760px]:font-semibold max-[760px]:text-foreground')} onChange={event => onChoose(event.target.value)} value={subject?.id ?? ''}>
    <option value="">{subject ? 'Trocar assunto' : 'Escolher assunto'}</option>
    {themes.map(item => <option key={item.id} value={item.id}>{themeLabel(item)}</option>)}
  </select>;
  const available = editable ? [...catalog.videos.values()].filter(video => !videoIds.includes(video.id)).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) : [];
  const videoPicker = editable && !full && available.length > 0 && <select aria-label={`Adicionar vídeo ao dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-dashed border-input bg-background px-2 text-sm text-muted-foreground', phoneSelect, 'max-[760px]:order-3')}
    onChange={event => { if (event.target.value) onVideos!([...videoIds, event.target.value]); }} value="">
    <option value="">+ Adicionar vídeo</option>
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
      {editable ? <Film aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" /> : <Layers aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" />}
      <p className="builder-drag-hint m-0 text-xs text-muted-foreground max-[760px]:hidden">{editable ? 'Arraste vídeos ou um assunto para este dia' : 'Arraste um assunto para este dia'}</p>
      {videoPicker}
      {chooser}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
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
    {chooser}
  </div>;
}
