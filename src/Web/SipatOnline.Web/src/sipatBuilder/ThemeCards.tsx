import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ExternalLink, Gamepad2, GripVertical, Layers, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatClock, formatSpan, normalize, subjectColor, themeLabel, type Catalog, type Subject } from './model';

export const dropId = (dayIndex: number) => `theme-day-${dayIndex}`;

function Cover({ subject, className }: { subject: Subject; className?: string }) {
  if (subject.coverUrl) return <img alt="" className={cn('shrink-0 rounded-md object-cover', className)} src={subject.coverUrl} />;
  const initials = subject.title.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-md text-xs font-bold text-white', className)} style={{ backgroundColor: subjectColor(subject.title) }}>{initials || 'T'}</span>;
}

const summary = (subject: Subject) => `${subject.videoIds.length} ${subject.videoIds.length === 1 ? 'vídeo' : 'vídeos'} · ${formatSpan(subject.totalMs) || '0:00'}`;

/** The themes of the library, ready to be dragged onto a day. */
export function ThemeTray({ subjects }: { subjects: Subject[] }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => subjects.filter(subject => normalize(subject.title).includes(normalize(query))), [subjects, query]);
  return <section aria-label="Assuntos do acervo" className="ops-card grid gap-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 flex items-center gap-2 text-base font-extrabold tracking-[-0.01em] text-[#12332c]"><Layers aria-hidden="true" className="size-4" /> Assuntos do acervo <span className="text-sm font-normal tracking-normal text-muted-foreground">· arraste para um dia</span></h2>
      <label className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Buscar assunto" className="h-9 w-56 pl-8" onChange={event => setQuery(event.target.value)} placeholder="Buscar assunto" value={query} />
      </label>
    </div>
    {shown.length === 0
      ? <p className="m-0 py-3 text-sm text-muted-foreground">{subjects.length === 0 ? 'Ainda não há assuntos no acervo. Crie em Biblioteca.' : 'Nenhum assunto encontrado.'}</p>
      : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shown.map(subject => <li className="shrink-0" key={subject.id}><TrayCard subject={subject} /></li>)}</ul>}
  </section>;
}

function TrayCard({ subject }: { subject: Subject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `theme:${subject.id}`, data: { subject } });
  return <div className={cn('flex w-60 items-center gap-2.5 rounded-[0.875rem] border border-[#dfe6e3] bg-white p-2 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-[#12332c] hover:shadow-[0_10px_24px_-14px_rgb(18_51_44/0.45)] motion-reduce:hover:translate-y-0', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o assunto ${subject.title}`} className="grid size-7 min-h-0 shrink-0 cursor-grab touch-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    <Cover className="size-10" subject={subject} />
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="truncate text-[0.8125rem] leading-tight" title={themeLabel(subject)}>{subject.title}</strong>
      <span className="text-xs text-muted-foreground">{subject.option ? `${subject.option} · ` : ''}{summary(subject)}</span>
    </div>
  </div>;
}

/**
 * One day, whole: the theme dropped on it, its videos (read only, in a box that scrolls) and the games that come with
 * it, highlighted. Videos and games are changed in the theme editor, never here.
 */
export function DayBox({ dayIndex, subject, themes, catalog, videoIds, gameIds, onChoose, onClear, canEditThemes = true }: {
  dayIndex: number; subject: Subject | undefined; themes: Subject[]; catalog: Catalog; videoIds: string[]; gameIds: string[];
  onChoose: (title: string) => void; onClear: () => void; canEditThemes?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(dayIndex) });
  const frame = cn('grid content-start gap-2 rounded-[0.875rem] border p-2 transition-colors', isOver ? 'border-[#12332c] bg-[#fff3cf] ring-2 ring-[#ffd166]' : 'border-[#dfe6e3] bg-white');
  const chooser = <select aria-label={`Assunto do dia ${dayIndex + 1}`} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" onChange={event => onChoose(event.target.value)} value={subject?.id ?? ''}>
    <option value="">{subject ? 'Trocar assunto' : 'Escolher assunto'}</option>
    {themes.map(item => <option key={item.id} value={item.id}>{themeLabel(item)}</option>)}
  </select>;
  if (!subject && videoIds.length === 0) {
    return <div className={cn(frame, 'min-h-40 place-content-center border-dashed text-center')} ref={setNodeRef}>
      <Layers aria-hidden="true" className="mx-auto size-6 text-muted-foreground" />
      <p className="m-0 text-xs text-muted-foreground">Arraste um assunto para este dia</p>
      {chooser}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
    {subject
      ? <div className="flex items-center gap-2.5">
        <Cover className="size-11" subject={subject} />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={themeLabel(subject)}>{subject.title}{subject.option ? <span className="ml-1 font-normal text-muted-foreground">· {subject.option}</span> : null}</strong>
          {canEditThemes && <a className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-primary hover:underline" href={`/platform/courses/${subject.id}/edit`} rel="noreferrer" target="_blank">
            Editar vídeos e jogos <ExternalLink aria-hidden="true" className="size-3" />
          </a>}
        </div>
        <button aria-label={`Tirar o assunto do dia ${dayIndex + 1}`} className="grid size-7 min-h-0 shrink-0 place-items-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-muted" onClick={onClear} type="button"><X className="size-4" /></button>
      </div>
      : <p className="m-0 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">Vídeos vindos de uma importação. Arraste um assunto para trocar.</p>}

    <div aria-label={`Conteúdo do dia ${dayIndex + 1}`} className="grid max-h-72 gap-1 overflow-y-auto pr-0.5" role="group">
      <ol className="m-0 grid list-none gap-1 p-0">
        {videoIds.map((id, index) => {
          const video = catalog.videos.get(id);
          return <li className="flex items-center gap-2 rounded-lg bg-[#eef2f0] px-2 py-1.5" key={id}>
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-[#12332c] text-[0.6875rem] font-bold text-white">{index + 1}</span>
            <span className="min-w-0 flex-1 text-xs leading-snug font-medium [overflow-wrap:anywhere]">{video?.title ?? 'Vídeo removido do catálogo'}</span>
            {video && <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">{formatClock(video.durationMs)}</span>}
          </li>;
        })}
      </ol>
      {gameIds.length > 0 && <ul aria-label="Jogos do dia" className="m-0 mt-1 grid list-none gap-1 p-0">
        {gameIds.map(id => <li className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning-soft px-2 py-1.5 text-warning" key={id}>
          <Gamepad2 aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 text-xs leading-snug font-semibold [overflow-wrap:anywhere]">{catalog.games.get(id)?.title ?? 'Jogo removido'}</span>
          <span className="shrink-0 rounded bg-warning/15 px-1.5 text-[0.625rem] font-bold tracking-wide uppercase">Jogo</span>
        </li>)}
      </ul>}
    </div>
    {chooser}
  </div>;
}
