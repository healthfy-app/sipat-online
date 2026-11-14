import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllParticipants, listLearningParticipation } from './api';
import {
  participantProgressStatuses,
  summarizeCompanyProgress,
  type CompanyLearningOverview,
  type ParticipantProgressStatus,
} from './participantProgress';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import LoadingState from './LoadingState';

const statusLabels: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluíram todos os dias',
  'in-progress': 'Em andamento',
  'not-started': 'Ainda não iniciaram',
  'no-tracks': 'Sem dias da SIPAT',
  inactive: 'Participantes inativos',
};

const statusColors: Record<ParticipantProgressStatus, string> = {
  completed: 'var(--brand-primary)',
  'in-progress': '#d9a900',
  'not-started': '#8fa399',
  'no-tracks': '#c7d1cb',
  inactive: '#e1e6e3',
};

const progressBar = cn(
  'h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-muted',
  '[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary',
  '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary',
);

const pluralize = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;

export default function TenantLearningDashboardPage({ readOnly = false }: { readOnly?: boolean }) {
  const [overview, setOverview] = useState<CompanyLearningOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [participants, participation] = await Promise.all([listAllParticipants(), listLearningParticipation()]);
      setOverview(summarizeCompanyProgress(participants, participation));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o painel.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

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
              <Link className={buttonVariants()} to="/admin/learning">Ver participantes</Link>
            </>
          )}
          description="Acompanhe o progresso dos colaboradores e dos dias da SIPAT da sua empresa."
          eyebrow="GESTÃO DA EMPRESA"
          title="Visão geral"
        />

        {error && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-destructive-soft px-3 py-2" role="alert">
            <p className="m-0 text-sm font-medium text-destructive">{error}</p>
            <Button onClick={() => void loadOverview()} size="sm" variant="outline">Tentar novamente</Button>
          </div>
        )}

        {isLoading ? (
          <LoadingState className="list-state">Carregando o progresso da empresa...</LoadingState>
        ) : overview && (
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
                      ? `Entregue a SIPAT a ${pluralize(noTracksCount, 'colaborador', 'colaboradores')}`
                      : `Acompanhe ${pluralize(notStartedCount, 'participante', 'participantes')} sem início`}
                  </h2>
                  <p className="m-0 text-sm text-muted-foreground">
                    {noTracksCount > 0
                      ? 'Esses colaboradores ainda não receberam nenhum dia da SIPAT.'
                      : 'Veja quem já recebeu os dias da SIPAT e ainda não iniciou.'}
                  </p>
                </div>
                <Link className={buttonVariants()} to={`/admin/learning?status=${nextStepStatus}`}>
                  {noTracksCount > 0
                    ? readOnly ? 'Ver colaboradores sem dias da SIPAT' : 'Escolher participantes'
                    : readOnly ? 'Ver acompanhamento' : 'Acompanhar progresso'}
                  <ArrowRight />
                </Link>
              </section>
            )}

            <section aria-label="Progresso de todos os participantes" className="grid items-start gap-4 lg:grid-cols-2">
              <Panel count={`${overview.participantCount} participantes`} id="participant-distribution-title" title="Situação dos participantes">
                {overview.participantCount === 0 ? (
                  <EmptyState
                    action={<Link className={buttonVariants({ variant: 'outline' })} to="/admin/learning">{readOnly ? 'Ver acompanhamento' : 'Adicionar participantes'}</Link>}
                    description="Cadastre ou importe participantes para acompanhar o progresso da empresa."
                    title="Ainda não há participantes"
                  />
                ) : (
                  <DistributionOverview overview={overview} />
                )}
              </Panel>

              <Panel count={`${overview.trackProgress.length} dias`} id="track-progress-title" title="Conclusão média por dia">
                {overview.trackProgress.length === 0 ? (
                  <EmptyState description="Quando a SIPAT for publicada, a evolução média de cada dia aparecerá aqui." title="Nenhum dia entregue" />
                ) : (
                  <ul className="m-0 grid list-none gap-4 p-0">
                    {[...overview.trackProgress]
                      .sort((first, second) => first.averageProgressPercentage - second.averageProgressPercentage)
                      .slice(0, 5)
                      .map((track) => (
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
                            value={track.averageProgressPercentage}
                          />
                        </li>
                      ))}
                  </ul>
                )}
                {overview.trackProgress.length > 5 && (
                  <Link className={buttonVariants({ variant: 'ghost', size: 'sm' })} to="/admin/learning">Ver todos os colaboradores</Link>
                )}
              </Panel>
            </section>
          </>
        )}
      </Page>
    </div>
  );
}

function Panel({ id, title, count, children }: { id: string; title: string; count: string; children: React.ReactNode }) {
  return (
    <article aria-labelledby={id} className="grid min-w-0 gap-5 rounded-lg bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-base font-semibold" id={id}>{title}</h2>
        <Badge>{count}</Badge>
      </div>
      {children}
    </article>
  );
}

function DistributionOverview({ overview }: { overview: CompanyLearningOverview }) {
  const visibleStatuses = overview.participantDistribution.filter(({ count }) => count > 0);
  const hasMultipleStatuses = visibleStatuses.length > 1;
  const total = overview.participantCount;
  const percent = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

  return (
    <div className={cn('grid items-center gap-6', hasMultipleStatuses ? 'sm:grid-cols-[11rem_minmax(0,1fr)]' : '')}>
      {hasMultipleStatuses ? (
        <DonutChart overview={overview} />
      ) : (
        <div className="grid gap-1">
          <strong className="text-4xl font-semibold tabular-nums">{visibleStatuses[0]?.count ?? 0}</strong>
          <span className="text-sm text-muted-foreground">
            {visibleStatuses[0]
              ? `${statusLabels[visibleStatuses[0].status]} · ${visibleStatuses[0].count} (${percent(visibleStatuses[0].count)}%)`
              : 'Sem participantes ativos'}
          </span>
        </div>
      )}
      <ul aria-label="Legenda do progresso" className="m-0 grid list-none gap-2.5 p-0">
        {visibleStatuses.map(({ status, count }) => (
          <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 text-sm" key={status}>
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />
            <span>{statusLabels[status]}</span>
            <strong className="tabular-nums">{count} ({percent(count)}%)</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DonutChart({ overview }: { overview: CompanyLearningOverview }) {
  const total = overview.participantCount;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg aria-label={`Distribuição do progresso de ${total} participantes`} className="mx-auto w-full max-w-44" role="img" viewBox="0 0 120 120">
      <circle cx="60" cy="60" fill="none" r={radius} stroke="#e8edea" strokeWidth="14" />
      {participantProgressStatuses.map((status) => {
        const count = overview.participantDistribution.find((item) => item.status === status)?.count ?? 0;
        const length = total === 0 ? 0 : (count / total) * circumference;
        const currentOffset = offset;
        offset += length;
        return count > 0 ? (
          <circle
            cx="60"
            cy="60"
            data-progress-status={status}
            fill="none"
            key={status}
            r={radius}
            stroke={statusColors[status]}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-currentOffset}
            strokeWidth="14"
            transform="rotate(-90 60 60)"
          />
        ) : null;
      })}
      <text aria-hidden="true" fill="currentColor" fontSize="26" fontWeight="600" textAnchor="middle" x="60" y="62">{total}</text>
      <text aria-hidden="true" fill="#52635b" fontSize="9" textAnchor="middle" x="60" y="76">participantes</text>
    </svg>
  );
}

function SummaryCard({ label, value, note, progress }: { label: string; value: string; note?: string; progress?: number }) {
  return (
    <article className="grid content-start gap-2 rounded-lg bg-card px-5 py-4 shadow-card">
      <span className="text-[0.8125rem] font-medium text-muted-foreground">{label}</span>
      <strong className="text-3xl font-semibold tabular-nums tracking-tight">{value}</strong>
      {progress !== undefined && <progress aria-label={`${label}: ${progress}%`} className={progressBar} max={100} value={progress} />}
      {note && <small className="text-xs text-muted-foreground">{note}</small>}
    </article>
  );
}
