import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAllParticipants, listLearningParticipation } from './api';
import {
  participantProgressStatuses,
  summarizeCompanyProgress,
  type CompanyLearningOverview,
  type ParticipantProgressStatus,
} from './participantProgress';
import './TenantLearningDashboardPage.css';
import LoadingState from './LoadingState';

const statusLabels: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluíram todas as trilhas',
  'in-progress': 'Em andamento',
  'not-started': 'Ainda não iniciaram',
  'no-tracks': 'Sem trilhas atribuídas',
  inactive: 'Participantes inativos',
};

const statusColors: Record<ParticipantProgressStatus, string> = {
  completed: 'var(--admin-success)',
  'in-progress': 'var(--admin-warning)',
  'not-started': 'var(--admin-muted)',
  'no-tracks': 'var(--admin-muted)',
  inactive: 'var(--admin-muted)',
};

export default function TenantLearningDashboardPage({ readOnly = false }: { readOnly?: boolean }) {
  const [overview, setOverview] = useState<CompanyLearningOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const [participants, participation] = await Promise.all([
        listAllParticipants(),
        listLearningParticipation(),
      ]);
      setOverview(summarizeCompanyProgress(participants, participation));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const noTracksCount = overview?.participantDistribution.find(({ status }) => status === 'no-tracks')?.count ?? 0;
  const notStartedCount = overview?.participantDistribution.find(({ status }) => status === 'not-started')?.count ?? 0;
  const nextStepStatus = noTracksCount > 0 ? 'no-tracks' : 'not-started';
  const nextStepCount = noTracksCount > 0 ? noTracksCount : notStartedCount;

  return (
    <div className="page-content tenant-learning-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO DA EMPRESA</p>
          <h1>Visão geral</h1>
          <p className="muted-copy">
            Acompanhe o progresso dos participantes e das trilhas da sua empresa.
          </p>
        </div>
        <div className="tenant-dashboard-actions">
          <button className="button button-quiet" disabled={isLoading} onClick={() => void loadOverview()} type="button">
            Atualizar
          </button>
          <Link className="button button-primary" to="/admin/learning">Ver participantes</Link>
        </div>
      </div>

      {error && <div className="form-error page-error" role="alert">
        <p>{error}</p>
        <button className="button button-secondary" onClick={() => void loadOverview()} type="button">Tentar novamente</button>
      </div>}

      {isLoading ? (
        <LoadingState className="list-state">Carregando o progresso da empresa...</LoadingState>
      ) : overview && (
        <>
          <section aria-label="Indicadores de aprendizagem da empresa" className="tenant-dashboard-summary">
            <SummaryCard
              label="Participantes ativos"
              value={overview.activeParticipantCount.toLocaleString('pt-BR')}
            />
            <SummaryCard
              label="Atribuições de trilhas"
              value={overview.assignedTrackCount.toLocaleString('pt-BR')}
              note={`${overview.trackProgress.length.toLocaleString('pt-BR')} ${overview.trackProgress.length === 1 ? 'trilha distinta' : 'trilhas distintas'} · ${overview.completedTrackCount.toLocaleString('pt-BR')} ${overview.completedTrackCount === 1 ? 'atribuição concluída' : 'atribuições concluídas'}`}
            />
            <SummaryCard
              label="Aulas concluídas"
              value={`${overview.completedLessonCount.toLocaleString('pt-BR')} / ${overview.lessonCount.toLocaleString('pt-BR')}`}
              note={`${overview.overallProgressPercentage}% do total atribuído`}
              progress={overview.overallProgressPercentage}
            />
          </section>

          {nextStepCount > 0 && (
            <section aria-labelledby="tenant-dashboard-next-step" className="tenant-dashboard-next-step">
              <div>
                <p className="eyebrow">PRÓXIMO PASSO</p>
                <h2 id="tenant-dashboard-next-step">
                  {noTracksCount > 0
                    ? `Libere trilhas para ${noTracksCount} ${noTracksCount === 1 ? 'participante' : 'participantes'}`
                    : `Acompanhe ${notStartedCount} ${notStartedCount === 1 ? 'participante' : 'participantes'} sem início`}
                </h2>
                <p>
                  {noTracksCount > 0
                    ? 'Esses participantes ainda não têm uma trilha atribuída.'
                    : 'Veja quem já tem trilhas liberadas e ainda não iniciou.'}
                </p>
              </div>
              <Link className="button button-primary" to={`/admin/learning?status=${nextStepStatus}`}>
                {noTracksCount > 0
                  ? readOnly ? 'Ver participantes sem trilhas' : 'Escolher participantes'
                  : readOnly ? 'Ver acompanhamento' : 'Acompanhar progresso'}
                <span aria-hidden="true"> →</span>
              </Link>
            </section>
          )}

          <section aria-label="Progresso de todos os participantes" className="tenant-dashboard-chart-grid">
            <article aria-labelledby="participant-distribution-title" className="tenant-dashboard-panel">
              <div className="tenant-dashboard-panel-heading">
                <div>
                  <h2 id="participant-distribution-title">Situação dos participantes</h2>
                </div>
                <span className="count-label">{overview.participantCount} participantes</span>
              </div>
              {overview.participantCount === 0 ? (
                <div className="tenant-dashboard-empty-chart">
                  <div className="empty-state compact-empty">
                    <h3>Ainda não há participantes</h3>
                    <p>Cadastre ou importe participantes para acompanhar o progresso da empresa.</p>
                    <Link className="button button-secondary" to="/admin/learning">
                      {readOnly ? 'Ver acompanhamento' : 'Adicionar participantes'}
                    </Link>
                  </div>
                </div>
              ) : (
                <DistributionOverview overview={overview} />
              )}
            </article>

            <article aria-labelledby="track-progress-title" className="tenant-dashboard-panel">
              <div className="tenant-dashboard-panel-heading">
                <div>
                  <h2 id="track-progress-title">Conclusão média por trilha</h2>
                </div>
                <span className="count-label">{overview.trackProgress.length} trilhas</span>
              </div>
              {overview.trackProgress.length === 0 ? (
                <div className="empty-state compact-empty">
                  <h3>Nenhuma trilha atribuída</h3>
                  <p>Quando as trilhas forem liberadas, a evolução média aparecerá aqui.</p>
                </div>
              ) : (
                <ul className="tenant-dashboard-track-list">
                  {[...overview.trackProgress]
                    .sort((first, second) => first.averageProgressPercentage - second.averageProgressPercentage)
                    .slice(0, 5)
                    .map((track) => (
                    <li key={track.trackId}>
                      <div className="tenant-dashboard-track-heading">
                        <strong>{track.trackTitle}</strong>
                        <span>{track.completedParticipantCount}/{track.participantCount} concluíram · {track.averageProgressPercentage}%</span>
                      </div>
                      <div className="tenant-dashboard-track-progress">
                        <progress
                          aria-label={`${track.trackTitle}: ${track.averageProgressPercentage}% de progresso médio`}
                          max={100}
                          value={track.averageProgressPercentage}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {overview.trackProgress.length > 5 && (
                <Link className="button button-quiet" to="/admin/learning">Ver todas as trilhas</Link>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

function DistributionOverview({ overview }: { overview: CompanyLearningOverview }) {
  const visibleStatuses = overview.participantDistribution.filter(({ count }) => count > 0);
  const hasMultipleStatuses = visibleStatuses.length > 1;
  const total = overview.participantCount;

  return (
    <div className={`tenant-dashboard-donut-layout${hasMultipleStatuses ? '' : ' is-single-status'}`}>
      {hasMultipleStatuses ? (
        <DonutChart overview={overview} />
      ) : (
        <div className="tenant-dashboard-single-status">
          <strong>{visibleStatuses[0]?.count ?? 0}</strong>
          <span>
            {visibleStatuses[0]
              ? `${statusLabels[visibleStatuses[0].status]} · ${visibleStatuses[0].count} (${total > 0 ? Math.round(visibleStatuses[0].count / total * 100) : 0}%)`
              : 'Sem participantes ativos'}
          </span>
        </div>
      )}
      <ul aria-label="Legenda do progresso" className="tenant-dashboard-legend">
        {visibleStatuses.map(({ status, count }) => (
          <li key={status}>
            <span aria-hidden="true" className="tenant-dashboard-legend-dot" style={{ backgroundColor: statusColors[status] }} />
            <span>{statusLabels[status]}</span>
            <strong>{count} ({total > 0 ? Math.round(count / total * 100) : 0}%)</strong>
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
    <svg
      aria-label={`Distribuição do progresso de ${total} participantes`}
      className="tenant-dashboard-donut"
      role="img"
      viewBox="0 0 120 120"
    >
      <circle className="tenant-dashboard-donut-track" cx="60" cy="60" r={radius} />
      {participantProgressStatuses.map((status) => {
        const segment = overview.participantDistribution.find((item) => item.status === status);
        const count = segment?.count ?? 0;
        const length = total === 0 ? 0 : count / total * circumference;
        const currentOffset = offset;
        offset += length;
        return count > 0 ? (
          <circle
            data-progress-status={status}
            key={status}
            cx="60"
            cy="60"
            r={radius}
            stroke={statusColors[status]}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-currentOffset}
            transform="rotate(-90 60 60)"
          />
        ) : null;
      })}
      <text aria-hidden="true" className="tenant-dashboard-donut-total" textAnchor="middle" x="60" y="58">
        {total}
      </text>
      <text aria-hidden="true" className="tenant-dashboard-donut-caption" textAnchor="middle" x="60" y="72">
        participantes
      </text>
    </svg>
  );
}

function SummaryCard({ label, value, note, progress }: {
  label: string; value: string; note?: string; progress?: number;
}) {
  return (
    <article className="platform-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {progress !== undefined && (
        <progress aria-label={`${label}: ${progress}%`} max={100} value={progress} />
      )}
      {note && <small>{note}</small>}
    </article>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar o painel.';
}
