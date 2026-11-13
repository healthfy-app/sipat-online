import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ExternalLink, GripVertical, Layers, Search, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatSpan, normalize, subjectColor, type Subject } from './model';

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
  return <section aria-label="Temas do acervo" className="grid gap-2 rounded-2xl border border-border bg-card p-3 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 flex items-center gap-2 text-sm font-semibold"><Layers aria-hidden="true" className="size-4" /> Temas do acervo <span className="font-normal text-muted-foreground">· arraste para um dia</span></h2>
      <label className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label="Buscar tema" className="h-9 w-56 pl-8" onChange={event => setQuery(event.target.value)} placeholder="Buscar tema" value={query} />
      </label>
    </div>
    {shown.length === 0
      ? <p className="m-0 py-3 text-sm text-muted-foreground">{subjects.length === 0 ? 'Ainda não há temas no acervo. Crie em Biblioteca.' : 'Nenhum tema encontrado.'}</p>
      : <ul className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">{shown.map(subject => <li className="shrink-0" key={subject.id}><TrayCard subject={subject} /></li>)}</ul>}
  </section>;
}

function TrayCard({ subject }: { subject: Subject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `theme:${subject.id}`, data: { subject } });
  return <div className={cn('flex w-60 items-center gap-2.5 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-card-hover', isDragging && 'opacity-40')} ref={setNodeRef}>
    <button aria-label={`Arrastar o tema ${subject.title}`} className="grid size-7 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing" type="button" {...attributes} {...listeners}><GripVertical className="size-4" /></button>
    <Cover className="size-10" subject={subject} />
    <div className="grid min-w-0 flex-1 gap-0.5">
      <strong className="truncate text-[0.8125rem] leading-tight" title={subject.title}>{subject.title}</strong>
      <span className="text-xs text-muted-foreground">{summary(subject)}</span>
    </div>
  </div>;
}

/** The card of the theme chosen for a day; it is also where a theme can be dropped. */
export function ThemeSlot({ dayIndex, subject, subjects, hasVideosOutsideTheme, onChoose, onClear }: {
  dayIndex: number; subject: Subject | undefined; subjects: Subject[]; hasVideosOutsideTheme: boolean;
  onChoose: (title: string) => void; onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId(dayIndex) });
  const frame = cn('grid gap-2 rounded-xl border p-2 transition-colors', isOver ? 'border-primary bg-accent ring-2 ring-primary/40' : 'border-border bg-card');
  const chooser: ReactNode = <select aria-label={`Tema do dia ${dayIndex + 1}`} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" onChange={event => onChoose(event.target.value)} value={subject?.title ?? ''}>
    <option value="">{subject ? 'Trocar tema' : 'Escolher tema'}</option>
    {subjects.map(item => <option key={item.id} value={item.title}>{item.title}</option>)}
  </select>;
  if (!subject) {
    return <div className={cn(frame, 'border-dashed')} ref={setNodeRef}>
      <p className="m-0 px-1 pt-1 text-center text-xs text-muted-foreground">Arraste um tema aqui</p>
      {chooser}
    </div>;
  }
  return <div className={frame} ref={setNodeRef}>
    <div className="flex items-center gap-2.5">
      <Cover className="size-11" subject={subject} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <strong className="line-clamp-2 text-[0.8125rem] leading-tight" title={subject.title}>{subject.title}</strong>
        <span className="text-xs text-muted-foreground">{summary(subject)}{hasVideosOutsideTheme && ' · ajustado'}</span>
      </div>
      <button aria-label={`Tirar o tema do dia ${dayIndex + 1}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted" onClick={onClear} type="button"><X className="size-4" /></button>
    </div>
    <a className="inline-flex items-center gap-1 justify-self-start text-xs font-semibold text-primary hover:underline" href={`/platform/courses/${subject.id}/edit`} rel="noreferrer" target="_blank">
      Abrir editor <ExternalLink aria-hidden="true" className="size-3" />
    </a>
    {chooser}
  </div>;
}
