import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { extrasSuffix } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import { partWord } from '@/trainings/partWord';
import {
  addDays, dayDuration, dayVideoCounts, formatClock, isGenericDayTitle, maxDays, maxVideoRows, newDay, shortDate, subjectColor, themeOfDay, withDayWord,
  type Catalog, type CatalogVideo, type DaySlots, type Subject,
} from './model';
import { DayBox, DragPreview, dropId, ThemeTray } from './ThemeCards';
import './builder.css';

export { subjectColor };

/**
 * The carried card is smaller than what was grabbed (a whole Título bar is far wider), and it starts at the grabbed
 * element's top-left corner: grabbed from the middle, the card would trail far from the pointer. This keeps the card's
 * icon under the pointer wherever the bar was grabbed. The keyboard has no pointer, so it keeps the plain movement.
 */
const pointerGrip = 28;
const followPointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const pointer = activatorEvent && draggingNodeRect ? getEventCoordinates(activatorEvent) : null;
  if (!pointer || !draggingNodeRect || activatorEvent instanceof KeyboardEvent) {
    return transform;
  }
  return {
    ...transform,
    x: transform.x + pointer.x - draggingNodeRect.left - pointerGrip,
    y: transform.y + pointer.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

/**
 * Phone (up to 760px): the columns would be too thin to read, so the days stack one below the other, each one a card of
 * its own (head, content, time). The board keeps its DOM: `--order` puts every cell back under its day. Fields use 16px
 * type (iOS zooms the page on focus below that) and every control is at least 44px tall.
 */
const phoneCell = 'max-[760px]:order-(--order) max-[760px]:min-w-0 max-[760px]:border-r-0 max-[760px]:[animation-name:builder-col-up]!';
const phoneField = 'max-[760px]:h-11 max-[760px]:min-h-11 max-[760px]:w-full max-[760px]:px-3 max-[760px]:text-base';

const filled = (items: (string | null)[]) => items.filter((id): id is string => !!id);

/**
 * The planner board: one column per day, and each day is one box. A theme is dragged into the box and brings its
 * videos and games; the box only shows them. Changing the content of a day is done in the theme editor. A last
 * column adds a day.
 */
export default function BuilderGrid({ days, catalog, onChange, onRemoveDay, issues, onUpload, onSendToDay, onEdit, arriving, canEditThemes = true, canCustomizeGrid = false, locked = false, readOnly = false, undated = false }: {
  /** A template: its days carry no date (they are "Dia 1, Dia 2…"); the dates come when a company makes its training from it. */
  undated?: boolean;
  /** Opens this training in the video editor, the same as "Editar treinamento" in the top bar; a pencil on each day. */
  onEdit?: () => void;
  /** The days came whole from a ready SIPAT (Bronze): their videos stay as they are, and no day is added or taken out. */
  locked?: boolean;
  /** Nothing can be changed: the company only views what the operation built. */
  readOnly?: boolean;
  days: DaySlots[]; catalog: Catalog; onChange: (days: DaySlots[]) => void; canEditThemes?: boolean;
  /** Opens the sending of videos (who may send them); the list above the days shows the button. */
  onUpload?: () => void;
  /** Sends videos to a day (by its key): they join the company's videos and come onto that day when ready. */
  onSendToDay?: (dayKey: string, files: File[]) => void;
  /** What is on its way to each day, by its key. */
  arriving?: Map<string, { id: string; title: string; status: string }[]>;
  /** The plan personalizes the grid (Prata and above): standalone videos go onto the days one by one. */
  canCustomizeGrid?: boolean;
  /** Removes a day; the page offers to undo it. Without it the day is simply dropped. */
  onRemoveDay?: (index: number) => void;
  /** What is missing on each day, by position; shown on the day itself. */
  issues?: Record<number, string[]>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // set by "+ Dia" only: a day put back with undo returns to its own place and must not pull the grid to the end
  const addedAtEnd = useRef(false);
  // personalized grid: the assuntos of the videos are only filters; Bronze picks a ready training per day
  const themes = canCustomizeGrid ? (catalog.filters ?? []) : catalog.subjects.filter(subject => subject.id !== 'none');
  const canAddDay = days.length < maxDays && !locked;
  // "Dia" when the training has dates, "Módulo" when none of its parts has one
  const word = undated ? 'Dia' : partWord(days.map(day => day.date));
  const lower = word.toLowerCase();
  // up to 7 days always fit the width of the page, however many there are; beyond that the days keep a minimum width and scroll
  const fits = days.length <= 7;
  const layout = { '--columns': `repeat(${days.length}, ${fits ? 'minmax(0, 1fr)' : 'minmax(11rem, 1fr)'})${canAddDay ? ' 4.5rem' : ''}` } as CSSProperties;

  // a day just added scrolls into view
  useEffect(() => {
    if (!addedAtEnd.current) return;
    addedAtEnd.current = false;
    scroller.current?.scrollTo?.({ left: scroller.current.scrollWidth, behavior: 'smooth' });
  }, [days.length]);

  // every change keeps the untyped names in step with the word: a date set turns "Módulo 2" into "Dia 2"
  const change = (next: DaySlots[]) => onChange(withDayWord(next, undated ? 'Dia' : partWord(next.map(day => day.date))));
  const patchDay = (index: number, patch: Partial<DaySlots>) => change(days.map((day, position) => (position === index ? { ...day, ...patch } : day)));
  const addDay = () => {
    const last = days[days.length - 1];
    addedAtEnd.current = true;
    change([...days, newDay(days.length, last?.date ? addDays(last.date, 1) : '')]);
  };
  const removeDay = (index: number) => (onRemoveDay ? onRemoveDay(index) : onChange(days.filter((_, position) => position !== index)));

  /** A theme brings its videos (in its order), its games and, when the day still has the default title, its name. */
  const applyTheme = (index: number, themeId: string) => {
    const subject = themes.find(item => item.id === themeId);
    if (!subject) { patchDay(index, canCustomizeGrid ? { subject: '' } : { subject: '', videos: [], games: [] }); return; }
    const day = days[index];
    // the assunto is a filter of the videos: the operator picks them one by one (Bronze still takes the ready set)
    if (canCustomizeGrid) { patchDay(index, { subject: subject.title }); return; }
    const generic = !day.title.trim() || /^Dia [0-9]+$/.test(day.title.trim());
    patchDay(index, {
      subject: subject.title, videos: subject.videoIds.slice(0, maxVideoRows), games: subject.gameIds,
      ...(generic ? { title: subject.title } : {}),
    });
  };
  /** A standalone video dropped on a day joins its videos (once), up to the limit of the day. */
  const addVideo = (index: number, videoId: string) => {
    const current = filled(days[index].videos);
    if (current.includes(videoId) || current.length >= maxVideoRows) return;
    patchDay(index, { videos: [...current, videoId] });
  };
  // where each video already is, shown on its card in the list
  const usedIn = useMemo(() => {
    const places = new Map<string, string>();
    days.forEach((day, index) => filled(day.videos).forEach(id => { if (!places.has(id)) places.set(id, `${word} ${index + 1}`); }));
    return places;
  }, [days, word]);
  const looseVideos = useMemo(() => [...catalog.videos.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [catalog]);
  // what is being dragged rides under the pointer until it is dropped
  const [carried, setCarried] = useState<{ video?: CatalogVideo; subject?: Subject } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragStart = ({ active }: DragStartEvent) => setCarried((active.data.current as typeof carried) ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setCarried(null);
    const subject = active.data.current?.subject as { id: string } | undefined;
    const video = active.data.current?.video as { id: string } | undefined;
    const target = typeof over?.id === 'string' ? days.findIndex((_, index) => dropId(index) === over.id) : -1;
    if (target < 0) return;
    if (subject) applyTheme(target, subject.id);
    else if (video && canCustomizeGrid) addVideo(target, video.id);
  };
  const column = (index: number, order: number): CSSProperties => ({ '--i': index, '--order': order } as CSSProperties);

  return <DndContext onDragCancel={() => setCarried(null)} onDragEnd={onDragEnd} onDragStart={onDragStart} sensors={sensors}>
    <DragOverlay modifiers={[followPointer]} dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>{carried && <DragPreview data={carried} />}</DragOverlay>
    <div className="grid gap-4">
      {!locked && <ThemeTray canCustomizeGrid={canCustomizeGrid} canEditThemes={canEditThemes} onUpload={onUpload} subjects={themes}
        usedIn={canCustomizeGrid ? usedIn : undefined} videos={looseVideos} />}
      <div className="builder-board-card ops-card overflow-hidden max-[760px]:overflow-visible max-[760px]:border-0! max-[760px]:bg-transparent! max-[760px]:shadow-none">
        <div className="builder-board-scroller overflow-x-auto max-[760px]:overflow-visible" ref={scroller}>
          <div className="builder-board grid min-w-full [grid-template-columns:var(--columns)] max-[760px]:flex max-[760px]:flex-col" role="table" style={layout}>
            {days.map((day, index) => {
              const color = subjectColor(day.subject);
              const dayIssues = issues?.[index];
              return <div className={cn('builder-col grid content-start gap-2 border-r border-b border-border p-3', phoneCell, 'max-[760px]:mt-4 max-[760px]:gap-3 max-[760px]:border max-[760px]:border-b-0 max-[760px]:rounded-t-2xl max-[760px]:px-4 max-[760px]:py-3 max-[760px]:first:mt-0', dayIssues ? 'bg-destructive-soft' : 'max-[760px]:bg-card')}
                data-day-issue={dayIssues ? true : undefined} data-part="head" key={`head-${day.key}`} role="columnheader"
                style={{ ...column(index, index * 3), borderTop: `4px solid ${dayIssues ? 'var(--color-destructive)' : color}`, gridColumn: index + 1, gridRow: 1 }}>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="rounded-full px-2.5 py-0.5 text-xs max-[760px]:px-3 max-[760px]:py-1 max-[760px]:tracking-[0.04em] font-extrabold tracking-wide text-white" style={{ backgroundColor: color }}>{word.toUpperCase()} {index + 1}</span>
                  {/* the date field shows day/month; only the weekday is added here. The time of the day lives in the column footer. */}
                  <span className="mr-auto text-xs font-semibold text-muted-foreground capitalize max-[760px]:text-[0.9375rem] max-[760px]:text-foreground">{shortDate(day.date).split(' ')[0]}</span>
                  {/* the same "Editar treinamento" of the top bar, at hand on each day */}
                  {onEdit && <Button aria-label={`Editar treinamento a partir do ${lower} ${index + 1}`} className="max-[760px]:hidden" onClick={onEdit} size="icon-sm" title="Editar treinamento" variant="ghost"><Pencil /></Button>}
                  <Button aria-label={`Remover o ${lower} ${index + 1}`} className="max-[760px]:-my-1.5 max-[760px]:-mr-2.5 max-[760px]:size-11 max-[760px]:min-h-11" disabled={days.length === 1} hidden={locked} onClick={() => removeDay(index)} size="icon-sm" variant="ghost"><Trash2 /></Button>
                </div>
                {!undated && <Input aria-label={`Data do ${lower} ${index + 1}`} disabled={readOnly} className={cn('h-9 min-w-0 px-2 text-sm', phoneField)} onChange={event => patchDay(index, { date: event.target.value })} type="date" value={day.date} />}
                <Input aria-describedby={dayIssues ? `day-issues-${day.key}` : undefined} aria-invalid={!!dayIssues && !day.title.trim()}
                  disabled={readOnly} aria-label={`Título do ${lower} ${index + 1}`} className={cn('font-medium', phoneField)} maxLength={160}
                  onChange={event => patchDay(index, { title: event.target.value })} placeholder={`Slogan do ${lower}`}
                  value={isGenericDayTitle(day.title) && day.title.trim() ? `${word} ${index + 1}` : day.title} />
                {dayIssues && <ul className="m-0 grid list-none gap-0.5 p-0 text-xs font-semibold text-destructive" id={`day-issues-${day.key}`}>
                  {dayIssues.map(text => <li key={text}>{text}</li>)}
                </ul>}
              </div>;
            })}

            {days.map((day, index) => {
              const subject = themeOfDay(themes, day);
              return <Cell index={index} key={`box-${day.key}`} order={index * 3 + 1} row={2}>
                <DayBox canCustomizeGrid={canCustomizeGrid} canEditThemes={canEditThemes} catalog={catalog} dayIndex={index} locked={locked}
                  onVideos={videoIds => patchDay(index, { videos: videoIds })} gameIds={filled(day.games)} onChoose={themeId => applyTheme(index, themeId)}
                  onClear={() => applyTheme(index, '')} subject={subject} themes={themes} videoIds={filled(day.videos)}
                  arriving={arriving?.get(day.key)} onSend={onSendToDay && !readOnly ? files => onSendToDay(day.key, files) : undefined} />
              </Cell>;
            })}

            {days.map((day, index) => {
              const counts = dayVideoCounts(filled(day.videos), catalog);
              return <div className={cn('builder-col flex items-baseline justify-between gap-2 border-r border-border bg-muted px-4 py-3', phoneCell, 'max-[760px]:grid max-[760px]:grid-cols-[minmax(0,1fr)_auto] max-[760px]:items-center max-[760px]:gap-x-3 max-[760px]:gap-y-0 max-[760px]:border max-[760px]:rounded-b-2xl max-[760px]:pt-2.5 max-[760px]:pb-3')} data-part="time" key={`time-${day.key}`} style={{ ...column(index, index * 3 + 2), gridColumn: index + 1, gridRow: 3 }}>
                <span aria-hidden="true" className="hidden text-[0.6875rem] font-bold tracking-[0.06em] text-muted-foreground uppercase max-[760px]:col-start-1 max-[760px]:block">Tempo total</span>
                <span className="text-xl font-extrabold tabular-nums text-foreground max-[760px]:col-start-1 max-[760px]:text-[1.375rem] max-[760px]:leading-tight">{formatClock(dayDuration(day, catalog))}</span>
                <span className="text-xs text-muted-foreground max-[760px]:col-start-2 max-[760px]:row-span-2 max-[760px]:row-start-1 max-[760px]:text-sm">{`${counts.house} ${counts.house === 1 ? 'vídeo' : 'vídeos'}${extrasSuffix(counts.extras)}`}</span>
              </div>;
            })}

            {canAddDay && <button aria-label="Adicionar dia" className="builder-add-day group flex flex-col items-center justify-center gap-2 border-l border-dashed border-border bg-muted/30 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-[760px]:order-[99999] max-[760px]:mt-4 max-[760px]:min-h-14 max-[760px]:flex-row max-[760px]:gap-2.5 max-[760px]:rounded-2xl max-[760px]:border-[1.5px] max-[760px]:border-dashed max-[760px]:border-primary/55 max-[760px]:bg-transparent max-[760px]:font-bold max-[760px]:text-primary max-[760px]:transition-[background-color,color,transform] max-[760px]:duration-150 max-[760px]:ease-out max-[760px]:motion-safe:active:scale-[0.98]"
              onClick={addDay} style={{ gridColumn: days.length + 1, gridRow: '1 / span 3' }} type="button">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-full border-2 border-dashed border-current transition-transform group-hover:scale-110 max-[760px]:size-7 max-[760px]:border-solid"><Plus className="size-4" /></span>
              <span className="text-xs max-[760px]:text-base"><span className="max-[760px]:hidden">{word}</span><span className="hidden max-[760px]:inline">Adicionar {lower}</span></span>
            </button>}
          </div>
        </div>
      </div>
    </div>
  </DndContext>;
}

/** `order` puts the cell back under its own day when the phone stacks the days one below the other. */
function Cell({ children, index, order, row }: { children: ReactNode; index: number; order: number; row: number }) {
  return <div className={cn('builder-col min-w-0 border-r border-b border-border p-2', phoneCell, 'max-[760px]:border-x max-[760px]:border-b-0 max-[760px]:bg-card max-[760px]:px-4 max-[760px]:pt-0 max-[760px]:pb-4')} data-part="box" role="cell" style={{ '--i': index, '--order': order, gridColumn: index + 1, gridRow: row } as CSSProperties}>{children}</div>;
}
