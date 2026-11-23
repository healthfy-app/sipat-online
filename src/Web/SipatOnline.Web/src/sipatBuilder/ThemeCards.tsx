import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, CalendarRange, CloudUpload, ExternalLink, Film, Gamepad2, GripVertical, Layers, Pencil, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { isExtra, videoProvider } from '@/api';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { extrasSuffix } from '@/courseEditor/courseFormat';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { cn } from '@/lib/utils';
import {
  formatClock, formatSpan, maxVideoRows, normalize, subjectColor, themeLabel,
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
export function ThemeTray({ subjects, videos = [], canCustomizeGrid = false, canEditThemes = false, trainings = [], usedIn, onUseTraining }: {
  subjects: Subject[]; videos?: CatalogVideo[]; canCustomizeGrid?: boolean; canEditThemes?: boolean;
  /** The trainings of Conteúdo: one can be opened here, its Títulos dragged onto days. */
  trainings?: TrayTraining[];
  /** Where each video already is, as "Dia 2", so the operator sees what is placed. */
  usedIn?: Map<string, string>;
  /** Lays the whole training on the days, Título 1 on day 1 and so on. */
  onUseTraining?: (training: TrayTraining) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [trainingId, setTrainingId] = useState('');
  // personalized grid: one complete list of videos, narrowed by an assunto
  const current = canCustomizeGrid ? 'videos' : 'subjects';
  const shownSubjects = useMemo(() => subjects.filter(subject => normalize(subject.title).includes(normalize(query))), [subjects, query]);
  const filterIds = subjects.find(item => item.id === filter)?.videoIds;
  const shownVideos = useMemo(() => videos.filter(video => normalize(video.title).includes(normalize(query)) && (!filterIds || filterIds.includes(video.id))), [videos, query, filterIds]);
  // an open training splits the list: its videos by Título on top, every other video below as avulsos
  const training = canCustomizeGrid ? trainings.find(item => item.id === trainingId) : undefined;
  const shownById = useMemo(() => new Map(shownVideos.map(video => [video.id, video])), [shownVideos]);
  const inTraining = useMemo(() => new Set(training?.titles.flatMap(title => title.videoIds) ?? []), [training]);
  const looseVideos = training ? shownVideos.filter(video => !inTraining.has(video.id)) : shownVideos;
  const narrowed = query.trim() !== '' || filter !== '';
  const titleRows = (training?.titles ?? [])
    .map(title => ({ title, videos: title.videoIds.flatMap(id => shownById.get(id) ?? []) }))
    .filter(row => !narrowed || row.videos.length > 0);

  return <section aria-label={current === 'videos' ? 'Vídeos avulsos' : 'Assuntos do acervo'} className="builder-tray ops-card grid gap-3 p-4 max-[760px]:hidden">
    <div className="flex flex-wrap items-center gap-2">
      {canCustomizeGrid
        ? <>
          <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Film aria-hidden="true" className="size-4" /> Lista completa <span className="text-xs font-normal tabular-nums text-muted-foreground">{shownVideos.length}</span></h2>
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
        {canEditThemes && <>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href="/platform/videos" rel="noreferrer" target="_blank">
            <CloudUpload aria-hidden="true" className="size-4" /> Enviar vídeos
          </a>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-accent" href={canCustomizeGrid ? '/platform/videos' : '/platform/courses'} rel="noreferrer" target="_blank">
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
      ? <>
        {trainings.length > 0 && <TrainingPicker onPick={id => setTrainingId(current => (current === id ? '' : id))} selectedId={training?.id ?? ''} trainings={trainings} />}
        {training && <TrainingPanel canEditThemes={canEditThemes} narrowed={narrowed} onClose={() => setTrainingId('')}
          onUse={onUseTraining ? () => onUseTraining(training) : undefined} rows={titleRows} training={training} usedIn={usedIn} />}
        {trainings.length > 0 && <Step className="pt-1">
          {training ? 'Vídeos avulsos' : 'Todos os vídeos'} <span className="font-semibold tracking-normal tabular-nums normal-case">{looseVideos.length}</span>
        </Step>}
        {looseVideos.length === 0
          ? <p className="m-0 py-3 text-sm text-muted-foreground">{videos.length === 0 ? 'A biblioteca ainda não tem vídeos prontos. Envie em Biblioteca de vídeos.' : training && !narrowed ? 'Todos os vídeos estão neste treinamento.' : 'Nenhum vídeo encontrado.'}</p>
          : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{looseVideos.map(video => <li className="shrink-0" key={video.id}><VideoCard place={usedIn?.get(video.id)} video={video} /></li>)}</ul>}
      </>
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

function VideoCard({ video, place, dragId = `video:${video.id}` }: { video: CatalogVideo; place?: string; dragId?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data: { video } });
  return <div className={cn('flex w-60 items-center gap-2 rounded-[0.875rem] border border-border bg-card p-2 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-card motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o vídeo ${video.title}`} className="grid size-7 min-h-0 shrink-0 cursor-grab touch-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-md bg-[#0b1f19] text-white/85"><Film className="size-4" /></span>
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={video.title}>{video.title}</strong>
      <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
        {videoTime(video)}{isExtra(video) && <> · <ExtraBadge className="align-middle" /></>}
        {place && <span className="rounded-full bg-accent px-1.5 py-px text-[0.625rem] font-bold text-primary" title={`Já está no ${place}`}>{place}</span>}
      </span>
    </div>
  </div>;
}

/** A small label that numbers the steps of the box, so the order reads at a glance. */
function Step({ number, children, className }: { number?: number; children: ReactNode; className?: string }) {
  return <h3 className={cn('m-0 flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.08em] text-muted-foreground uppercase', className)}>
    {number !== undefined && <span aria-hidden="true" className="grid size-4.5 place-items-center rounded-full bg-primary text-[0.625rem] tracking-normal text-primary-foreground">{number}</span>}
    {children}
    <span aria-hidden="true" className="h-px flex-1 bg-border" />
  </h3>;
}

function TrainingCover({ training, className }: { training: TrayTraining; className?: string }) {
  if (training.coverUrl) return <img alt="" className={cn('shrink-0 rounded-md object-cover', className)} src={training.coverUrl} />;
  const initials = training.title.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-md text-xs font-bold text-white', className)} style={{ backgroundColor: subjectColor(training.title) }}>{initials || 'T'}</span>;
}

const countVideos = (training: TrayTraining) => training.titles.reduce((sum, title) => sum + title.videoIds.length, 0);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Step 1: the trainings of Conteúdo side by side; one click opens it, a second click closes it. */
function TrainingPicker({ trainings, selectedId, onPick }: { trainings: TrayTraining[]; selectedId: string; onPick: (id: string) => void }) {
  return <div className="grid gap-2">
    <Step number={1}>Escolha o treinamento</Step>
    <ul aria-label="Treinamentos" className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
      {trainings.map(item => {
        const selected = item.id === selectedId;
        return <li className="shrink-0" key={item.id}>
          <button aria-pressed={selected}
            className={cn('flex w-60 cursor-pointer items-center gap-2.5 rounded-[0.875rem] border bg-card p-2 text-left transition-[border-color,box-shadow,background-color]',
              selected ? 'border-primary bg-accent shadow-card ring-2 ring-primary/25' : 'border-border hover:border-primary/60 hover:bg-accent/40')}
            onClick={() => onPick(item.id)} type="button">
            <TrainingCover className="size-10" training={item} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <strong className={cn('line-clamp-2 text-[0.8125rem] leading-tight', selected && 'text-primary')}>{item.title}</strong>
              <span className="text-xs text-muted-foreground">{plural(item.titles.length, 'título', 'títulos')} · {plural(countVideos(item), 'vídeo', 'vídeos')}</span>
            </span>
            {selected && <X aria-hidden="true" className="size-4 shrink-0 text-primary" />}
          </button>
        </li>;
      })}
    </ul>
  </div>;
}

/** Step 2: each Título of the open training as one line; the line goes to a day whole, a video of it alone. */
function TrainingPanel({ training, rows, narrowed, usedIn, canEditThemes, onUse, onClose }: {
  training: TrayTraining; rows: { title: TrainingTitle; videos: CatalogVideo[] }[]; narrowed: boolean;
  usedIn?: Map<string, string>; canEditThemes: boolean; onUse?: () => void; onClose: () => void;
}) {
  return <section aria-label={`Títulos de ${training.title}`} className="grid gap-2.5 rounded-2xl border border-primary/25 bg-accent/35 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Step className="min-w-48 flex-1 text-primary" number={2}>Arraste cada título para um dia</Step>
      {onUse && <Button onClick={onUse} size="sm" title="Título 1 no dia 1, título 2 no dia 2…"><CalendarRange /> Usar como dias</Button>}
      {canEditThemes && <a className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-semibold text-primary hover:bg-card" href={`/platform/courses/${training.id}/edit`} rel="noreferrer" target="_blank">
        Abrir no editor <ExternalLink aria-hidden="true" className="size-3.5" />
      </a>}
      <Button aria-label={`Fechar ${training.title}`} onClick={onClose} size="icon-sm" title="Fechar treinamento" variant="ghost"><X /></Button>
    </div>
    {rows.length === 0
      ? <p className="m-0 px-1 py-2 text-sm text-muted-foreground">{narrowed ? 'Nenhum vídeo deste treinamento corresponde à busca.' : 'Este treinamento ainda não tem vídeos prontos.'}</p>
      : <ol className="m-0 grid list-none gap-2 p-0">
        {rows.map((row, index) => <TitleRow index={index} key={row.title.id} row={row} trainingId={training.id} usedIn={usedIn} />)}
      </ol>}
  </section>;
}

function TitleRow({ trainingId, row, index, usedIn }: {
  trainingId: string; row: { title: TrainingTitle; videos: CatalogVideo[] }; index: number; usedIn?: Map<string, string>;
}) {
  const { title, videos } = row;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `title:${trainingId}:${title.id}`, data: { title }, disabled: title.videoIds.length === 0 });
  const totalMs = videos.filter(video => !isExtra(video)).reduce((sum, video) => sum + video.durationMs, 0);
  return <li className={cn('grid grid-cols-[15rem_minmax(0,1fr)] items-stretch gap-2 max-[1000px]:grid-cols-1', isDragging && 'opacity-50')} ref={setNodeRef}>
    <button aria-label={`Arrastar o título ${title.title} com ${plural(title.videoIds.length, 'vídeo', 'vídeos')}`}
      className="group/title flex min-h-0 cursor-grab touch-none items-center gap-2.5 rounded-[0.875rem] border border-primary/30 bg-card p-2.5 text-left shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary active:cursor-grabbing disabled:cursor-default disabled:opacity-60 motion-reduce:hover:translate-y-0"
      disabled={title.videoIds.length === 0} type="button" {...attributes} {...listeners}>
      <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground group-hover/title:text-primary" />
      <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">{index + 1}</span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <strong className="truncate text-sm leading-tight" title={title.title}>{title.title}</strong>
        <span className="text-xs tabular-nums text-muted-foreground">{plural(title.videoIds.length, 'vídeo', 'vídeos')}{totalMs > 0 && ` · ${formatClock(totalMs)}`}</span>
      </span>
    </button>
    {videos.length === 0
      ? <p className="m-0 grid place-content-center rounded-[0.875rem] border border-dashed border-border px-3 text-xs text-muted-foreground">Sem vídeos neste título.</p>
      : <ul aria-label={`Vídeos de ${title.title}`} className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
        {videos.map(video => <li className="shrink-0" key={video.id}><VideoCard dragId={`video:${title.id}:${video.id}`} place={usedIn?.get(video.id)} video={video} /></li>)}
      </ul>}
  </li>;
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
      {editable ? <Film aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" /> : <Layers aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" />}
      <p className="builder-drag-hint m-0 text-xs text-muted-foreground max-[760px]:hidden">{editable ? 'Arraste vídeos ou um assunto para este dia' : 'Arraste um assunto para este dia'}</p>
      {chooser}
      {videoPicker}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
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
