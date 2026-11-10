import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  assignLearningTrack,
  createParticipant,
  listParticipants,
  listLearningParticipation,
  listTenantLearningTracks,
  type CreateParticipantData,
  type LearningParticipantProgress,
  type LearningTrackSummary,
  type ParticipantAccount,
} from './api';

const emptyParticipant: CreateParticipantData = {
  loginIdentifier: '',
  displayName: '',
  initialPassword: '',
  role: 'Participant',
};

export default function LearningManagementPage() {
  const [participants, setParticipants] = useState<ParticipantAccount[]>([]);
  const [tracks, setTracks] = useState<LearningTrackSummary[]>([]);
  const [participation, setParticipation] = useState<LearningParticipantProgress[]>([]);
  const [participantForm, setParticipantForm] = useState(emptyParticipant);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingParticipant, setIsSavingParticipant] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const publishedTracks = useMemo(
    () => tracks.filter((track) => track.isPublished),
    [tracks],
  );
  const selectedParticipant = participants.find(
    (participant) => participant.id === selectedParticipantId,
  );
  const assignedTracks = participation.filter(
    (row) => row.participantId === selectedParticipantId,
  );
  const assignedTrackIds = new Set(assignedTracks.map((row) => row.trackId));
  const availableTracks = publishedTracks.filter((track) => !assignedTrackIds.has(track.id));

  const loadData = useCallback(async (preferredParticipantId?: string) => {
    setIsLoading(true);
    setError('');
    try {
      const [participantPage, availableTracks, participationRows] = await Promise.all([
        listParticipants(),
        listTenantLearningTracks(),
        listLearningParticipation(),
      ]);
      setParticipants(participantPage.items);
      setTracks(availableTracks);
      setParticipation(participationRows);
      const nextParticipantId = (
        participantPage.items.find(
          (participant) => participant.id === preferredParticipantId && participant.isActive,
        ) ??
        participantPage.items.find((participant) => participant.isActive) ??
        participantPage.items[0]
      )?.id ?? '';
      setSelectedParticipantId(nextParticipantId);
      const assignedTrackIds = new Set(
        participationRows
          .filter((row) => row.participantId === nextParticipantId)
          .map((row) => row.trackId),
      );
      const nextAvailableTracks = availableTracks.filter(
        (track) => track.isPublished && !assignedTrackIds.has(track.id),
      );
      setSelectedTrackId((current) =>
        nextAvailableTracks.some((track) => track.id === current)
          ? current
          : nextAvailableTracks[0]?.id ?? '',
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleCreateParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSavingParticipant(true);

    try {
      const participant = await createParticipant({
        ...participantForm,
        loginIdentifier: participantForm.loginIdentifier.trim(),
        displayName: participantForm.displayName.trim(),
      });
      setParticipantForm(emptyParticipant);
      setSelectedParticipantId(participant.id);
      setNotice(`A conta de ${participant.displayName} foi criada nesta empresa.`);
      await loadData(participant.id);
      setSelectedParticipantId(participant.id);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSavingParticipant(false);
    }
  }

  async function handleAssignTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsAssigning(true);

    try {
      await assignLearningTrack(selectedTrackId, selectedParticipantId);
      const participant = participants.find((item) => item.id === selectedParticipantId);
      const track = publishedTracks.find((item) => item.id === selectedTrackId);
      setNotice(`"${track?.title}" foi atribuída a ${participant?.displayName}.`);
      await loadData(selectedParticipantId);
    } catch (assignError) {
      setError(getErrorMessage(assignError));
    } finally {
      setIsAssigning(false);
    }
  }

  function handleParticipantChange(participantId: string) {
    setSelectedParticipantId(participantId);
    const assignedTrackIds = new Set(
      participation
        .filter((row) => row.participantId === participantId)
        .map((row) => row.trackId),
    );
    setSelectedTrackId(
      publishedTracks.find((track) => !assignedTrackIds.has(track.id))?.id ?? '',
    );
  }

  return (
    <div className="page-content learning-management-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO DA EMPRESA</p>
          <h1>Participantes e trilhas</h1>
          <p className="muted-copy">
            Crie contas de participantes e atribua as trilhas publicadas para esta empresa.
          </p>
        </div>
        <span className="count-label">
          {participants.length} {participants.length === 1 ? 'participante' : 'participantes'}
        </span>
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <div className="management-grid">
        <section aria-labelledby="participant-form-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NOVO ACESSO</p>
              <h2 id="participant-form-title">Cadastrar participante</h2>
            </div>
          </div>
          <form className="event-form event-form-single" onSubmit={handleCreateParticipant}>
            <div className="field">
              <label htmlFor="participant-name">Nome completo</label>
              <input
                autoComplete="name"
                id="participant-name"
                maxLength={150}
                onChange={(event) =>
                  setParticipantForm((current) => ({ ...current, displayName: event.target.value }))
                }
                required
                value={participantForm.displayName}
              />
            </div>
            <div className="field">
              <label htmlFor="participant-login">Matrícula</label>
              <input
                autoComplete="off"
                id="participant-login"
                maxLength={128}
                onChange={(event) =>
                  setParticipantForm((current) => ({ ...current, loginIdentifier: event.target.value }))
                }
                required
                value={participantForm.loginIdentifier}
              />
            </div>
            <div className="field">
              <label htmlFor="participant-password">Senha inicial temporária</label>
              <input
                autoComplete="new-password"
                id="participant-password"
                minLength={12}
                onChange={(event) =>
                  setParticipantForm((current) => ({ ...current, initialPassword: event.target.value }))
                }
                required
                type="password"
                value={participantForm.initialPassword}
              />
              <span className="field-hint">
                Use uma senha forte e entregue-a por um canal seguro.
              </span>
            </div>
            <div className="form-actions full-width">
              <button
                className="button button-primary"
                disabled={isSavingParticipant}
                type="submit"
              >
                {isSavingParticipant ? 'Criando conta...' : 'Criar participante'}
              </button>
            </div>
          </form>
        </section>

        <section aria-labelledby="assign-track-title" className="form-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACESSO AO CONTEÚDO</p>
              <h2 id="assign-track-title">Atribuir trilha</h2>
            </div>
          </div>
          {isLoading ? (
            <p className="list-state" aria-live="polite">Carregando participantes e trilhas...</p>
          ) : participants.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>Cadastre um participante primeiro</h3>
              <p>Depois você poderá atribuir a ele as trilhas da empresa.</p>
            </div>
          ) : publishedTracks.length === 0 ? (
            <div className="empty-state compact-empty">
              <h3>Nenhuma trilha publicada disponível</h3>
              <p>Publique uma trilha da empresa para habilitar a atribuição.</p>
            </div>
          ) : !selectedParticipant?.isActive ? (
            <div className="empty-state compact-empty">
              <h3>Selecione um participante ativo</h3>
              <p>As trilhas atribuídas e disponíveis serão exibidas para a pessoa selecionada.</p>
            </div>
          ) : (
            <div className="participant-learning">
              <div className="field">
                <label htmlFor="assignment-participant">Participante</label>
                <select
                  id="assignment-participant"
                  onChange={(event) => handleParticipantChange(event.target.value)}
                  required
                  value={selectedParticipantId}
                >
                  {participants.map((participant) => (
                    <option disabled={!participant.isActive} key={participant.id} value={participant.id}>
                      {participant.displayName}
                      {participant.isActive ? '' : ' (inativo)'}
                    </option>
                  ))}
                </select>
              </div>

              <section aria-labelledby="assigned-tracks-title" className="assigned-tracks">
                <div className="assigned-tracks-heading">
                  <div>
                    <p className="eyebrow">TRILHAS LIBERADAS PARA O PARTICIPANTE</p>
                    <h3 id="assigned-tracks-title">
                      Trilhas de {selectedParticipant.displayName}
                    </h3>
                  </div>
                  <span className="count-label">
                    {assignedTracks.length} {assignedTracks.length === 1 ? 'trilha' : 'trilhas'}
                  </span>
                </div>
                {assignedTracks.length === 0 ? (
                  <p className="assigned-tracks-empty">
                    Nenhuma trilha atribuída ainda. Escolha uma trilha abaixo para liberar o acesso.
                  </p>
                ) : (
                  <ul className="assigned-track-list">
                    {assignedTracks.map((row) => (
                      <li className="assigned-track-card" key={row.trackId}>
                        <div className="assigned-track-details">
                          <strong>{row.trackTitle}</strong>
                          <span>
                            {row.lessonCount} {row.lessonCount === 1 ? 'vídeo' : 'vídeos'}
                            {' · '}
                            {row.completedLessonCount} de {row.lessonCount} concluídos
                          </span>
                        </div>
                        <div className="assigned-track-progress">
                          <progress
                            aria-label={`${row.trackTitle}: ${row.progressPercentage}% concluído`}
                            max={100}
                            value={row.progressPercentage}
                          />
                          <strong>{row.progressPercentage}%</strong>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {availableTracks.length === 0 ? (
                <p className="assigned-tracks-empty" role="status">
                  Todas as trilhas publicadas já foram atribuídas a este participante.
                </p>
              ) : (
                <form className="event-form event-form-single assignment-form" onSubmit={handleAssignTrack}>
                  <div className="field">
                    <label htmlFor="assignment-track">Nova trilha disponível</label>
                    <select
                      id="assignment-track"
                      onChange={(event) => setSelectedTrackId(event.target.value)}
                      required
                      value={selectedTrackId}
                    >
                      {availableTracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.title} · {track.lessonCount} {track.lessonCount === 1 ? 'vídeo' : 'vídeos'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="field-hint">
                    Trilhas já atribuídas não aparecem nesta lista. O vínculo com a empresa também é validado pela API.
                  </p>
                  <div className="form-actions full-width">
                    <button
                      className="button button-primary"
                      disabled={isAssigning || !selectedParticipantId || !selectedTrackId}
                      type="submit"
                    >
                      {isAssigning ? 'Atribuindo...' : 'Atribuir trilha'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="participant-list-title" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONTAS DA EMPRESA</p>
            <h2 id="participant-list-title">Participantes</h2>
          </div>
          {!isLoading && <span className="count-label">{participants.length} contas</span>}
        </div>
        {isLoading ? (
          <p className="list-state" aria-live="polite">Carregando participantes...</p>
        ) : participants.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhum participante cadastrado</h3>
            <p>As contas criadas para esta empresa aparecerão aqui.</p>
          </div>
        ) : (
          <div className="company-list">
            {participants.map((participant) => (
              <article className="company-card" key={participant.id}>
                <div>
                  <p className="eyebrow">{participant.loginIdentifier}</p>
                  <h3>{participant.displayName}</h3>
                </div>
                <span className={`status-pill${participant.isActive ? ' status-active' : ''}`}>
                  {participant.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="participation-title" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACOMPANHAMENTO</p>
            <h2 id="participation-title">Progresso por participante</h2>
          </div>
          {!isLoading && <span className="count-label">{participation.length} atribuições</span>}
        </div>
        {isLoading ? (
          <p className="list-state" aria-live="polite">Carregando progresso...</p>
        ) : participation.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhuma trilha atribuída</h3>
            <p>As atribuições e o progresso dos participantes aparecerão aqui.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Participante</th>
                  <th scope="col">Trilha</th>
                  <th scope="col">Vídeos concluídos</th>
                  <th scope="col">Progresso</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {participation.map((row) => (
                  <tr key={`${row.participantId}-${row.trackId}`}>
                    <td>
                      <strong>{row.displayName}</strong>
                      <span className="table-secondary">{row.loginIdentifier}</span>
                    </td>
                    <td>{row.trackTitle}</td>
                    <td>{row.completedLessonCount} de {row.lessonCount}</td>
                    <td>
                      <div className="progress-cell">
                        <progress max={100} value={row.progressPercentage} />
                        <span>{row.progressPercentage}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill${row.isCompleted ? ' status-active' : ''}`}>
                        {row.isCompleted ? 'Concluída' : row.progressPercentage > 0 ? 'Em andamento' : 'Não iniciada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
