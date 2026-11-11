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
  inactive: 'Contas inativas',
};

const statusColors: Record<ParticipantProgressStatus, string> = {
  completed: '#176b52',
  'in-progress': '#55a982',
  'not-started': '#d29c28',
  'no-tracks': '#aebbb6',
  inactive: '#56645f',
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

  return (
    <div className="page-content tenant-learning-dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO DA EMPRESA</p>
          <h1>Visão geral</h1>
          <p className="muted-copy">
            Acompanhe o progresso das pessoas e das trilhas da sua empresa.
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
              note={`${overview.participantCount.toLocaleString('pt-BR')} contas no total`}
            />
            <SummaryCard
              label="Trilhas liberadas"
              value={overview.assignedTrackCount.toLocaleString('pt-BR')}
              note={`${overview.completedTrackCount.toLocaleString('pt-BR')} concluídas`}
            />
            <SummaryCard
              label="Aulas concluídas"
              value={`${overview.completedLessonCount.toLocaleString('pt-BR')} / ${overview.lessonCount.toLocaleString('pt-BR')}`}
              note={`${overview.overallProgressPercentage}% do total atribuído`}
            />
          </section>

          <section aria-label="Progresso de todos os participantes" className="tenant-dashboard-chart-grid">
            <article aria-labelledby="participant-distribution-title" className="tenant-dashboard-panel">
              <div className="tenant-dashboard-panel-heading">
                <div>
                  <p className="eyebrow">PARTICIPANTES</p>
                  <h2 id="participant-distribution-title">Progresso da empresa</h2>
                </div>
                <span className="count-label">{overview.participantCount} pessoas</span>
              </div>
              {overview.participantCount === 0 ? (
                <div className="tenant-dashboard-empty-chart">
                  <DonutChart overview={overview} />
                  <div className="empty-state compact-empty">
                    <h3>Ainda não há participantes</h3>
                    <p>Cadastre ou importe pessoas para acompanhar o progresso da empresa.</p>
                    <Link className="button button-secondary" to="/admin/learning">
                      {readOnly ? 'Ver acompanhamento' : 'Adicionar participantes'}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="tenant-dashboard-donut-layout">
                  <DonutChart overview={overview} />
                  <ul aria-label="Legenda do progresso" className="tenant-dashboard-legend">
                    {overview.participantDistribution.map(({ status, count }) => (
                      <li key={status}>
                        <span aria-hidden="true" className="tenant-dashboard-legend-dot" style={{ backgroundColor: statusColors[status] }} />
                        <span>{statusLabels[status]}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {overview.participantCount > 0 && (
                <p className="tenant-dashboard-chart-note">
                  Cada pessoa aparece uma vez. Contas inativas ficam separadas; participantes sem trilhas também entram no total.
                </p>
              )}
            </article>

            <article aria-labelledby="track-progress-title" className="tenant-dashboard-panel">
              <div className="tenant-dashboard-panel-heading">
                <div>
                  <p className="eyebrow">TRILHAS DA EMPRESA</p>
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
                  {overview.trackProgress.map((track) => (
                    <li key={track.trackId}>
                      <div className="tenant-dashboard-track-heading">
                        <strong>{track.trackTitle}</strong>
                        <span>{track.completedParticipantCount}/{track.participantCount} concluíram</span>
                      </div>
                      <div className="tenant-dashboard-track-progress">
                        <progress
                          aria-label={`${track.trackTitle}: ${track.averageProgressPercentage}% de progresso médio`}
                          max={100}
                          value={track.averageProgressPercentage}
                        />
                        <strong>{track.averageProgressPercentage}%</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>
        </>
      )}
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
        pessoas
      </text>
    </svg>
  );
}

function SummaryCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="platform-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível carregar o painel.';
}
