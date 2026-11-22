import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A tooltip that follows the hovered or focused mark, inside a relatively positioned container. */
export function useHoverTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; value: string } | null>(null);

  const show = useCallback((target: Element, title: string, value: string) => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    const mark = target.getBoundingClientRect();
    const x = Math.min(Math.max(mark.left + mark.width / 2 - box.left, 70), Math.max(70, box.width - 70));
    setTip({ x, y: mark.top - box.top, title, value });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  const node = tip ? (
    <div
      className="pointer-events-none absolute z-10 grid -translate-x-1/2 -translate-y-full gap-0.5 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg"
      role="tooltip"
      style={{ left: tip.x, top: tip.y - 6 }}
    >
      <span className="font-medium opacity-80 first-letter:uppercase">{tip.title}</span>
      <strong className="tabular-nums">{tip.value}</strong>
    </div>
  ) : null;

  return { containerRef, show, hide, node };
}

/** A round top for an axis: 2, 4, then 1/2/2.5/5 × 10ⁿ, kept even so the middle tick is whole. */
export function niceMax(value: number): number {
  if (value <= 2) return 2;
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10].map((step) => step * magnitude);
  const nice = steps.find((step) => step >= value) ?? 10 * magnitude;
  return nice % 2 === 0 ? nice : nice * 2;
}

export interface ColumnPoint { key: string; label: string; longLabel: string; count: number }

/** Thin columns on a recessive grid, one per point, with a tooltip on hover or focus. */
export function ColumnChart({ points, color, unit, ariaLabel, height = 'h-40' }: {
  points: readonly ColumnPoint[]; color: string; unit: (count: number) => string; ariaLabel: string; height?: string;
}) {
  const tooltip = useHoverTooltip();
  const top = niceMax(Math.max(1, ...points.map((point) => point.count)));
  const ticks = [top, top / 2, 0];
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <div className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-2" ref={tooltip.containerRef}>
      <div aria-hidden="true" className={cn('grid content-between text-right text-[0.6875rem] tabular-nums text-muted-foreground', height)}>
        {ticks.map((tick) => <span className="-my-1.5 leading-3" key={tick}>{tick}</span>)}
      </div>
      <div className={cn('relative', height)}>
        <div aria-hidden="true" className="absolute inset-0 grid content-between">
          {ticks.map((tick) => <div className={cn('h-px', tick === 0 ? 'bg-border' : 'bg-border/50')} key={tick} />)}
        </div>
        <div aria-label={ariaLabel} className="absolute inset-0 flex items-end gap-0.5" role="img">
          {points.map((point) => (
            <div
              className="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
              key={point.key}
              onBlur={tooltip.hide}
              onFocus={(event) => tooltip.show(event.currentTarget, point.longLabel, unit(point.count))}
              onMouseEnter={(event) => tooltip.show(event.currentTarget, point.longLabel, unit(point.count))}
              onMouseLeave={tooltip.hide}
              tabIndex={0}
            >
              <div
                className="w-full max-w-7 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                style={{ backgroundColor: color, height: point.count === 0 ? 0 : `${Math.max(2, (point.count / top) * 100)}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <span />
      <div aria-hidden="true" className="mt-1.5 flex gap-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
        {points.map((point, index) => (
          <span className="min-w-0 flex-1 text-center" key={point.key}>{index % labelEvery === 0 ? point.label : ''}</span>
        ))}
      </div>
      {tooltip.node}
    </div>
  );
}

export interface DonutSlice { key: string; label: string; count: number; color: string }

/**
 * A donut: each slice an arc with a 2px gap of the surface between neighbours, the headline in the middle, a tooltip on
 * hover or focus. Identity is never color alone: the legend beside it names every slice with its count.
 */
export function Donut({ slices, center, caption, ariaLabel }: {
  slices: readonly DonutSlice[]; center: ReactNode; caption: string; ariaLabel: string;
}) {
  const tooltip = useHoverTooltip();
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // a 2px surface gap between slices, in the units of the 100×100 drawing
  const gap = slices.filter((slice) => slice.count > 0).length > 1 ? 1.6 : 0;
  let offset = 0;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-52" ref={tooltip.containerRef}>
      <svg aria-label={ariaLabel} className="size-full -rotate-90" role="img" viewBox="0 0 100 100">
        <circle className="stroke-muted" cx="50" cy="50" fill="none" r={radius} strokeWidth="12" />
        {total > 0 && slices.map((slice) => {
          if (slice.count === 0) return null;
          const length = (slice.count / total) * circumference;
          const dash = Math.max(0.5, length - gap);
          const arc = (
            <circle
              className="cursor-default outline-none transition-[stroke-width] hover:[stroke-width:14] focus-visible:[stroke-width:14]"
              cx="50" cy="50" fill="none" key={slice.key} r={radius} stroke={slice.color}
              strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} strokeWidth="12"
              onBlur={tooltip.hide}
              onFocus={(event) => tooltip.show(event.currentTarget, slice.label, `${slice.count} · ${Math.round((slice.count / total) * 100)}%`)}
              onMouseEnter={(event) => tooltip.show(event.currentTarget, slice.label, `${slice.count} · ${Math.round((slice.count / total) * 100)}%`)}
              onMouseLeave={tooltip.hide}
              tabIndex={0}
            />
          );
          offset += length;
          return arc;
        })}
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-content-center text-center">
        <strong className="text-3xl font-semibold tracking-tight tabular-nums">{center}</strong>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      {tooltip.node}
    </div>
  );
}
