import { ArrowRight, ChevronLeft, ChevronRight, FileSpreadsheet, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { listAllParticipants, listLearningParticipation, type LearningParticipantProgress } from './api';
import {
  participantProgressStatuses,
  summarizeCompanyProgress,
  summarizeParticipants,
  type CompanyLearningOverview,
  type ParticipantProgressFilter,
} from './participantProgress';
import {
  completionsByDate,
  formatDuration,
  formatShortDate,
  parseDateKey,
  statusColors,
  statusLabels,
  statusShortLabels,
  toParticipantRows,
  type ParticipantRow,
} from './dashboard/companyDashboardData';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import LoadingState from './LoadingState';
import { TrainingSelect } from './trainings/TrainingSelect';
import { filterByTraining, useTrainingFilter } from './trainings/useTrainingFilter';

const PAGE_SIZE = 8;
/** Série única "concluído": mesma cor do status Concluiu, para as duas leituras baterem. */
const COMPLETION_COLOR = statusColors.completed;

const progressBar = cn(
  'h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted',
  '[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[var(--meter)]',
  '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[var(--meter)]',
);

const pluralize = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

interface DashboardData {
  overview: CompanyLearningOverview;
  rows: ParticipantRow[];
  participation: LearningParticipantProgress[];
}

export default function TenantLearningDashboardPage({
  readOnly = false,
  companyName = 'Empresa',
  brandColor,
}: { readOnly?: boolean; companyName?: string; brandColor?: string }) {
  const [loaded, setLoaded] = useState<{ participants: Awaited<ReturnType<typeof listAllParticipants>>; participation: LearningParticipantProgress[] } | null>(null);
  const training = useTrainingFilter();
  // every number of the page is about the training chosen, so one person's finished SIPAT does not hide a fire drill not started
  const data = useMemo<DashboardData | null>(() => {
    if (!loaded) return null;
    const participation = filterByTraining(loaded.participation, training.selectedId);
    return {
      overview: summarizeCompanyProgress(loaded.participants, participation),
      rows: toParticipantRows(summarizeParticipants(loaded.participants, participation)),
      participation,
    };
  }, [loaded, training.selectedId]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportState, setExportState] = useState<{ busy: boolean; message: string }>({ busy: false, message: '' });

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [participants, participation] = await Promise.all([listAllParticipants(), listLearningParticipation()]);
      setLoaded({ participants, participation });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const exportExcel = async () => {
    if (!data) return;
    setExportState({ busy: true, message: '' });
    try {
      const { downloadCompanyExcelReport } = await import('./dashboard/companyExcelReport');
      const fileName = await downloadCompanyExcelReport({ companyName, brandColor, ...data, trainingTitle: training.selected?.title });
      setExportState({ busy: false, message: `Relatório ${fileName} baixado.` });
    } catch (exportError) {
      setExportState({
        busy: false,
        message: exportError instanceof Error ? `Não foi possível gerar o Excel: ${exportError.message}` : 'Não foi possível gerar o Excel.',
      });
    }
  };

  const overview = data?.overview;
  const noTracksCount = overview?.participantDistribution.find(({ status }) => status === 'no-tracks')?.count ?? 0;
  const notStartedCount = overview?.participantDistribution.find(({ status }) => status === 'not-started')?.count ?? 0;
  const nextStepStatus = noTracksCount > 0 ? 'no-tracks' : 'not-started';
  const nextStepCount = noTracksCount > 0 ? noTracksCount : notStartedCount;

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          actions={(
            <>
              <Button disabled={isLoading} onClick={() => void loadOverview()} variant="outline">Atualizar</Button>
              <Button disabled={isLoading || !data || exportState.busy} onClick={() => void exportExcel()} variant="outline">
                <FileSpreadsheet />
                {exportState.busy ? 'Gerando Excel...' : 'Baixar relatório Excel'}
              </Button>
              <Link className={buttonVariants()} to="/admin/learning">Ver participantes</Link>
            </>
          )}
          description="Acompanhe o progresso dos colaboradores em cada treinamento da sua empresa."
          eyebrow="GESTÃO DA EMPRESA"
          title="Visão geral"
        />

        <TrainingSelect onChange={training.setSelectedId} trainings={training.trainings} value={training.selectedId} />

        {exportState.message && (
          <p aria-live="polite" className="m-0 text-sm text-muted-foreground" role="status">{exportState.message}</p>
        )}

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive-soft px-3 py-2" role="alert">
            <p className="m-0 text-sm font-medium text-destructive">{error}</p>
            <Button onClick={() => void loadOverview()} size="sm" variant="outline">Tentar novamente</Button>
          </div>
        )}

        {isLoading ? (
          <LoadingState className="list-state">Carregando o progresso da empresa...</LoadingState>
        ) : data && overview && (
          <>
            <section aria-label="Indicadores de aprendizagem da empresa" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-4">
              <SummaryCard label="Participantes ativos" value={overview.activeParticipantCount.toLocaleString('pt-BR')} />
              <SummaryCard
                label="Dias entregues"
                note={`${pluralize(overview.trackProgress.length, 'dia distinto', 'dias distintos')} · ${pluralize(overview.completedTrackCount, 'dia concluído', 'dias concluídos')}`}
                value={overview.assignedTrackCount.toLocaleString('pt-BR')}
              />
              <SummaryCard
                label="Aulas concluídas"
                note={`${overview.overallProgressPercentage}% do total atribuído`}
                progress={overview.overallProgressPercentage}
                value={`${overview.completedLessonCount.toLocaleString('pt-BR')} / ${overview.lessonCount.toLocaleString('pt-BR')}`}
              />
            </section>

            {nextStepCount > 0 && (
              <section
                aria-labelledby="tenant-dashboard-next-step"
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-warning-soft px-5 py-4"
              >
                <div className="grid gap-1">
                  <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-warning">PRÓXIMO PASSO</p>
                  <h2 className="m-0 text-base font-semibold" id="tenant-dashboard-next-step">
                    {noTracksCount > 0
                      ? `Entregue o treinamento a ${pluralize(noTracksCount, 'colaborador', 'colaboradores')}`
                      : `Acompanhe ${pluralize(notStartedCount, 'participante', 'participantes')} sem início`}
                  </h2>
                  <p className="m-0 text-sm text-muted-foreground">
                    {noTracksCount > 0
                      ? 'Esses colaboradores ainda não receberam nenhum dia de treinamento.'
                      : 'Veja quem já recebeu os dias do treinamento e ainda não iniciou.'}
                  </p>
                </div>
                <Link className={buttonVariants()} to={`/admin/learning?status=${nextStepStatus}`}>
                  {noTracksCount > 0
                    ? readOnly ? 'Ver colaboradores sem dias de treinamento' : 'Escolher participantes'
                    : readOnly ? 'Ver acompanhamento' : 'Acompanhar progresso'}
                  <ArrowRight />
                </Link>
              </section>
            )}

            <Panel count={pluralize(overview.participantCount, 'colaborador', 'colaboradores')} id="company-participants-title" title={`Colaboradores da ${companyName}`}>
              {overview.participantCount === 0 ? (
                <EmptyState
                  action={<Link className={buttonVariants({ variant: 'outline' })} to="/admin/learning">{readOnly ? 'Ver acompanhamento' : 'Adicionar participantes'}</Link>}
                  description="Cadastre ou importe participantes para acompanhar o progresso da empresa."
                  title="Ainda não há participantes"
                />
              ) : (
                <ParticipantsTable overview={overview} rows={data.rows} />
              )}
            </Panel>

            <section aria-label="Progresso de todos os participantes" className="grid items-start gap-4 lg:grid-cols-2">
              <Panel count={pluralize(overview.participantCount, 'participante', 'participantes')} id="participant-distribution-title" title="Situação dos participantes">
                {overview.participantCount === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">Sem participantes para distribuir.</p>
                ) : (
                  <StatusBreakdown overview={overview} />
                )}
              </Panel>

              <Panel count="Por data" id="completion-timeline-title" title="Ritmo de conclusão">
                <CompletionTimeline participation={data.participation} />
              </Panel>
            </section>

            <Panel count={pluralize(overview.trackProgress.length, 'dia', 'dias')} id="track-progress-title" title="Conclusão média por dia">
              {overview.trackProgress.length === 0 ? (
                <EmptyState description="Quando um treinamento for publicado, a evolução média de cada dia aparecerá aqui." title="Nenhum dia entregue" />
              ) : (
                <TrackMeterList overview={overview} />
              )}
            </Panel>
          </>
        )}
      </Page>
    </div>
  );
}

function Panel({ id, title, count, children }: { id: string; title: string; count: string; children: ReactNode }) {
  return (
    <article aria-labelledby={id} className="grid min-w-0 content-start gap-5 rounded-lg bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold" id={id}>{title}</h2>
        <Badge>{count}</Badge>
      </div>
      {children}
    </article>
  );
}

// ── Colaboradores (tabela paginada) ─────────────────────────────────────────

function ParticipantsTable({ rows, overview }: { rows: readonly ParticipantRow[]; overview: CompanyLearningOverview }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ParticipantProgressFilter>('all');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = normalize(query);
    return rows.filter((row) => (status === 'all' || row.status === status)
      && (!needle || normalize(row.displayName).includes(needle) || normalize(row.loginIdentifier).includes(needle)));
  }, [query, rows, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const first = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const last = currentPage * PAGE_SIZE + visible.length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[min(100%,16rem)] flex-1">
          <span className="sr-only">Buscar colaborador</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="Buscar por nome ou login"
            type="search"
            value={query}
          />
        </label>
        <label className="w-full sm:w-60">
          <span className="sr-only">Filtrar por situação</span>
          <NativeSelect
            onChange={(event) => { setStatus(event.target.value as ParticipantProgressFilter); setPage(0); }}
            value={status}
          >
            <option value="all">Todas as situações ({rows.length})</option>
            {participantProgressStatuses.map((item) => {
              const count = overview.participantDistribution.find((entry) => entry.status === item)?.count ?? 0;
              return count > 0 ? <option key={item} value={item}>{statusShortLabels[item]} ({count})</option> : null;
            })}
          </NativeSelect>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table aria-label="Colaboradores da empresa" className="m-0 w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Colaborador', 'Situação', 'Dias concluídos', 'Progresso', 'Tempo assistido', 'Último acesso'].map((label, index) => (
                <th
                  className={cn(
                    'h-9 whitespace-nowrap px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground',
                    index >= 4 ? 'text-right' : 'text-left',
                  )}
                  key={label}
                  scope="col"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td className="px-3 py-10 text-center text-sm text-muted-foreground" colSpan={6}>Nenhum colaborador encontrado com esses filtros.</td>
              </tr>
            ) : visible.map((row) => (
              <tr className="border-b border-border last:border-0 hover:bg-muted/50" key={row.id}>
                <td className="px-3 py-2.5">
                  <div className="grid min-w-44">
                    <strong className="font-semibold">{row.displayName}</strong>
                    <span className="text-xs text-muted-foreground">{row.loginIdentifier}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: statusColors[row.status] }} />
                    {statusShortLabels[row.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">
                  {row.assignedTrackCount === 0 ? <span className="text-muted-foreground">—</span> : `${row.completedTrackCount} de ${row.assignedTrackCount}`}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <progress
                      aria-label={`${row.displayName}: ${row.progressPercentage}% das aulas`}
                      className={cn(progressBar, 'w-28')}
                      max={100}
                      style={{ '--meter': COMPLETION_COLOR } as React.CSSProperties}
                      value={row.progressPercentage}
                    />
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{row.progressPercentage}%</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.watchedMilliseconds > 0 ? formatDuration(row.watchedMilliseconds) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatShortDate(row.lastAccessedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginação dos colaboradores" className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {filtered.length === 0 ? 'Nenhum resultado' : `Mostrando ${first}–${last} de ${filtered.length}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Página anterior"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            size="sm"
            variant="outline"
          >
            <ChevronLeft /> Anterior
          </Button>
          <span className="min-w-24 text-center text-xs tabular-nums text-muted-foreground">Página {currentPage + 1} de {pageCount}</span>
          <Button
            aria-label="Próxima página"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
            size="sm"
            variant="outline"
          >
            Próxima <ChevronRight />
          </Button>
        </div>
      </nav>
    </div>
  );
}

// ── Situação: barra segmentada alta ─────────────────────────────────────────

function StatusBreakdown({ overview }: { overview: CompanyLearningOverview }) {
  const total = overview.participantCount;
  const parts = overview.participantDistribution.filter(({ count }) => count > 0);
  const percent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
  const completed = overview.participantDistribution.find(({ status }) => status === 'completed')?.count ?? 0;
  const tooltip = useHoverTooltip();

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <strong className="text-4xl font-semibold tracking-tight">{percent(completed)}%</strong>
        <span className="text-sm text-muted-foreground">concluíram todos os dias · {completed} de {total}</span>
      </div>

      <div className="relative" ref={tooltip.containerRef}>
        <div
          aria-label={`Distribuição do progresso de ${total} participantes: ${parts.map(({ status, count }) => `${statusLabels[status]} ${count} (${percent(count)}%)`).join(', ')}`}
          className="flex h-7 w-full gap-0.5"
          role="img"
        >
          {parts.map(({ status, count }) => {
            const share = percent(count);
            const dark = status === 'completed';
            return (
              <div
                className="flex h-full min-w-1 items-center overflow-hidden rounded-[4px] px-2 text-xs font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-progress-status={status}
                key={status}
                onBlur={tooltip.hide}
                onFocus={(event) => tooltip.show(event.currentTarget, `${statusLabels[status]}`, `${count} · ${share}%`)}
                onMouseEnter={(event) => tooltip.show(event.currentTarget, `${statusLabels[status]}`, `${count} · ${share}%`)}
                onMouseLeave={tooltip.hide}
                style={{ backgroundColor: statusColors[status], color: dark ? '#ffffff' : '#0b0b0b', flexGrow: count, flexBasis: 0 }}
                tabIndex={0}
              >
                {share >= 12 ? `${share}%` : null}
              </div>
            );
          })}
        </div>
        {tooltip.node}
      </div>

      <ul aria-label="Legenda do progresso" className="m-0 grid list-none gap-2.5 p-0">
        {parts.map(({ status, count }) => (
          <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-sm" key={status}>
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: statusColors[status] }} />
            <span>{statusLabels[status]}</span>
            <strong className="tabular-nums">{count} ({percent(count)}%)</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ritmo de conclusão: colunas por data ────────────────────────────────────

function CompletionTimeline({ participation }: { participation: readonly LearningParticipantProgress[] }) {
  const series = useMemo(() => completionsByDate(participation), [participation]);
  const tooltip = useHoverTooltip();

  if (series.length === 0) {
    return (
      <EmptyState
        className="py-8"
        description="Assim que alguém concluir um dia de treinamento, as conclusões aparecem aqui por data."
        title="Nenhuma conclusão ainda"
      />
    );
  }

  const max = Math.max(...series.map((point) => point.count));
  const top = niceMax(max);
  const ticks = [top, top / 2, 0];
  const total = series.reduce((sum, point) => sum + point.count, 0);
  const peak = series.reduce((best, point) => (point.count > best.count ? point : best), series[0]);
  const labelEvery = Math.ceil(series.length / 7);
  const dateLabel = (key: string, options: Intl.DateTimeFormatOptions) => parseDateKey(key).toLocaleDateString('pt-BR', options);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <strong className="text-4xl font-semibold tracking-tight">{total.toLocaleString('pt-BR')}</strong>
        <span className="text-sm text-muted-foreground">
          dias concluídos · pico em {dateLabel(peak.date, { weekday: 'short', day: '2-digit', month: '2-digit' })} ({peak.count})
        </span>
      </div>

      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-2" ref={tooltip.containerRef}>
        <div aria-hidden="true" className="grid h-40 content-between text-right text-[0.6875rem] tabular-nums text-muted-foreground">
          {ticks.map((tick) => <span className="-my-1.5 leading-3" key={tick}>{tick}</span>)}
        </div>
        <div className="relative h-40">
          <div aria-hidden="true" className="absolute inset-0 grid content-between">
            {ticks.map((tick) => <div className={cn('h-px', tick === 0 ? 'bg-border' : 'bg-border/50')} key={tick} />)}
          </div>
          <div
            aria-label={`Dias concluídos por data: ${series.map((point) => `${dateLabel(point.date, { day: '2-digit', month: '2-digit' })} ${point.count}`).join(', ')}`}
            className="absolute inset-0 flex items-end gap-0.5"
            role="img"
          >
            {series.map((point) => (
              <div
                className="group flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                key={point.date}
                onBlur={tooltip.hide}
                onFocus={(event) => tooltip.show(event.currentTarget, dateLabel(point.date, { weekday: 'long', day: '2-digit', month: '2-digit' }), `${point.count} ${point.count === 1 ? 'dia concluído' : 'dias concluídos'}`)}
                onMouseEnter={(event) => tooltip.show(event.currentTarget, dateLabel(point.date, { weekday: 'long', day: '2-digit', month: '2-digit' }), `${point.count} ${point.count === 1 ? 'dia concluído' : 'dias concluídos'}`)}
                onMouseLeave={tooltip.hide}
                tabIndex={0}
              >
                <div
                  className="w-full max-w-7 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                  style={{ backgroundColor: COMPLETION_COLOR, height: point.count === 0 ? 0 : `${Math.max(2, (point.count / top) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
        <span />
        <div aria-hidden="true" className="mt-1.5 flex gap-0.5 text-[0.6875rem] tabular-nums text-muted-foreground">
          {series.map((point, index) => (
            <span className="min-w-0 flex-1 text-center" key={point.date}>
              {index % labelEvery === 0 ? dateLabel(point.date, { day: '2-digit', month: '2-digit' }) : ''}
            </span>
          ))}
        </div>
        {tooltip.node}
      </div>
    </div>
  );
}

// ── Conclusão por dia: lista de medidores ───────────────────────────────────

function TrackMeterList({ overview }: { overview: CompanyLearningOverview }) {
  const tracks = [...overview.trackProgress].sort((first, second) =>
    first.averageProgressPercentage - second.averageProgressPercentage || first.trackTitle.localeCompare(second.trackTitle, 'pt-BR'));

  return (
    <div className="grid gap-3">
      <p className="m-0 text-xs text-muted-foreground">Do menor para o maior progresso médio: os primeiros pedem atenção.</p>
      <ul className="m-0 grid list-none gap-x-8 gap-y-4 p-0 lg:grid-cols-2">
        {tracks.map((track) => (
          <li className="grid gap-1.5" key={track.trackId}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <strong className="text-sm font-semibold">{track.trackTitle}</strong>
              <span className="text-xs tabular-nums text-muted-foreground">
                {track.completedParticipantCount}/{track.participantCount} concluíram · {track.averageProgressPercentage}%
              </span>
            </div>
            <progress
              aria-label={`${track.trackTitle}: ${track.averageProgressPercentage}% de progresso médio`}
              className={progressBar}
              max={100}
              style={{ '--meter': COMPLETION_COLOR } as React.CSSProperties}
              value={track.averageProgressPercentage}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ label, value, note, progress }: { label: string; value: string; note?: string; progress?: number }) {
  return (
    <article className="grid content-start gap-2 rounded-lg bg-card px-5 py-4 shadow-card">
      <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
      <strong className="text-3xl font-semibold tracking-tight">{value}</strong>
      {progress !== undefined && (
        <progress
          aria-label={`${label}: ${progress}%`}
          className={progressBar}
          max={100}
          style={{ '--meter': COMPLETION_COLOR } as React.CSSProperties}
          value={progress}
        />
      )}
      {note && <small className="text-xs text-muted-foreground">{note}</small>}
    </article>
  );
}

// ── Tooltip de hover/foco compartilhado ─────────────────────────────────────

function useHoverTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; value: string } | null>(null);

  const show = useCallback((target: HTMLElement, title: string, value: string) => {
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

function niceMax(value: number): number {
  if (value <= 2) return 2;
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10].map((step) => step * magnitude);
  const nice = steps.find((step) => step >= value) ?? 10 * magnitude;
  return nice % 2 === 0 ? nice : nice * 2;
}

function normalize(value: string): string {
  return value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}
