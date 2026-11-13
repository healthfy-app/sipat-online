import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  addDays, dayDuration, formatClock, formatSpan, maxDays, maxVideoRows, newDay, normalize, shortDate, subjectColor,
  type Catalog, type DaySlots,
} from './model';
import { DayBox, dropId, ThemeTray } from './ThemeCards';
import './builder.css';

export { subjectColor };

const filled = (items: (string | null)[]) => items.filter((id): id is string => !!id);

/**
 * The planner board: one column per day, and each day is one box. A theme is dragged into the box and brings its
 * videos and games; the box only shows them. Changing the content of a day is done in the theme editor. A last
 * column adds a day.
 */
export default function BuilderGrid({ days, catalog, onChange }: {
  days: DaySlots[]; catalog: Catalog; onChange: (days: DaySlots[]) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const previousCount = useRef(days.length);
  const themes = catalog.subjects.filter(subject => subject.id !== 'none');
  const canAddDay = days.length < maxDays;
  // up to 7 days always fit the width of the page, however many there are; beyond that the days keep a minimum width and scroll
  const fits = days.length <= 7;
  const layout = { '--columns': `repeat(${days.length}, ${fits ? 'minmax(0, 1fr)' : 'minmax(11rem, 1fr)'})${canAddDay ? ' 4.5rem' : ''}` } as CSSProperties;

  // a day just added scrolls into view
  useEffect(() => {
    if (days.length > previousCount.current) scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'smooth' });
    previousCount.current = days.length;
  }, [days.length]);

  const patchDay = (index: number, patch: Partial<DaySlots>) => onChange(days.map((day, position) => (position === index ? { ...day, ...patch } : day)));
  const addDay = () => {
    const last = days[days.length - 1];
    onChange([...days, newDay(days.length, last?.date ? addDays(last.date, 1) : '')]);
  };
  const removeDay = (index: number) => onChange(days.filter((_, position) => position !== index));

  /** A theme brings its videos (in its order), its games and, when the day still has the default title, its name. */
  const applyTheme = (index: number, title: string) => {
    const subject = themes.find(item => item.title === title);
    if (!subject) { patchDay(index, { subject: '', videos: [], games: [] }); return; }
    const day = days[index];
    const generic = !day.title.trim() || /^Dia [0-9]+$/.test(day.title.trim());
    patchDay(index, {
      subject: subject.title, videos: subject.videoIds.slice(0, maxVideoRows), games: subject.gameIds,
      ...(generic ? { title: subject.title } : {}),
    });
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
            {days.map((day, index) => {
              const color = subjectColor(day.subject);
              const time = dayDuration(day, catalog);
              return <div className="builder-col grid content-start gap-2 border-r border-b border-border p-3" key={`head-${day.key}`} role="columnheader" style={{ ...column(index), borderTop: `4px solid ${color}`, gridColumn: index + 1, gridRow: 1 }}>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="rounded-md px-2 py-0.5 text-xs font-bold tracking-wide text-white" style={{ backgroundColor: color }}>DIA {index + 1}</span>
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground tabular-nums"><Clock aria-hidden="true" className="size-3.5" />{time > 0 ? formatSpan(time) : 'sem vídeos'}</span>
                  <Button aria-label={`Remover o dia ${index + 1}`} disabled={days.length === 1} onClick={() => removeDay(index)} size="icon-sm" variant="ghost"><Trash2 /></Button>
                </div>
                <div className="grid items-center gap-1">
                  <Input aria-label={`Data do dia ${index + 1}`} className="h-9 min-w-0 px-2 text-sm" onChange={event => patchDay(index, { date: event.target.value })} type="date" value={day.date} />
                  <span className="text-xs font-medium text-muted-foreground capitalize">{shortDate(day.date)}</span>
                </div>
                <Input aria-label={`Título do dia ${index + 1}`} className="font-medium" maxLength={160}
                  onChange={event => patchDay(index, { title: event.target.value })} placeholder="Tema ou slogan do dia" value={day.title} />
              </div>;
            })}

            {days.map((day, index) => {
              const subject = themes.find(item => normalize(item.title) === normalize(day.subject));
              return <Cell index={index} key={`box-${day.key}`} row={2}>
                <DayBox catalog={catalog} dayIndex={index} gameIds={filled(day.games)} onChoose={title => applyTheme(index, title)}
                  onClear={() => applyTheme(index, '')} subject={subject} themes={themes} videoIds={filled(day.videos)} />
              </Cell>;
            })}

            {days.map((day, index) => {
              const count = filled(day.videos).length;
              return <div className="builder-col flex items-baseline justify-between gap-2 border-r border-border bg-primary/5 px-4 py-3" key={`time-${day.key}`} style={{ ...column(index), gridColumn: index + 1, gridRow: 3 }}>
                <span className="text-xl font-semibold tabular-nums">{formatClock(dayDuration(day, catalog))}</span>
                <span className="text-xs text-muted-foreground">{count} {count === 1 ? 'vídeo' : 'vídeos'}</span>
              </div>;
            })}

            {canAddDay && <button aria-label="Adicionar dia" className="builder-add-day group flex flex-col items-center justify-center gap-2 border-l border-dashed border-border bg-muted/30 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              onClick={addDay} style={{ gridColumn: days.length + 1, gridRow: '1 / span 3' }} type="button">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110"><Plus className="size-4" /></span>
              <span className="text-xs">Dia</span>
            </button>}
          </div>
        </div>
      </div>
    </div>
  </DndContext>;
}

function Cell({ children, index, row }: { children: ReactNode; index: number; row: number }) {
  return <div className={cn('builder-col min-w-0 border-r border-b border-border p-2')} role="cell" style={{ '--i': index, gridColumn: index + 1, gridRow: row } as CSSProperties}>{children}</div>;
}
