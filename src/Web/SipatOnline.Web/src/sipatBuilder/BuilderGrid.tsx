import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ArrowDown, ArrowUp, Clock, Film, Gamepad2, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { PickTarget } from './ContentPicker';
import {
  addDays, dayDuration, formatClock, formatSpan, maxDays, maxGameRows, maxVideoRows, newDay, normalize, shortDate,
  type Catalog, type DaySlots,
  subjectColor,
} from './model';
import { dropId, ThemeSlot, ThemeTray } from './ThemeCards';
import './builder.css';

export { subjectColor };

type Kind = 'videos' | 'games';
const lastFilled = (days: DaySlots[], kind: Kind) =>
  Math.max(-1, ...days.map(day => day[kind].reduce((last, id, index) => (id ? index : last), -1)));

/** Pads a slot list so the slot being written exists. */
function withSlot(items: (string | null)[], slot: number, value: string | null) {
  const next = [...items];
  while (next.length <= slot) next.push(null);
  next[slot] = value;
  return next;
}

/**
 * The planner board: one column per day, and rows that grow with the content. It shows the filled rows plus one
 * empty one (filling it opens the next), so a fresh plan is short and a full one is complete. A last column adds a
 * day. Cells open the content picker; dates, titles and subjects are edited in place.
 */
export default function BuilderGrid({ days, catalog, onChange, onPick }: {
  days: DaySlots[]; catalog: Catalog; onChange: (days: DaySlots[]) => void; onPick: (target: PickTarget) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const previousCount = useRef(days.length);
  const videoRows = Math.min(maxVideoRows, Math.max(3, lastFilled(days, 'videos') + 2));
  const gameRows = Math.min(maxGameRows, Math.max(1, lastFilled(days, 'games') + 2));
  const totalRows = 2 + videoRows + gameRows + 1;
  const themes = catalog.subjects.filter(subject => subject.id !== 'none');
  const canAddDay = days.length < maxDays;
  const layout = {
    '--columns': `8.5rem repeat(${days.length}, minmax(16rem, 1fr))${canAddDay ? ' 7rem' : ''}`,
    gridTemplateRows: `repeat(${totalRows}, auto)`,
  } as CSSProperties;

  // a day just added scrolls into view
  useEffect(() => {
    if (days.length > previousCount.current) scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'smooth' });
    previousCount.current = days.length;
  }, [days.length]);

  const patchDay = (index: number, patch: Partial<DaySlots>) => onChange(days.map((day, position) => (position === index ? { ...day, ...patch } : day)));
  const setSlot = (index: number, kind: Kind, slot: number, value: string | null) => patchDay(index, { [kind]: withSlot(days[index][kind], slot, value) });
  const moveSlot = (index: number, kind: Kind, slot: number, direction: -1 | 1) => {
    const items = withSlot(days[index][kind], slot + direction, days[index][kind][slot + direction] ?? null);
    const target = slot + direction;
    if (target < 0) return;
    [items[slot], items[target]] = [items[target], items[slot]];
    patchDay(index, { [kind]: items });
  };
  const addDay = () => {
    const last = days[days.length - 1];
    onChange([...days, newDay(days.length, last?.date ? addDays(last.date, 1) : '')]);
  };
  const removeDay = (index: number) => onChange(days.filter((_, position) => position !== index));
  /** A theme brings its videos (in its order) and, when the day still has the default title, its name. */
  const applyTheme = (index: number, title: string) => {
    const subject = catalog.subjects.find(item => item.id !== 'none' && item.title === title);
    if (!subject) { patchDay(index, { subject: '' }); return; }
    const day = days[index];
    const generic = !day.title.trim() || /^Dia [0-9]+$/.test(day.title.trim());
    patchDay(index, { subject: subject.title, videos: subject.videoIds.slice(0, maxVideoRows), ...(generic ? { title: subject.title } : {}) });
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const subject = active.data.current?.subject as { title: string } | undefined;
    const target = typeof over?.id === 'string' ? days.findIndex((_, index) => dropId(index) === over.id) : -1;
    if (subject && target >= 0) applyTheme(target, subject.title);
  };

  const column = (index: number): CSSProperties => ({ '--i': index } as CSSProperties);

  return <DndContext onDragEnd={onDragEnd} sensors={sensors}>
  <div className="grid gap-4">
  <ThemeTray subjects={themes} />
  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
    <div className="overflow-x-auto" ref={scroller}>
      <div className="grid min-w-full [grid-template-columns:var(--columns)]" role="table" style={layout}>
        {/* day headers */}
        <Label className="items-end pb-3">Dia</Label>
        {days.map((day, index) => {
          const color = subjectColor(day.subject);
          const minutes = dayDuration(day, catalog);
          return <div className="builder-col grid content-start gap-2 border-r border-b border-border p-3" key={day.key} role="columnheader" style={{ ...column(index), borderTop: `4px solid ${color}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-md px-2 py-0.5 text-xs font-bold tracking-wide text-white" style={{ backgroundColor: color }}>DIA {index + 1}</span>
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground tabular-nums"><Clock aria-hidden="true" className="size-3.5" />{minutes > 0 ? formatSpan(minutes) : 'sem vídeos'}</span>
              <Button aria-label={`Remover o dia ${index + 1}`} disabled={days.length === 1} onClick={() => removeDay(index)} size="icon-sm" variant="ghost"><Trash2 /></Button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <Input aria-label={`Data do dia ${index + 1}`} className="h-9 px-2 text-sm" onChange={event => patchDay(index, { date: event.target.value })} type="date" value={day.date} />
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground capitalize">{shortDate(day.date)}</span>
            </div>
            <Input aria-label={`Título do dia ${index + 1}`} className="font-medium" maxLength={160}
              onChange={event => patchDay(index, { title: event.target.value })} placeholder="Tema ou slogan do dia" value={day.title} />
          </div>;
        })}
        {canAddDay && <button aria-label="Adicionar dia" className="builder-add-day group row-[1/-1] flex flex-col items-center justify-center gap-2 border-l border-dashed border-border bg-muted/30 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
          onClick={addDay} style={{ gridColumn: days.length + 2, gridRow: `1 / span ${totalRows}` }} type="button">
          <span aria-hidden="true" className="grid size-11 place-items-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110"><Plus className="size-5" /></span>
          Dia
        </button>}

        {/* theme */}
        <Label>Tema</Label>
        {days.map((day, index) => {
          const subject = catalog.subjects.find(item => item.id !== 'none' && normalize(item.title) === normalize(day.subject));
          const outside = subject ? day.videos.filter((id): id is string => !!id).some(id => !subject.videoIds.includes(id)) || day.videos.filter(Boolean).length !== subject.videoIds.length : false;
          return <div className="builder-col grid content-start border-r border-b border-border p-2.5" key={day.key} style={column(index)}>
            <ThemeSlot dayIndex={index} hasVideosOutsideTheme={outside} onChoose={title => applyTheme(index, title)} onClear={() => patchDay(index, { subject: '' })}
              subject={subject} subjects={themes} />
          </div>;
        })}

        {/* videos */}
        {Array.from({ length: videoRows }, (_, slot) => <Row key={`video-${slot}`}>
          <Label>Vídeo {slot + 1}</Label>
          {days.map((day, index) => {
            const id = day.videos[slot] ?? null;
            const video = id ? catalog.videos.get(id) : undefined;
            return <Cell index={index} key={day.key}>
              {id
                ? <Filled
                  canDown={slot < videoRows - 1} canUp={slot > 0}
                  icon={<Film className="size-3.5" />} meta={video ? formatClock(video.durationMs) : ''} name={`vídeo ${slot + 1} do dia ${index + 1}`}
                  onClear={() => setSlot(index, 'videos', slot, null)} onDown={() => moveSlot(index, 'videos', slot, 1)}
                  onOpen={() => onPick({ kind: 'video', dayIndex: index, slot })} onUp={() => moveSlot(index, 'videos', slot, -1)}
                  tag={video?.code} title={video?.title ?? 'Vídeo removido do catálogo'} />
                : <Empty label={`Escolher vídeo ${slot + 1} do dia ${index + 1}`} onClick={() => onPick({ kind: 'video', dayIndex: index, slot })}>Escolher vídeo</Empty>}
            </Cell>;
          })}
        </Row>)}

        {/* games */}
        {Array.from({ length: gameRows }, (_, slot) => <Row key={`game-${slot}`}>
          <Label className={slot === 0 ? 'bg-warning-soft text-warning' : ''}>{slot === 0 ? 'Jogos e quiz' : `Jogo ${slot + 1}`}</Label>
          {days.map((day, index) => {
            const id = day.games[slot] ?? null;
            const game = id ? catalog.games.get(id) : undefined;
            return <Cell index={index} key={day.key}>
              {id
                ? <Filled
                  canDown={slot < gameRows - 1} canUp={slot > 0}
                  icon={<Gamepad2 className="size-3.5" />} meta="" name={`jogo ${slot + 1} do dia ${index + 1}`}
                  onClear={() => setSlot(index, 'games', slot, null)} onDown={() => moveSlot(index, 'games', slot, 1)}
                  onOpen={() => onPick({ kind: 'game', dayIndex: index, slot })} onUp={() => moveSlot(index, 'games', slot, -1)}
                  title={game?.title ?? 'Jogo removido do catálogo'} warm />
                : <Empty label={`Escolher jogo ${slot + 1} do dia ${index + 1}`} onClick={() => onPick({ kind: 'game', dayIndex: index, slot })}>Escolher jogo ou quiz</Empty>}
            </Cell>;
          })}
        </Row>)}

        {/* time of the day */}
        <Label className="border-b-0 bg-primary/10 text-primary">Tempo do dia</Label>
        {days.map((day, index) => {
          const count = day.videos.filter(Boolean).length;
          return <div className="builder-col flex items-baseline justify-between gap-2 border-r border-border bg-primary/5 px-4 py-3" key={day.key} style={column(index)}>
            <span className="text-xl font-semibold tabular-nums">{formatClock(dayDuration(day, catalog))}</span>
            <span className="text-xs text-muted-foreground">{count} {count === 1 ? 'vídeo' : 'vídeos'}</span>
          </div>;
        })}
      </div>
    </div>
  </div>
  </div>
  </DndContext>;
}

/** Row label of the board, sticky so it stays visible while the days scroll sideways. */
function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('sticky left-0 z-10 flex items-center border-r border-b border-border bg-muted/80 px-3 py-2 text-[0.6875rem] font-bold tracking-[0.08em] text-muted-foreground uppercase backdrop-blur', className)}>{children}</div>;
}

/** Cells of one row share a `display: contents` wrapper so the grid keeps one row per slot. */
function Row({ children }: { children: ReactNode }) {
  return <div className="contents" role="row">{children}</div>;
}

function Cell({ children, index }: { children: ReactNode; index: number }) {
  return <div className="builder-col min-w-0 border-r border-b border-border p-2" role="cell" style={{ '--i': index } as CSSProperties}>{children}</div>;
}

function Empty({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="group flex min-h-16 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
    onClick={onClick} type="button"><Plus className="size-4" />{children}</button>;
}

function Filled({ title, tag, meta, icon, warm = false, name, canUp, canDown, onOpen, onClear, onUp, onDown }: {
  title: string; tag?: string | null; meta: string; icon: ReactNode; warm?: boolean; name: string;
  canUp: boolean; canDown: boolean; onOpen: () => void; onClear: () => void; onUp: () => void; onDown: () => void;
}) {
  return <div className={cn('builder-filled group relative flex min-h-16 items-stretch rounded-xl border bg-card transition-shadow hover:shadow-card-hover', warm ? 'border-warning/40 bg-warning-soft/50' : 'border-border')}>
    <button aria-label={`Trocar ${name}: ${title}`} className="flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-xl px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-ring" onClick={onOpen} type="button">
      <span className="line-clamp-2 text-[0.8125rem] leading-snug font-medium [overflow-wrap:anywhere]">{title}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}{tag && <span className="rounded bg-muted px-1.5 font-semibold tracking-wide">{tag}</span>}{meta && <span className="tabular-nums">{meta}</span>}
      </span>
    </button>
    <div className="flex flex-col justify-between py-1 pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
      <div className="flex">
        <Button aria-label={`Subir ${name}`} disabled={!canUp} onClick={onUp} size="icon-sm" variant="ghost"><ArrowUp /></Button>
        <Button aria-label={`Descer ${name}`} disabled={!canDown} onClick={onDown} size="icon-sm" variant="ghost"><ArrowDown /></Button>
      </div>
      <Button aria-label={`Tirar ${name}`} className="self-end" onClick={onClear} size="icon-sm" variant="ghost"><X /></Button>
    </div>
  </div>;
}
