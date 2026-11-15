import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getPlaybackQualityComparison, type PlaybackQualityComparison, type QualityIndicator, type QualityIndicators } from '@/api';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadingState from '@/LoadingState';
import { Light } from './PlaybackQualityPage';
import { formatPercent, formatSeconds } from './qualityLabels';

type Company = PlaybackQualityComparison['companies'][number];
type SortKey = 'name' | 'started' | 'neverStarted' | 'stalledSessions' | 'startup' | 'stalledTime';
type Direction = 'ascending' | 'descending';

const inputClass = 'h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground';

const metric: Record<Exclude<SortKey, 'name'>, (indicators: QualityIndicators) => number | null> = {
  started: indicators => (indicators.sessions === 0 ? null : indicators.startedSessions),
  neverStarted: indicators => indicators.neverStartedPercent.value,
  stalledSessions: indicators => indicators.stalledSessionsPercent.value,
  startup: indicators => indicators.averageStartupMilliseconds.value,
  stalledTime: indicators => indicators.stalledTimePercent.value,
};

const byName = (a: Company, b: Company) => a.name.localeCompare(b.name, 'pt-BR');

/** Companies without data always go last, whatever the direction. */
function sortCompanies(companies: Company[], key: SortKey, direction: Direction): Company[] {
  const sign = direction === 'ascending' ? 1 : -1;
  return [...companies].sort((a, b) => {
    if (key === 'name') return sign * byName(a, b);
    const left = metric[key](a.indicators);
    const right = metric[key](b.indicators);
    if (left === null || right === null) return left === right ? byName(a, b) : left === null ? 1 : -1;
    return left === right ? byName(a, b) : sign * (left - right);
  });
}

function Measure({ indicator, text }: { indicator: QualityIndicator; text: string }) {
  return (
    <div className="grid justify-items-start gap-1">
      <span className="tabular-nums">{indicator.value === null ? '—' : text}</span>
      <Light level={indicator.level} />
    </div>
  );
}

export default function PlaybackQualityComparisonPage() {
  const [period, setPeriod] = useState<{ from?: string; to?: string } | null>(null);
  const [data, setData] = useState<PlaybackQualityComparison | null>(null);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('stalledTime');
  const [direction, setDirection] = useState<Direction>('descending');
  const navigate = useNavigate();

  useEffect(() => {
    let current = true;
    setError('');
    getPlaybackQualityComparison(period ?? undefined)
      .then(result => { if (current) setData(result); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a comparação.'); });
    return () => { current = false; };
  }, [period]);

  const sorted = useMemo(() => (data ? sortCompanies(data.companies, sortKey, direction) : []), [data, sortKey, direction]);

  if (!data) return <div className="page-content">{error ? <p role="alert">{error}</p> : <LoadingState>Carregando a comparação...</LoadingState>}</div>;

  const from = period?.from ?? data.from;
  const to = period?.to ?? data.to;

  function sortBy(key: SortKey) {
    setDirection(sortKey === key ? (direction === 'ascending' ? 'descending' : 'ascending') : key === 'name' ? 'ascending' : 'descending');
    setSortKey(key);
  }

  const sortable = (key: SortKey, label: string) => (
    <TableHead aria-sort={sortKey === key ? direction : 'none'} scope="col">
      <button
        className="m-0 inline-flex min-h-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[inherit] font-[inherit] uppercase tracking-[inherit] text-[inherit] hover:text-foreground"
        onClick={() => sortBy(key)}
        type="button"
      >
        {label}
        {sortKey !== key ? <ArrowUpDown aria-hidden="true" className="size-3 opacity-50" /> : direction === 'ascending' ? <ArrowUp aria-hidden="true" className="size-3" /> : <ArrowDown aria-hidden="true" className="size-3" />}
      </button>
    </TableHead>
  );

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          actions={<>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">De
              <input className={inputClass} onChange={event => event.target.value && setPeriod({ from: event.target.value, to })} type="date" value={from} />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">Até
              <input className={inputClass} onChange={event => event.target.value && setPeriod({ from, to: event.target.value })} type="date" value={to} />
            </label>
          </>}
          title="Qualidade do vídeo"
        />
        {error && <p role="alert">{error}</p>}
        {sorted.length === 0
          ? <EmptyState description="Escolha outro período para comparar as empresas." title="Nenhuma empresa teve SIPAT neste período" />
          : (
            <div className="ops-table">
              <Table aria-label="Qualidade do vídeo por empresa">
                <TableHeader>
                  <TableRow>
                    {sortable('name', 'Empresa')}
                    {sortable('started', 'Vídeos assistidos')}
                    {sortable('neverStarted', '% não começaram')}
                    {sortable('stalledSessions', '% sessões com travamento')}
                    {sortable('startup', 'Tempo médio para começar')}
                    {sortable('stalledTime', '% tempo travado')}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(({ companyId, name, indicators }) => (
                    <TableRow className="cursor-pointer" key={companyId} onClick={() => navigate(`/platform/companies/${companyId}/qualidade`)}>
                      <TableCell>
                        <Link className="font-semibold text-foreground no-underline hover:underline" onClick={event => event.stopPropagation()} to={`/platform/companies/${companyId}/qualidade`}>{name}</Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{indicators.startedSessions}</TableCell>
                      <TableCell><Measure indicator={indicators.neverStartedPercent} text={formatPercent(indicators.neverStartedPercent.value ?? 0)} /></TableCell>
                      <TableCell><Measure indicator={indicators.stalledSessionsPercent} text={formatPercent(indicators.stalledSessionsPercent.value ?? 0)} /></TableCell>
                      <TableCell><Measure indicator={indicators.averageStartupMilliseconds} text={formatSeconds(indicators.averageStartupMilliseconds.value ?? 0)} /></TableCell>
                      <TableCell><Measure indicator={indicators.stalledTimePercent} text={formatPercent(indicators.stalledTimePercent.value ?? 0)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
      </Page>
    </div>
  );
}
