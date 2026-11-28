import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, Check, ChevronDown, CloudUpload, ExternalLink, Film, Gamepad2, GripVertical, Layers, Play, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isExternal, isExtra, videoProvider, type GameModule } from '@/api';
import { gameTypeLabel } from '@/courseEditor/courseTrack';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ExternalVideoFrame } from '@/ExternalVideoPreview';
import VideoPreview from '@/VideoPreview';
import { Input, NativeSelect } from '@/components/ui/input';
import { extrasSuffix } from '@/courseEditor/courseFormat';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { cn } from '@/lib/utils';
import {
  daySteps, formatClock, formatSpan, maxGameRows, maxVideoRows, normalize, subjectColor, themeLabel,
  type Catalog, type CatalogVideo, type DayStep, type Subject,
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
 * (a filter), and, when its plan has games, the list of games beside it; Bronze sees the ready trainings, each one a
 * whole day.
 */
export function ThemeTray({ subjects, videos = [], games = [], canCustomizeGrid = false, canEditThemes = false, usedIn, gamesUsedIn, onUpload, onOpenGame }: {
  /** Opens the sending of videos, for who may send them; they join this list when ready. */
  onUpload?: () => void;
  subjects: Subject[]; videos?: CatalogVideo[]; canCustomizeGrid?: boolean; canEditThemes?: boolean;
  /** The games that can go onto the days (the plan has games). */
  games?: GameModule[];
  /** Where each video already is, as "Dia 2", so the operator sees what is placed. */
  usedIn?: Map<string, string>;
  /** Where each game already is, as "Dia 2". */
  gamesUsedIn?: Map<string, string>;
  /** Opens a game (to see or edit its texts), from the joystick of its card. */
  onOpenGame?: (game: GameModule) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  // the video being watched from its card, before placing it on a day
  const [playing, setPlaying] = useState<CatalogVideo | null>(null);
  // personalized grid: one complete list of videos, narrowed by an assunto, and the games beside it
  const hasGames = canCustomizeGrid && games.length > 0;
  const [mode, setMode] = useState<'videos' | 'games'>('videos');
  const current = !canCustomizeGrid ? 'subjects' : hasGames && mode === 'games' ? 'games' : 'videos';
  const shownSubjects = useMemo(() => subjects.filter(subject => normalize(subject.title).includes(normalize(query))), [subjects, query]);
  const filterIds = subjects.find(item => item.id === filter)?.videoIds;
  const shownVideos = useMemo(() => videos.filter(video => normalize(video.title).includes(normalize(query)) && (!filterIds || filterIds.includes(video.id))), [videos, query, filterIds]);
  const shownGames = useMemo(() => games.filter(game => normalize(game.title).includes(normalize(query))), [games, query]);
  const empty = shownVideos.length === 0;
  const search = current === 'videos' ? 'Buscar vídeo' : current === 'games' ? 'Buscar jogo' : 'Buscar assunto';

  return <section aria-label={current === 'videos' ? 'Biblioteca de vídeos' : current === 'games' ? 'Jogos' : 'Assuntos do acervo'} className="builder-tray ops-card grid gap-3 p-4 max-[760px]:hidden">
    <div className="flex flex-wrap items-center gap-2">
      {canCustomizeGrid
        ? <>
          {hasGames
            // two lists, side by side: what is dragged onto the days
            ? <div aria-label="O que pôr nos dias" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-1" role="group">
              {([['videos', Film, 'Vídeos', shownVideos.length], ['games', Gamepad2, 'Jogos', shownGames.length]] as const).map(([value, Icon, label, count]) =>
                <button aria-pressed={current === value} className={cn('inline-flex h-8 min-h-0 cursor-pointer items-center gap-1.5 rounded-full border-0 px-3.5 text-sm font-bold transition-[background-color,color,box-shadow] duration-150',
                  current === value ? 'bg-card text-foreground shadow-card' : 'bg-transparent text-muted-foreground hover:text-foreground')}
                key={value} onClick={() => setMode(value)} type="button">
                  <Icon aria-hidden="true" className="size-4" />{label}
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">{count}</span>
                </button>)}
            </div>
            : <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Film aria-hidden="true" className="size-4" /> Lista completa
              <span className="text-xs font-normal tabular-nums text-muted-foreground">{shownVideos.length}</span></h2>}
          {current === 'videos' && <NativeSelect aria-label="Filtrar por assunto" className="h-9 w-auto max-w-64" onChange={event => setFilter(event.target.value)} value={filter}>
            <option value="">Filtrar por assunto</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{item.title} ({item.videoIds.length})</option>)}
          </NativeSelect>}
        </>
        : <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-foreground"><Layers aria-hidden="true" className="size-4" /> Assuntos do acervo</h2>}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* sending a video is right here, on top of the list it will join */}
        {onUpload && <Button onClick={onUpload} size="sm" variant="outline"><CloudUpload /> Enviar vídeo</Button>}
        {canEditThemes && <a aria-label="Gerenciar biblioteca" className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary" href="/platform/videos" rel="noreferrer" target="_blank" title="Biblioteca de vídeos: marcar os assuntos e as empresas de cada vídeo">
          <Layers aria-hidden="true" className="size-4" />
        </a>}
        <label className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={search} className="h-9 w-44 pl-8 max-[640px]:w-full" onChange={event => setQuery(event.target.value)}
            placeholder={search} value={query} />
        </label>
      </div>
    </div>
    {/* the hint gets its own quiet line: next to the filters it pushed the search to a row of its own */}
    <p className="-mt-1 m-0 text-[0.8125rem] text-muted-foreground">
      {current === 'subjects' ? 'Arraste para um dia e ele traz todos os vídeos e jogos.'
        : current === 'games' ? 'Arraste um jogo para um dia; lá as setas mudam onde ele entra. O joystick abre o jogo.'
          : 'Arraste um vídeo para um dia.'}
    </p>
    {current === 'games'
      ? shownGames.length === 0
        ? <p className="m-0 py-3 text-sm text-muted-foreground">Nenhum jogo encontrado.</p>
        : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
          {shownGames.map(game => <li className="shrink-0" key={game.id}><GameCard game={game} onOpen={onOpenGame} place={gamesUsedIn?.get(game.id)} /></li>)}
        </ul>
    : current === 'videos'
      ? empty
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{videos.length === 0 ? 'A biblioteca ainda não tem vídeos prontos. Envie em Biblioteca de vídeos.'
          : 'Nenhum vídeo encontrado.'}</p>
          : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
            {shownVideos.map(video => <li className="shrink-0" key={video.id}><VideoCard onPlay={setPlaying} place={usedIn?.get(video.id)} video={video} /></li>)}
          </ul>
      : shownSubjects.length === 0
        ? <p className="m-0 py-3 text-sm text-muted-foreground">{subjects.length === 0 ? 'Ainda não há assuntos no acervo. Crie em Conteúdo.' : 'Nenhum assunto encontrado.'}</p>
        : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shownSubjects.map(subject => <li className="shrink-0" key={subject.id}><TrayCard subject={subject} /></li>)}</ul>}
    {playing?.source && <Dialog description={<>{videoTime(playing)}{usedIn?.get(playing.id) && <> · já está no {usedIn.get(playing.id)}</>}</>} onClose={() => setPlaying(null)} size="lg" title={playing.title}>
      <div className="aspect-video overflow-hidden rounded-xl bg-[#0b1f19] [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
        {isExternal(playing.source)
          ? <ExternalVideoFrame title={playing.title} video={playing.source} />
          : <VideoPreview preload="metadata" src={playing.source.fileUrl} title={playing.title} versions={playing.source} />}
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
  // the whole card is what drags; the round play button on it only plays
  return <div aria-label={`Arrastar o vídeo ${video.title}`} className={cn('flex h-[4.25rem] w-60 cursor-grab touch-none items-center gap-2.5 rounded-[0.875rem] border py-2 pr-2.5 pl-3 transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary hover:shadow-card active:cursor-grabbing motion-reduce:hover:translate-y-0',
    // already in a day: the card takes the colour of the brand, so what is left to place stands out at a glance
    place ? 'border-primary/45 bg-accent' : 'border-border bg-card', isDragging && 'opacity-40')} ref={setNodeRef} {...attributes} {...listeners}>
    {onPlay && video.source
      ? <button aria-label={`Assistir ${video.title}`} className="m-0 grid size-8 min-h-0 shrink-0 cursor-pointer place-items-center rounded-full border border-border bg-transparent p-0 text-muted-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
        onClick={() => onPlay(video)} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} title="Assistir" type="button">
        <Play aria-hidden="true" className="size-3.5 translate-x-px fill-current" />
      </button>
      : <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"><Play className="size-3.5 translate-x-px" /></span>}
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={video.title}>{video.title}</strong>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap tabular-nums text-muted-foreground">
        <span className="shrink-0">{videoTime(video)}</span>
        {isExtra(video) && <ExtraBadge className="shrink-0" />}
        {place && <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary px-1.5 py-px text-[0.625rem] leading-tight font-bold text-primary-foreground" title={`Já está no ${place}`}><Check aria-hidden="true" className="size-2.5" strokeWidth={3} />{place}</span>}
      </span>
    </div>
  </div>;
}

/** A game in the list: the whole card drags onto a day; its joystick opens the game. */
function GameCard({ game, place, onOpen }: { game: GameModule; place?: string; onOpen?: (game: GameModule) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `game:${game.id}`, data: { game } });
  return <div aria-label={`Arrastar o jogo ${game.title}`} className={cn('flex h-[4.25rem] w-60 cursor-grab touch-none items-center gap-2.5 rounded-[0.875rem] border border-warning/40 bg-card py-2 pr-2.5 pl-3 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-warning hover:shadow-card active:cursor-grabbing motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef} {...attributes} {...listeners}>
    {onOpen
      ? <button aria-label={`Abrir o jogo ${game.title}`} className="m-0 grid size-8 min-h-0 shrink-0 cursor-pointer place-items-center rounded-full border border-warning/50 bg-warning-soft p-0 text-warning transition-colors hover:border-warning hover:bg-warning hover:text-white"
        onClick={() => onOpen(game)} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} title="Abrir o jogo" type="button">
        <Gamepad2 aria-hidden="true" className="size-4" />
      </button>
      : <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-warning/50 bg-warning-soft text-warning"><Gamepad2 className="size-4" /></span>}
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={game.title}>{game.title}</strong>
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-muted-foreground">
        <span className="truncate">{gameTypeLabel(game)}</span>
        {place && <span className="shrink-0 rounded-full bg-accent px-1.5 py-px text-[0.625rem] leading-tight font-bold text-primary" title={`Já está no ${place}`}>{place}</span>}
      </span>
    </div>
  </div>;
}

/**
 * What rides under the pointer while dragging: the same card, lifted (a little bigger, tilted, with a deep shadow), so
 * the operator sees what is being carried the whole way to the day.
 */
export function DragPreview({ data }: { data: { video?: CatalogVideo; subject?: Subject; game?: GameModule } }) {
  const lifted = 'flex w-60 rotate-[-2deg] scale-[1.03] cursor-grabbing items-center gap-2 rounded-[0.875rem] border p-2 shadow-overlay motion-reduce:rotate-0 motion-reduce:scale-100';
  if (data.game) return <div className={cn(lifted, 'border-warning bg-card')}>
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-warning/50 bg-warning-soft text-warning"><Gamepad2 aria-hidden="true" className="size-4" /></span>
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="line-clamp-2 text-[0.8125rem] leading-tight">{data.game.title}</strong>
      <span className="text-xs text-muted-foreground">{gameTypeLabel(data.game)}</span>
    </div>
  </div>;
  if (data.video) return <div className={cn(lifted, 'border-primary bg-card')}>
    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"><Play aria-hidden="true" className="size-3.5 translate-x-px" /></span>
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
 * One day, whole: the subject dropped on it (a label and a shortcut), its videos and its games, each game between
 * the videos where the participant gets it. With a plan that personalizes the grid the videos are the operator's:
 * videos are dropped or picked one by one, reordered and removed right here.
 */
export function DayBox({ dayIndex, subject, themes, catalog, videoIds, games, onChoose, onClear, onVideos, onMoveGame, onRemoveGame, onOpenGame, canEditThemes = true, canCustomizeGrid = false, locked = false, onSend, arriving = [] }: {
  /** Moves a game one step among the day's videos and games; with it the game rows get their arrows and x. */
  onMoveGame?: (gameId: string, delta: -1 | 1) => void;
  onRemoveGame?: (gameId: string) => void;
  /** Opens a game of the day (to see or edit its texts). */
  onOpenGame?: (gameId: string) => void;
  /** Sends videos to this day: they join the company's videos and come onto the day when ready. */
  onSend?: (files: File[]) => void;
  /** The videos on their way to this day: sending, or being prepared. */
  arriving?: { id: string; title: string; status: string }[];
  /** The day came from a ready SIPAT: its videos are shown as they are, nothing to pick or change. */
  locked?: boolean;
  dayIndex: number; subject: Subject | undefined; themes: Subject[]; catalog: Catalog; videoIds: string[];
  /** The day's games and after how many of its videos each one opens (0: before the first), from `placedGames`. */
  games: { id: string; afterVideo: number }[];
  onChoose: (title: string) => void; onClear: () => void; canEditThemes?: boolean;
  canCustomizeGrid?: boolean;
  /** The new list of videos of the day; only with canCustomizeGrid. */
  onVideos?: (videoIds: string[]) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(dayIndex) });
  const { active } = useDndContext();
  const editable = canCustomizeGrid && !!onVideos && !locked;
  const full = videoIds.length >= maxVideoRows;
  // a day with only games (its videos taken out) still shows them, where the participant gets them
  const empty = !subject && videoIds.length === 0 && arriving.length === 0 && games.length === 0;
  const gamesEditable = !!onMoveGame && !locked;
  // while something is dragged every day shows it can take it; the one under the pointer says what the drop will do
  const dragged = active?.data.current as { video?: CatalogVideo; subject?: Subject; game?: GameModule } | undefined;
  const preview = !isOver || !dragged ? ''
    : dragged.video
      ? videoIds.includes(dragged.video.id) ? 'Já está neste dia' : full ? `Dia cheio (${maxVideoRows} vídeos)` : '+ 1 vídeo'
      : dragged.game
        ? games.some(game => game.id === dragged.game?.id) ? 'Já está neste dia' : games.length >= maxGameRows ? `Dia cheio (${maxGameRows} jogos)` : '+ 1 jogo'
        : dragged.subject ? dragged.subject.title : '';
  // on the phone the day card is the frame: no box inside the box, the chooser under the subject, then the videos and games
  const frame = cn('relative grid content-start gap-2 rounded-[0.875rem] border p-2 transition-[border-color,background-color,box-shadow] duration-150',
    isOver ? 'border-primary bg-accent ring-2 ring-primary/40' : dragged ? 'border-dashed border-primary/60 bg-accent/30' : 'border-border bg-card',
    'max-[760px]:min-h-0 max-[760px]:content-start max-[760px]:justify-stretch max-[760px]:gap-3 max-[760px]:rounded-none max-[760px]:border-0 max-[760px]:bg-transparent max-[760px]:p-0 max-[760px]:text-left max-[760px]:ring-0');
  const dropBadge = dragged && <span aria-hidden="true" className={cn('pointer-events-none absolute -top-2.5 left-1/2 z-10 max-w-[90%] -translate-x-1/2 truncate rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold whitespace-nowrap shadow-card transition-colors max-[760px]:hidden',
    isOver ? 'bg-primary text-primary-foreground' : 'bg-card text-primary')}>{preview || 'Solte aqui'}</span>;
  const phoneSelect = 'max-[760px]:h-12 max-[760px]:rounded-xl max-[760px]:px-3.5 max-[760px]:text-base max-[760px]:focus-visible:outline-3 max-[760px]:focus-visible:outline-offset-2 max-[760px]:focus-visible:outline-primary/40';
  // personalized grid: the assunto only narrows "+ Adicionar vídeo"; on the computer the list above does that, so it shows on the phone only
  const chooser = locked ? null : <select aria-label={editable ? `Filtrar os vídeos do dia ${dayIndex + 1} por assunto` : `Assunto do dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-input bg-background px-2 text-sm', phoneSelect, 'max-[760px]:order-1',
    editable && !subject && 'min-[761px]:hidden',
    empty ? 'max-[760px]:border-[1.5px] max-[760px]:border-primary max-[760px]:bg-accent max-[760px]:font-bold max-[760px]:text-primary' : 'max-[760px]:border-border max-[760px]:bg-card max-[760px]:font-semibold max-[760px]:text-foreground')} onChange={event => onChoose(event.target.value)} value={subject?.id ?? ''}>
    <option value="">{editable ? (subject ? 'Todos os assuntos' : 'Filtrar por assunto') : subject ? 'Trocar assunto' : 'Escolher assunto'}</option>
    {themes.map(item => <option key={item.id} value={item.id}>{themeLabel(item)}</option>)}
  </select>;
  // two ways to add a video, side by side: dragged from the list above, or picked here; the phone has only the picker
  // the subject of the day filters the picker: only its videos are offered
  const available = editable ? [...catalog.videos.values()].filter(video => !videoIds.includes(video.id) && (!subject || subject.videoIds.includes(video.id))).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')) : [];
  const videoPicker = editable && !full && available.length > 0 && <select aria-label={`Adicionar vídeo ao dia ${dayIndex + 1}`} className={cn('h-9 w-full rounded-md border border-dashed border-input bg-background px-2 text-sm text-muted-foreground min-[761px]:hidden', phoneSelect, 'max-[760px]:order-3')}
    onChange={event => {
      const value = event.target.value;
      if (value === 'all') onVideos!([...videoIds, ...available.map(video => video.id)].slice(0, maxVideoRows));
      else if (value) onVideos!([...videoIds, value]);
    }} value="">
    <option value="">Selecionar da Biblioteca</option>
    {subject && available.length > 1 && <option value="all">Todos os vídeos de {subject.title} ({available.length})</option>}
    {available.map(video => <option key={video.id} value={video.id}>{video.title}</option>)}
  </select>;
  // on the computer the same choice is a menu: each video with its time, the whole subject in one click
  const videoMenu = editable && !full && available.length > 0 && <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button aria-label={`Escolher vídeo para o dia ${dayIndex + 1}`} className="m-0 flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[0.8125rem] font-semibold text-foreground transition-colors hover:border-primary hover:bg-accent data-[state=open]:border-primary data-[state=open]:bg-accent max-[760px]:hidden" type="button">
        <Plus aria-hidden="true" className="size-4 text-primary" />
        <span className="min-w-0 flex-1 truncate text-left">Adicionar vídeo</span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.6875rem] font-semibold tabular-nums text-muted-foreground">{available.length}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="max-h-80 w-(--radix-dropdown-menu-trigger-width) min-w-64 overflow-y-auto">
      <DropdownMenuLabel>{subject ? subject.title : 'Biblioteca'}</DropdownMenuLabel>
      {subject && available.length > 1 && <>
        <DropdownMenuItem onSelect={() => onVideos!([...videoIds, ...available.map(video => video.id)].slice(0, maxVideoRows))}>
          <Layers aria-hidden="true" /> <span className="font-semibold">Todos os {available.length} vídeos</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>}
      {available.map(video => <DropdownMenuItem key={video.id} onSelect={() => onVideos!([...videoIds, video.id])}>
        <Play aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" title={video.title}>{video.title}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{videoTime(video)}</span>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
  // its own button and what is on its way, last in the day: after the videos and the picker
  const sendRow = <>
    {onSend && !full && <label className="m-0 flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-input px-2 text-[0.8125rem] font-semibold text-primary transition-colors hover:border-primary hover:bg-accent focus-within:border-primary max-[760px]:order-3 max-[760px]:min-h-12">
      <CloudUpload aria-hidden="true" className="size-4" /> Enviar vídeo
      <input accept="video/mp4,video/webm,.mp4,.webm" aria-label={`Enviar vídeo para o dia ${dayIndex + 1}`} className="sr-only" multiple
        onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length > 0) onSend(files); }} type="file" />
    </label>}
    {arriving.length > 0 && <ul aria-label={`Vídeos a caminho do dia ${dayIndex + 1}`} className="m-0 grid list-none gap-1 p-0 max-[760px]:order-3">
      {arriving.map(item => <li className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-accent/40 px-2 py-1.5" key={item.id}>
        <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={item.title}>{item.title}</span>
        <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{item.status}</span>
      </li>)}
    </ul>}
  </>;
  const move = (from: number, to: number) => {
    const next = [...videoIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onVideos!(next);
  };
  // the day in the participant's order: each game right after the video it comes after (before the first, at the top)
  const steps = daySteps(videoIds, games);
  const rowButton = 'grid size-6 min-h-0 place-items-center rounded border-0 bg-transparent p-0 hover:bg-card disabled:opacity-30 max-[640px]:size-8';
  /** A game of the day: it opens on a click; its arrows move it a step among the videos and games. */
  const gameRow = (step: Extract<DayStep, { kind: 'game' }>, position: number) => {
    const title = catalog.games.get(step.id)?.title ?? 'Jogo removido';
    const name = <>
      <Gamepad2 aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 text-xs leading-snug font-semibold break-words">{title}</span>
    </>;
    return <li className="group/game flex items-center gap-2 rounded-lg border border-warning/50 bg-warning-soft px-2 py-1.5 text-warning max-[760px]:px-2.5 max-[760px]:py-2" key={step.key}>
      {onOpenGame
        ? <button aria-label={`Abrir o jogo ${title}`} className="m-0 flex min-h-0 min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-warning hover:underline hover:underline-offset-2" onClick={() => onOpenGame(step.id)} title="Abrir o jogo" type="button">{name}</button>
        : name}
      <span className={cn('shrink-0 rounded bg-warning/15 px-1.5 text-[0.625rem] font-bold tracking-wide uppercase', gamesEditable && 'group-hover/game:hidden group-focus-within/game:hidden max-[640px]:hidden')}>Jogo</span>
      {gamesEditable && <span className="hidden shrink-0 items-center text-warning group-hover/game:flex group-focus-within/game:flex max-[640px]:flex">
        <button aria-label={`Subir ${title}`} className={rowButton} disabled={position === 0} onClick={() => onMoveGame?.(step.id, -1)} type="button"><ArrowUp className="size-3.5" /></button>
        <button aria-label={`Descer ${title}`} className={rowButton} disabled={position === steps.length - 1} onClick={() => onMoveGame?.(step.id, 1)} type="button"><ArrowDown className="size-3.5" /></button>
        <button aria-label={`Tirar ${title} do dia ${dayIndex + 1}`} className={cn(rowButton, 'hover:text-destructive')} onClick={() => onRemoveGame?.(step.id)} type="button"><X className="size-3.5" /></button>
      </span>}
    </li>;
  };

  if (empty) {
    return <div className={cn(frame, 'min-h-40 place-content-center border-dashed text-center')} ref={setNodeRef}>
      {dropBadge}
      {editable ? <Film aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" /> : <Layers aria-hidden="true" className="mx-auto size-6 text-muted-foreground max-[760px]:hidden" />}
      <p className="builder-drag-hint m-0 text-xs text-muted-foreground max-[760px]:hidden">{locked ? 'Este dia ainda não tem vídeos' : editable ? 'Arraste vídeos da lista para este dia' : 'Arraste um assunto para este dia'}</p>
      {chooser}
      {videoPicker}
      {videoMenu}
      {sendRow}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
    {dropBadge}
    {chooser}
    {locked ? null : subject
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
        {steps.map((step, position) => {
          if (step.kind === 'game') return gameRow(step, position);
          const { id, index } = step;
          const video = catalog.videos.get(id);
          // out of the company's catalog: taken out of the library, or of an assunto outside its plan
          const title = video?.title ?? 'Vídeo indisponível para a empresa';
          return <li className="group/video flex items-center gap-2 rounded-lg bg-muted px-2 py-1.5 max-[760px]:px-2.5 max-[760px]:py-2" key={id}
            title={video ? undefined : 'Este vídeo saiu da biblioteca ou é de um assunto fora do plano da empresa: o participante não consegue assistir. Troque por outro.'}>
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
    </div>
    {videoPicker}
    {videoMenu}
    {sendRow}
  </div>;
}
