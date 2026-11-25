import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileSpreadsheet, PlayCircle, Search, Users, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { listAllParticipants, listLearningParticipation, listParticipantProfiles, type LearningParticipantProgress, type ParticipantProfile } from './api';
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
import { activeParticipantsByDay, totalWatchedMilliseconds } from './dashboard/activity';
import { ColumnChart, Donut, type ColumnPoint } from './dashboard/charts';
import LoadingState from './LoadingState';
import { TrainingSelect } from './trainings/TrainingSelect';
import { inUnit, useUnitScope } from './trainings/unitScope';
import { filterByTraining, useTrainingFilter } from './trainings/useTrainingFilter';

const PAGE_SIZE = 8;
/** Série única "concluído": mesma cor do status Concluiu, para as duas leituras baterem. */
const COMPLETION_COLOR = statusColors.completed;
// people coming in: the blue of the reference palette, validated against the status green (it is not a status)
const ACTIVITY_COLOR = '#2a78d6';

const progressBar = cn(
  'h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted',
  '[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[var(--meter)]',
  '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-[var(--meter)]',
);

const pluralize = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

const noRows: LearningParticipantProgress[] = [];

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
  const training = useTrainingFilter(loaded?.participation ?? noRows);
  // with a unit chosen at the top, every number is about its people (where each one is comes apart: without it, the whole company)
  const unitScope = useUnitScope();
  const [profiles, setProfiles] = useState<ReadonlyMap<string, ParticipantProfile> | null>(null);
  useEffect(() => { listParticipantProfiles().then(list => setProfiles(Array.isArray(list) ? new Map(list.map(item => [item.id, item])) : null), () => setProfiles(null)); }, []);
  // every number of the page is about the training chosen, so one person's finished SIPAT does not hide a fire drill not started
  const data = useMemo<DashboardData | null>(() => {
    if (!loaded) return null;
    const ofUnit = inUnit(profiles ?? new Map(), profiles ? unitScope.unitId : null);
    const participants = loaded.participants.filter(person => ofUnit(person.id));
    const participation = filterByTraining(loaded.participation, training.selectedId).filter(row => ofUnit(row.participantId));
    return {
      overview: summarizeCompanyProgress(participants, participation),
      rows: toParticipantRows(summarizeParticipants(participants, participation)),
      participation,
    };
  }, [loaded, training.selectedId, profiles, unitScope.unitId]);
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
      const fileName = await downloadCompanyExcelReport({ companyName, brandColor, ...data, trainingTitle: [training.selected?.title, unitScope.unit?.name].filter(Boolean).join(' · ') || undefined });
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
  const completedCount = overview?.participantDistribution.find(({ status }) => status === 'completed')?.count ?? 0;

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
            <section aria-label="Indicadores de aprendizagem da empresa" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13.5rem),1fr))] gap-4">
              <SummaryCard icon={Users} label="Participantes ativos" note={pluralize(overview.participantCount, 'colaborador cadastrado', 'colaboradores cadastrados')} value={overview.activeParticipantCount.toLocaleString('pt-BR')} />
              <SummaryCard
                icon={CheckCircle2}
                label="Concluíram tudo"
                note={`${completedCount} de ${overview.participantCount} · ${pluralize(overview.completedTrackCount, 'dia concluído', 'dias concluídos')}`}
                value={`${overview.participantCount > 0 ? Math.round((completedCount / overview.participantCount) * 100) : 0}%`}
              />
              <SummaryCard
                icon={PlayCircle}
                label="Vídeos concluídos"
                note={`${overview.overallProgressPercentage}% do total entregue`}
                progress={overview.overallProgressPercentage}
                value={`${overview.completedLessonCount.toLocaleString('pt-BR')} / ${overview.lessonCount.toLocaleString('pt-BR')}`}
              />
              <SummaryCard icon={Clock3} label="Tempo assistido" note="Somando todos os participantes" value={formatDuration(totalWatchedMilliseconds(data.participation))} />
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

            <section aria-label="Progresso de todos os participantes" className="grid gap-4 lg:grid-cols-2">
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

            <section aria-label="Engajamento e conclusão por dia" className="grid gap-4 lg:grid-cols-2">
              <Panel count="Últimos 14 dias" id="recent-activity-title" title="Engajamento">
                <RecentActivity participation={data.participation} />
              </Panel>

              <Panel count={pluralize(overview.trackProgress.length, 'dia', 'dias')} id="track-progress-title" title="Conclusão média por dia">
                {overview.trackProgress.length === 0 ? (
                  <EmptyState description="Quando um treinamento for publicado, a evolução média de cada dia aparecerá aqui." title="Nenhum dia entregue" />
                ) : (
                  <TrackMeterList overview={overview} />
                )}
              </Panel>
            </section>

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

// ── Situação: rosca com o percentual de quem concluiu no centro ─────────────

function StatusBreakdown({ overview }: { overview: CompanyLearningOverview }) {
  const total = overview.participantCount;
  const parts = overview.participantDistribution.filter(({ count }) => count > 0);
  const percent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
  const completed = overview.participantDistribution.find(({ status }) => status === 'completed')?.count ?? 0;

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
      <Donut
        ariaLabel={`Distribuição do progresso de ${total} participantes: ${parts.map(({ status, count }) => `${statusLabels[status]} ${count} (${percent(count)}%)`).join(', ')}`}
        caption={`concluíram · ${completed} de ${total}`}
        center={`${percent(completed)}%`}
        slices={parts.map(({ status, count }) => ({ key: status, label: statusLabels[status], count, color: statusColors[status] }))}
      />
      <ul aria-label="Legenda do progresso" className="m-0 grid list-none gap-3 p-0">
        {parts.map(({ status, count }) => (
          <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-sm" key={status}>
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
            <span>{statusLabels[status]}</span>
            <strong className="tabular-nums">{count} <span className="font-normal text-muted-foreground">({percent(count)}%)</span></strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Ritmo de conclusão: colunas por data ────────────────────────────────────

const dateLabel = (key: string, options: Intl.DateTimeFormatOptions) => parseDateKey(key).toLocaleDateString('pt-BR', options);
const columnPoints = (series: readonly { date: string; count: number }[]): ColumnPoint[] => series.map((point) => ({
  key: point.date, count: point.count,
  label: dateLabel(point.date, { day: '2-digit', month: '2-digit' }),
  longLabel: dateLabel(point.date, { weekday: 'long', day: '2-digit', month: '2-digit' }),
}));

function CompletionTimeline({ participation }: { participation: readonly LearningParticipantProgress[] }) {
  const series = useMemo(() => completionsByDate(participation), [participation]);

  if (series.length === 0) {
    return (
      <EmptyState
        className="py-8"
        description="Assim que alguém concluir um dia de treinamento, as conclusões aparecem aqui por data."
        title="Nenhuma conclusão ainda"
      />
    );
  }

  const total = series.reduce((sum, point) => sum + point.count, 0);
  const peak = series.reduce((best, point) => (point.count > best.count ? point : best), series[0]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <strong className="text-4xl font-semibold tracking-tight">{total.toLocaleString('pt-BR')}</strong>
        <span className="text-sm text-muted-foreground">
          dias concluídos · pico em {dateLabel(peak.date, { weekday: 'short', day: '2-digit', month: '2-digit' })} ({peak.count})
        </span>
      </div>
      <ColumnChart
        ariaLabel={`Dias concluídos por data: ${series.map((point) => `${dateLabel(point.date, { day: '2-digit', month: '2-digit' })} ${point.count}`).join(', ')}`}
        color={COMPLETION_COLOR}
        points={columnPoints(series)}
        unit={(count) => `${count} ${count === 1 ? 'dia concluído' : 'dias concluídos'}`}
      />
    </div>
  );
}

// ── Engajamento: quem entrou em cada um dos últimos 14 dias ─────────────────

function RecentActivity({ participation }: { participation: readonly LearningParticipantProgress[] }) {
  const series = useMemo(() => activeParticipantsByDay(participation, 14), [participation]);
  const today = series.at(-1)?.count ?? 0;
  const week = new Set(participation
    .filter((row) => row.lastAccessedAt && Date.now() - new Date(row.lastAccessedAt).getTime() < 7 * 86_400_000)
    .map((row) => row.participantId)).size;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1">
          <strong className="text-4xl font-semibold tracking-tight tabular-nums">{today}</strong>
          <span className="text-sm text-muted-foreground">{today === 1 ? 'pessoa entrou hoje' : 'pessoas entraram hoje'}</span>
        </div>
        <div className="grid gap-1">
          <strong className="text-4xl font-semibold tracking-tight tabular-nums">{week}</strong>
          <span className="text-sm text-muted-foreground">nos últimos 7 dias</span>
        </div>
      </div>
      <ColumnChart
        ariaLabel={`Pessoas que entraram por dia, últimos 14 dias: ${series.map((point) => `${dateLabel(point.date, { day: '2-digit', month: '2-digit' })} ${point.count}`).join(', ')}`}
        color={ACTIVITY_COLOR}
        height="h-28"
        points={columnPoints(series)}
        unit={(count) => `${count} ${count === 1 ? 'pessoa entrou' : 'pessoas entraram'}`}
      />
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
      <ul className="m-0 grid list-none gap-x-8 gap-y-4 p-0">
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

function SummaryCard({ icon: Icon, label, value, note, progress }: { icon: LucideIcon; label: string; value: string; note?: string; progress?: number }) {
  return (
    <article className="grid content-start gap-2 rounded-xl bg-card px-5 py-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-muted text-foreground"><Icon className="size-4" /></span>
      </div>
      <strong className="text-3xl font-semibold tracking-tight tabular-nums">{value}</strong>
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

function normalize(value: string): string {
  return value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}
