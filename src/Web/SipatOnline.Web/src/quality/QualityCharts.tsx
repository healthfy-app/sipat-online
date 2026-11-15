import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPercent } from './qualityLabels';

interface Hour { hour: number; sessions: number; stalledSessions: number }

const width = 720;
const height = 160;
const baseline = 132;
const plotTop = 12;
const step = width / 24;

const hourText = (item: Hour) => `${item.hour}h: ${item.stalledSessions} de ${item.sessions} ${item.sessions === 1 ? 'sessão' : 'sessões'} com travamento`;

/** Barra = % das sessões da hora que travaram. Hora sem sessões fica sem barra. */
export function HourChart({ hours }: { hours: Hour[] }) {
  const byHour = new Map(hours.map(item => [item.hour, item]));
  const withSessions = hours.filter(item => item.sessions > 0);
  const max = Math.max(10, ...hours.filter(item => item.sessions > 0).map(item => item.stalledSessions * 100 / item.sessions));
  return (
    <div>
    <svg aria-hidden="true" className="h-auto w-full" viewBox={`0 0 ${width} ${height}`}>
      <line className="stroke-border" x1="0" x2={width} y1={baseline} y2={baseline} />
      <text className="fill-muted-foreground text-[10px]" x="0" y={plotTop - 2}>{formatPercent(max)}</text>
      {Array.from({ length: 24 }, (_, hour) => {
        const item = byHour.get(hour);
        const x = hour * step;
        const percent = item && item.sessions > 0 ? item.stalledSessions * 100 / item.sessions : null;
        const barHeight = percent === null ? 0 : Math.max(percent > 0 ? 2 : 0, percent / max * (baseline - plotTop - 10));
        return (
          <g data-testid="hour-column" key={hour}>
            {item && item.sessions > 0 && <title>{hourText(item)}</title>}
            <rect fill="transparent" height={baseline} width={step} x={x} y="0" />
            {barHeight > 0 && <rect className="fill-muted-foreground" height={barHeight} rx="3" width={step - 8} x={x + 4} y={baseline - barHeight} />}
            {hour % 3 === 0 && <text className="fill-muted-foreground text-[10px]" textAnchor="middle" x={x + step / 2} y={baseline + 16}>{hour}h</text>}
          </g>
        );
      })}
    </svg>
    {/* the <title> hover is invisible to screen readers and keyboards: the same numbers live here */}
    {withSessions.length > 0 && (
      <ul aria-label="Sessões com travamento por hora do dia" className="sr-only">
        {withSessions.map(item => <li key={item.hour}>{hourText(item)}</li>)}
      </ul>
    )}
    </div>
  );
}

/** Lista de barras horizontais: cada linha tem nome, barra proporcional, percentual e quantidade de sessões. */
export function BarList({ title, items }: { title: string; items: { label: string; percent: number | null; sessions: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 && <p className="m-0 text-sm text-muted-foreground">Sem dados.</p>}
        <ul className="m-0 grid list-none gap-3 p-0">
          {items.map(item => (
            <li className="grid gap-1" key={item.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {item.percent === null ? 'Sem dados' : formatPercent(item.percent)} · {item.sessions} {item.sessions === 1 ? 'sessão' : 'sessões'}
                </span>
              </div>
              <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${Math.min(100, item.percent ?? 0)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
