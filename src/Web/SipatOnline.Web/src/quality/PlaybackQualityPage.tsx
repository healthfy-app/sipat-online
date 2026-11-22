import { CircleAlert, CircleCheck, CircleHelp, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCompanyPlaybackQuality, playbackQualitySummaryUrl, type CompanyPlaybackQuality, type QualityBreakdownItem, type QualityLevel } from '@/api';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadingState from '@/LoadingState';
import { BarList, HourChart } from './QualityCharts';
import { connectionLabel, dayLabel, deviceLabel, formatPercent, formatSeconds, levelLabel, qualityLabel } from './qualityLabels';

const selectClass = 'h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground';

/** Traffic light: colour is never alone, there is always an icon and a word. */
export function Light({ level }: { level: QualityLevel | null }) {
  const variant = level === 'Good' ? 'success' : level === 'Attention' ? 'warning' : level === 'Poor' ? 'destructive' : 'neutral';
  const Icon = level === 'Good' ? CircleCheck : level === 'Attention' ? TriangleAlert : level === 'Poor' ? CircleAlert : CircleHelp;
  return <Badge variant={variant}><Icon aria-hidden="true" />{levelLabel(level)}</Badge>;
}

function IndicatorCard({ label, value, level, hint }: { label: string; value: string; level: QualityLevel | null; hint?: string }) {
  return (
    <div aria-label={label} className="grid gap-1.5 rounded-lg bg-card px-5 py-4 shadow-card" role="group">
      <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
      <strong className="text-2xl font-semibold tabular-nums tracking-tight">{value}</strong>
      <div className="flex flex-wrap items-center gap-2"><Light level={level} />{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div>
    </div>
  );
}

const asItems = (items: QualityBreakdownItem[], label: (key: string | null) => string) =>
  items.map(item => ({ label: label(item.key), percent: item.indicators.stalledSessionsPercent.value, sessions: item.indicators.sessions }));

const percentOrDash = (value: number | null) => (value === null ? '—' : formatPercent(value));

export default function PlaybackQualityPage() {
  const { companyId = '' } = useParams<{ companyId: string }>();
  const [sipatId, setSipatId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [data, setData] = useState<CompanyPlaybackQuality | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    setError('');
    getCompanyPlaybackQuality(companyId, { sipatId, day })
      .then(result => { if (current) setData(result); })
      .catch(failure => { if (current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a qualidade do vídeo.'); });
    return () => { current = false; };
  }, [companyId, sipatId, day]);

  if (!data) return <div className="page-content">{error ? <p role="alert">{error}</p> : <LoadingState>Carregando a qualidade do vídeo...</LoadingState>}</div>;

  const effectiveSipat = sipatId ?? data.sipatId;
  const indicators = data.indicators;
  const startup = indicators.averageStartupMilliseconds;

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          actions={<>
            <select aria-label="Treinamento" className={selectClass} onChange={event => { setSipatId(event.target.value); setDay(null); }} value={effectiveSipat ?? ''}>
              {data.sipats.map(sipat => <option key={sipat.id} value={sipat.id}>{sipat.title}</option>)}
            </select>
            <select aria-label="Dia" className={selectClass} onChange={event => setDay(event.target.value === '' ? null : Number(event.target.value))} value={day ?? ''}>
              <option value="">Todos os dias</option>
              {data.days.map(item => <option key={item} value={item}>Dia {item}</option>)}
            </select>
            <a className={buttonVariants({ variant: 'default' })} href={playbackQualitySummaryUrl(companyId, { sipatId: effectiveSipat, day })}>Baixar resumo</a>
          </>}
          title={`Qualidade do vídeo · ${data.companyName}`}
        />
        {error && <p role="alert">{error}</p>}
        {indicators.sessions === 0
          ? <EmptyState
              description="Quando um treinamento começar, aqui aparecem os vídeos assistidos, onde o vídeo trava e quem teve problema para assistir, por hora, conexão, aparelho e Dia."
              title="Ainda não há dados de vídeo" />
          : <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <IndicatorCard
                hint={indicators.neverStartedPercent.value === null ? undefined : `${formatPercent(indicators.neverStartedPercent.value)} não começaram`}
                label="Vídeos assistidos" level={indicators.neverStartedPercent.level} value={String(indicators.startedSessions)} />
              <IndicatorCard label="Sessões com travamento" level={indicators.stalledSessionsPercent.level} value={percentOrDash(indicators.stalledSessionsPercent.value)} />
              <IndicatorCard label="Tempo médio para começar" level={startup.level} value={startup.value === null ? '—' : formatSeconds(startup.value)} />
              <IndicatorCard label="Tempo travado" level={indicators.stalledTimePercent.level} value={percentOrDash(indicators.stalledTimePercent.value)} />
            </div>
            <Card>
              <CardHeader><CardTitle as="h2">Travamentos por hora do dia</CardTitle></CardHeader>
              <CardContent><HourChart hours={data.byHour} /></CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <BarList items={asItems(data.byConnection, connectionLabel)} title="Por conexão" />
              <BarList items={asItems(data.byDevice, deviceLabel)} title="Por aparelho" />
              <BarList items={asItems(data.byQuality, qualityLabel)} title="Por qualidade" />
              <BarList items={asItems(data.byDay, dayLabel)} title="Por Dia" />
            </div>
            <Card>
              <CardHeader><CardTitle as="h2">Vídeos que mais travam</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Vídeo</TableHead><TableHead>Sessões</TableHead><TableHead>Com travamento</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.videos.map(video => (
                      <TableRow key={video.videoId ?? video.title}>
                        <TableCell>{video.title}</TableCell>
                        <TableCell>{video.indicators.sessions}</TableCell>
                        <TableCell>{percentOrDash(video.indicators.stalledSessionsPercent.value)}</TableCell>
                        <TableCell><Light level={video.indicators.stalledSessionsPercent.level} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle as="h2">Pessoas com problema</CardTitle></CardHeader>
              <CardContent>
                {data.people.length === 0 && <p className="m-0 text-sm text-muted-foreground">Ninguém teve problema para assistir.</p>}
                <ul className="m-0 grid list-none gap-3 p-0">
                  {data.people.map(person => (
                    <li className="flex flex-wrap items-center justify-between gap-3 text-sm" key={person.participantId}>
                      <div className="grid">
                        <strong>{person.displayName}</strong>
                        <span className="text-muted-foreground">{person.loginIdentifier}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {person.neverStarted > 0 ? `${person.neverStarted} não começaram` : `${formatPercent(person.stalledTimePercent)} do tempo travado`}
                      </span>
                      <Link className="font-medium text-foreground underline" to={`/platform/companies/${companyId}/participantes?busca=${encodeURIComponent(person.loginIdentifier)}`}>Ver progresso</Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>}
      </Page>
    </div>
  );
}
