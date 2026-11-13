import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { useSearchParams } from 'react-router-dom';
import CourseDialog from './CourseDialog';
import LoadingState from './LoadingState';
import ParticipantOutcomesPanel from './ParticipantOutcomesPanel';
import {
  assignLearningTrack,
  changeUserStatus,
  createParticipant,
  getLearningParticipantReport,
  listAllParticipants,
  listLearningParticipation,
  listTenantLearningTracks,
  renameUser,
  type CreateParticipantData,
  type LearningParticipantProgress,
  type LearningParticipantReport,
  type LearningTrackSummary,
  type ParticipantAccount,
} from './api';
import {
  createParticipantsFromCsv,
  MAX_PARTICIPANT_CSV_BYTES,
  MAX_PARTICIPANT_CSV_ROWS,
  parseParticipantCsv,
  serializeCredentialCsv,
  type ParticipantCsvImportResult,
  type ParticipantCsvParseResult,
} from './participantCsv';
import {
  filterParticipantProgress,
  summarizeParticipants,
  type ParticipantProgressFilter,
  type ParticipantProgressSummary,
  type ParticipantProgressStatus,
} from './participantProgress';
import {
  companyReportCsv,
  formatReportDate,
  formatWatchTime,
  participantReportCsv,
  reportFileName,
} from './participantReports';
import './LearningManagementPage.css';

const emptyParticipant: CreateParticipantData = {
  loginIdentifier: '',
  displayName: '',
  initialPassword: '',
  role: 'Participant',
};

const statusLabels: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluiu todas as trilhas',
  'in-progress': 'Em andamento',
  'not-started': 'Não iniciou',
  'no-tracks': 'Sem trilhas',
  inactive: 'Inativo',
};

const filterOptions: { value: ParticipantProgressFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'in-progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluiu todas as trilhas' },
  { value: 'not-started', label: 'Não iniciou' },
  { value: 'no-tracks', label: 'Sem trilhas' },
  { value: 'inactive', label: 'Inativos' },
];

type AddParticipantMode = 'single' | 'csv';

export default function LearningManagementPage({ readOnly = false }: { readOnly?: boolean }) {
  const [searchParams] = useSearchParams();
  const [participants, setParticipants] = useState<ParticipantAccount[]>([]);
  const [tracks, setTracks] = useState<LearningTrackSummary[]>([]);
  const [participation, setParticipation] = useState<LearningParticipantProgress[]>([]);
  const [participantForm, setParticipantForm] = useState(emptyParticipant);
  const [selectedParticipantId, setSelectedParticipantId] = useState('');
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'progress'>('name');
  const [statusFilter, setStatusFilter] = useState<ParticipantProgressFilter>(
    () => getParticipantProgressFilter(searchParams.get('status')),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingParticipant, setIsSavingParticipant] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isReadingCsv, setIsReadingCsv] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddParticipantMode>('single');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvParseResult, setCsvParseResult] = useState<ParticipantCsvParseResult | null>(null);
  const [csvImportResult, setCsvImportResult] = useState<ParticipantCsvImportResult | null>(null);
  const [credentialsDownloaded, setCredentialsDownloaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [report, setReport] = useState<LearningParticipantReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [notice, setNotice] = useState('');

  const summaries = useMemo(
    () => summarizeParticipants(participants, participation),
    [participants, participation],
  );
  const visibleParticipants = useMemo(
    () => filterParticipantProgress(summaries, search, statusFilter).sort((first, second) => (
      sortMode === 'name'
        ? first.participant.displayName.localeCompare(second.participant.displayName, 'pt-BR')
        : second.overallProgressPercentage - first.overallProgressPercentage
    )),
    [summaries, search, sortMode, statusFilter],
  );
  const publishedTracks = useMemo(() => tracks.filter((track) => track.isPublished), [tracks]);
  const selectedSummary = summaries.find((summary) => summary.participant.id === selectedParticipantId);
  const assignedTracks = selectedSummary?.tracks ?? [];
  const assignedTrackIds = new Set(assignedTracks.map((track) => track.trackId));
  const availableTracks = publishedTracks.filter((track) => !assignedTrackIds.has(track.id));

  const loadData = useCallback(async (preferredParticipantId?: string) => {
    setIsLoading(true);
    setError('');
    try {
      const [participantAccounts, tenantTracks, participationRows] = await Promise.all([
        listAllParticipants(),
        listTenantLearningTracks(),
        listLearningParticipation(),
      ]);
      setParticipants(participantAccounts);
      setTracks(tenantTracks);
      setParticipation(participationRows);
      const nextParticipantId = (
        participantAccounts.find((participant) => participant.id === preferredParticipantId)
        ?? participantAccounts.find((participant) => participant.isActive)
        ?? participantAccounts[0]
      )?.id ?? '';
      setSelectedParticipantId(nextParticipantId);
      const assignedTrackIds = new Set(
        participationRows
          .filter((row) => row.participantId === nextParticipantId)
          .map((row) => row.trackId),
      );
      setSelectedTrackId(
        tenantTracks.find((track) => track.isPublished && !assignedTrackIds.has(track.id))?.id ?? '',
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

  useEffect(() => {
    if (!isDetailsOpen || !selectedParticipantId) return undefined;
    let cancelled = false;
    setReport(null);
    setReportError('');
    getLearningParticipantReport(selectedParticipantId)
      .then((value) => { if (!cancelled) setReport(value); })
      .catch((reportLoadError) => { if (!cancelled) setReportError(getErrorMessage(reportLoadError)); });
    return () => { cancelled = true; };
  }, [isDetailsOpen, selectedParticipantId]);

  const visibleIds = visibleParticipants.map((summary) => summary.participant.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => (allVisibleSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleSaveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = participants.find((participant) => participant.id === selectedParticipantId);
    const name = (editingName ?? '').trim();
    if (!target || name === '') { setEditError('Informe o nome do colaborador.'); return; }
    setIsSavingName(true);
    setEditError('');
    try {
      await renameUser(target.id, name);
      setEditingName(null);
      setNotice(`Os dados de ${name} foram atualizados.`);
      await loadData(target.id);
    } catch (failure) {
      setEditError(getErrorMessage(failure));
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleBulkStatus(isActive: boolean) {
    const targets = participants.filter((participant) => selectedIds.has(participant.id) && participant.isActive !== isActive);
    if (targets.length === 0) {
      setNotice(isActive ? 'As pessoas selecionadas já estão ativas.' : 'As pessoas selecionadas já estão inativas.');
      return;
    }
    const verb = isActive ? 'ativar' : 'desativar';
    const detail = isActive ? '' : ' Elas deixam de acessar a plataforma, mas o progresso é mantido.';
    if (!window.confirm(`Deseja ${verb} ${targets.length} ${targets.length === 1 ? 'pessoa' : 'pessoas'}?${detail}`)) return;
    setIsBulkBusy(true);
    setError('');
    setNotice('');
    const failed: string[] = [];
    for (const participant of targets) {
      try {
        await changeUserStatus(participant.id, isActive);
      } catch {
        failed.push(participant.displayName);
      }
    }
    setIsBulkBusy(false);
    setSelectedIds(new Set());
    await loadData(selectedParticipantId);
    const done = targets.length - failed.length;
    setNotice(`${done} ${done === 1 ? 'pessoa' : 'pessoas'} ${isActive ? 'ativada(s)' : 'desativada(s)'}.`);
    if (failed.length > 0) setError(`Não foi possível alterar: ${failed.join(', ')}.`);
  }

  function handleDownloadCompanyReport() {
    downloadCsv(reportFileName('empresa'), companyReportCsv(participants, participation));
  }

  function handleDownloadParticipantReport() {
    if (!report) return;
    downloadCsv(reportFileName(report.displayName), participantReportCsv(report));
  }

  async function handleCreateParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError('');
    setIsSavingParticipant(true);

    try {
      const participant = await createParticipant({
        ...participantForm,
        loginIdentifier: participantForm.loginIdentifier.trim(),
        displayName: participantForm.displayName.trim(),
      });
      setParticipantForm(emptyParticipant);
      setIsAddDialogOpen(false);
      setNotice(`A conta de ${participant.displayName} foi criada. Agora você pode liberar trilhas.`);
      await loadData(participant.id);
      setSelectedParticipantId(participant.id);
      setIsDetailsOpen(true);
    } catch (saveError) {
      setDialogError(getErrorMessage(saveError));
    } finally {
      setIsSavingParticipant(false);
    }
  }

  async function handleAssignTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedParticipantId || !selectedTrackId) return;
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

  function openAddDialog() {
    setParticipantForm(emptyParticipant);
    setAddMode('single');
    setCsvFileName('');
    setCsvParseResult(null);
    setCsvImportResult(null);
    setCredentialsDownloaded(false);
    setDialogError('');
    setIsAddDialogOpen(true);
  }

  function closeAddDialog() {
    if (isSavingParticipant || isImporting) return;
    if (csvImportResult?.created.length && !credentialsDownloaded) {
      setDialogError('Baixe o arquivo de acessos antes de fechar. As senhas não ficam salvas no portal.');
      return;
    }
    setIsAddDialogOpen(false);
    setParticipantForm(emptyParticipant);
    setCsvFileName('');
    setCsvParseResult(null);
    setCsvImportResult(null);
    setCredentialsDownloaded(false);
    setDialogError('');
  }

  function openParticipantDetails(summary: ParticipantProgressSummary) {
    setSelectedParticipantId(summary.participant.id);
    setSelectedTrackId(
      publishedTracks.find((track) => !summary.tracks.some((assigned) => assigned.trackId === track.id))?.id ?? '',
    );
    setIsDetailsOpen(true);
  }

  async function handleCsvFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvImportResult(null);
    setDialogError('');

    if (file.size > MAX_PARTICIPANT_CSV_BYTES) {
      setCsvParseResult({
        rows: [],
        issues: [],
        fatalError: 'O arquivo excede o limite de 2 MiB.',
      });
      return;
    }

    setIsReadingCsv(true);
    try {
      setCsvParseResult(parseParticipantCsv(
        await readCsvFile(file),
        participants.map((participant) => participant.loginIdentifier),
      ));
    } catch (readError) {
      setCsvParseResult({
        rows: [],
        issues: [],
        fatalError: getErrorMessage(readError),
      });
    } finally {
      setIsReadingCsv(false);
    }
  }

  async function handleImportParticipants() {
    const rows = csvParseResult?.rows ?? [];
    if (!rows.length || csvParseResult?.fatalError) return;
    setDialogError('');
    setIsImporting(true);
    try {
      const result = await createParticipantsFromCsv(rows, createParticipant);
      setCsvImportResult(result);
      if (result.created.length > 0) {
        await loadData(result.created[0].participant.id);
        setSelectedParticipantId(result.created[0].participant.id);
      }
    } catch (importError) {
      setDialogError(getErrorMessage(importError));
    } finally {
      setIsImporting(false);
    }
  }

  function handleDownloadCredentials() {
    if (!csvImportResult?.created.length) return;
    try {
      downloadCsv(
        `acessos-participantes-${new Date().toISOString().slice(0, 10)}.csv`,
        serializeCredentialCsv(csvImportResult.created),
      );
      setCredentialsDownloaded(true);
      setDialogError('');
    } catch (downloadError) {
      setDialogError(getErrorMessage(downloadError));
    }
  }

  function handleDownloadCsvTemplate() {
    try {
      downloadCsv(
        'modelo-importacao-participantes.csv',
        '\uFEFFnome;login\r\nMaria Silva;maria.silva\r\n',
      );
    } catch (downloadError) {
      setDialogError(getErrorMessage(downloadError));
    }
  }

  return (
    <div className="page-content participant-management-page">
      <div className="page-heading participant-page-heading">
        <div>
          <p className="eyebrow">GESTÃO DA EMPRESA</p>
          <h1>Participantes e trilhas</h1>
          <p className="muted-copy">
            Encontre cada pessoa, acompanhe todas as suas trilhas e mantenha os acessos da empresa em dia.
          </p>
        </div>
        <div className="participant-heading-actions">
          {!isLoading && (search || statusFilter !== 'all') && <span className="count-label">
            {visibleParticipants.length} de {participants.length} participantes
          </span>}
          <button className="button button-secondary" disabled={isLoading || participants.length === 0} onClick={handleDownloadCompanyReport} type="button">
            Baixar relatório (CSV)
          </button>
          {!readOnly && <button className="button button-primary" onClick={openAddDialog} type="button">
            Adicionar participantes
          </button>}
        </div>
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}
      {readOnly && <p className="muted-copy">Modo de consulta: acompanhe o progresso, as atividades e os certificados da sua empresa.</p>}

      <section aria-labelledby="participant-list-title" className="participant-directory">
        <div className="participant-directory-heading">
          <div>
            <p className="eyebrow">ACOMPANHAMENTO</p>
            <h2 id="participant-list-title">Progresso por participante</h2>
          </div>
        </div>
        <div className="participant-directory-filters">
          <div className="field participant-search-field">
            <label htmlFor="participant-search">Buscar por nome ou usuário</label>
            <input
              autoComplete="off"
              id="participant-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: Maria ou jose.maria"
              type="search"
              value={search}
            />
          </div>
          <div className="field participant-status-field">
            <label htmlFor="participant-status-filter">Situação</label>
            <select
              id="participant-status-filter"
              onChange={(event) => setStatusFilter(event.target.value as ParticipantProgressFilter)}
              value={statusFilter}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="participant-sort">Ordenar por</label>
            <select
              id="participant-sort"
              onChange={event => setSortMode(event.target.value as 'name' | 'progress')}
              value={sortMode}
            >
              <option value="name">Nome</option>
              <option value="progress">Progresso</option>
            </select>
          </div>
          {(search || statusFilter !== 'all') && (
            <button
              className="button button-quiet participant-clear-filters"
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
              type="button"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {!readOnly && selectedIds.size > 0 && (
          <div aria-label="Ações em lote" className="participant-bulk-bar" role="group">
            <strong>{selectedIds.size} {selectedIds.size === 1 ? 'selecionada' : 'selecionadas'}</strong>
            <button className="button button-secondary" disabled={isBulkBusy} onClick={() => void handleBulkStatus(true)} type="button">Ativar</button>
            <button className="button button-secondary" disabled={isBulkBusy} onClick={() => void handleBulkStatus(false)} type="button">Desativar</button>
            <button className="button button-quiet" disabled={isBulkBusy} onClick={() => setSelectedIds(new Set())} type="button">Limpar seleção</button>
          </div>
        )}

        {isLoading ? (
          <LoadingState className="list-state">Carregando participantes e progresso...</LoadingState>
        ) : participants.length === 0 ? (
          <div className="empty-state">
            <h3>Nenhum participante cadastrado</h3>
            <p>{readOnly ? 'Os participantes aparecerão aqui após o cadastro pelo administrador.' : 'Adicione uma pessoa ou importe sua lista em CSV para começar.'}</p>
            {!readOnly && <button className="button button-secondary" onClick={openAddDialog} type="button">
              Adicionar participantes
            </button>}
          </div>
        ) : visibleParticipants.length === 0 ? (
          <div className="empty-state compact-empty" role="status">
            <h3>Nenhum participante encontrado</h3>
            <p>Altere o nome, o usuário ou o filtro de situação.</p>
          </div>
        ) : (
          <div className="table-scroll participant-directory-table">
            <table aria-label="Participantes da empresa e progresso geral" className="data-table">
              <thead>
                <tr>
                  {!readOnly && <th scope="col">
                    <input
                      aria-label="Selecionar todos os participantes listados"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      type="checkbox"
                    />
                  </th>}
                  <th scope="col">Participante</th>
                  <th scope="col">Trilhas concluídas</th>
                  <th scope="col">Aulas concluídas</th>
                  <th scope="col">Situação</th>
                  <th scope="col"><span className="visually-hidden">Detalhes</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleParticipants.map((summary) => (
                  <ParticipantRow
                    key={summary.participant.id}
                    onOpen={() => openParticipantDetails(summary)}
                    onToggle={readOnly ? undefined : () => toggleSelected(summary.participant.id)}
                    selected={selectedIds.has(summary.participant.id)}
                    summary={summary}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!readOnly && isAddDialogOpen && (
        <CourseDialog
          busy={isSavingParticipant || isImporting}
          onClose={closeAddDialog}
          title="Adicionar participantes"
          wide
        >
          <div aria-label="Tipo de cadastro" className="participant-add-modes">
            <button
              aria-pressed={addMode === 'single'}
              className={addMode === 'single' ? 'is-selected' : ''}
              onClick={() => { setAddMode('single'); setDialogError(''); }}
              type="button"
            >
              Criar um participante
            </button>
            <button
              aria-pressed={addMode === 'csv'}
              className={addMode === 'csv' ? 'is-selected' : ''}
              onClick={() => { setAddMode('csv'); setDialogError(''); }}
              type="button"
            >
              Importar CSV
            </button>
          </div>
          {dialogError && <p className="form-error" role="alert">{dialogError}</p>}
          {addMode === 'single' ? (
            <form className="event-form event-form-single participant-create-form" onSubmit={handleCreateParticipant}>
              <p className="muted-copy">
                Crie um acesso individual. O login identifica a pessoa nesta empresa.
              </p>
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
                <label htmlFor="participant-login">Login</label>
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
                <label htmlFor="participant-password">Senha inicial</label>
                <input
                  autoComplete="new-password"
                  id="participant-password"
                  minLength={passwordMinLength}
                  onChange={(event) =>
                    setParticipantForm((current) => ({ ...current, initialPassword: event.target.value }))
                  }
                  required
                  type="password"
                  value={participantForm.initialPassword}
                />
                <span className="field-hint">{passwordRulesHint}</span>
              </div>
              <div className="form-actions full-width">
                <button className="button button-primary" disabled={isSavingParticipant} type="submit">
                  {isSavingParticipant ? 'Criando conta...' : 'Criar participante'}
                </button>
              </div>
            </form>
          ) : (
            <div className="participant-csv-import">
              <div className="participant-csv-instructions">
                <div>
                  <h3>Importe várias pessoas de uma vez</h3>
                  <p>
                    O CSV precisa das colunas <strong>nome</strong> e <strong>login</strong>.
                    Aceita separador vírgula ou ponto e vírgula.
                  </p>
                  <p className="field-hint">
                    Limite: {MAX_PARTICIPANT_CSV_ROWS} pessoas e 2 MiB. Senhas iniciais individuais
                    serão geradas e disponibilizadas em um arquivo para baixar após a importação.
                  </p>
                </div>
                <button className="button button-secondary" onClick={handleDownloadCsvTemplate} type="button">
                  Baixar modelo CSV
                </button>
              </div>
              <div className="field participant-csv-file">
                <label htmlFor="participant-csv">Arquivo CSV</label>
                <input
                  accept=".csv,text/csv"
                  id="participant-csv"
                  onChange={(event) => void handleCsvFileChange(event)}
                  type="file"
                />
                <span className="field-hint">Logins já cadastrados e repetidas no arquivo serão ignoradas.</span>
              </div>
              {csvFileName && <p className="participant-csv-file-name">{csvFileName}</p>}
              {isReadingCsv && <LoadingState className="loading-state-compact">Lendo e validando o arquivo...</LoadingState>}
              {csvParseResult?.fatalError && <p className="form-error" role="alert">{csvParseResult.fatalError}</p>}
              {csvParseResult && !csvParseResult.fatalError && (
                <div className="participant-csv-preview" aria-live="polite">
                  <p>
                    <strong>{csvParseResult.rows.length}</strong> prontos para criar
                    {csvParseResult.issues.length > 0 && (
                      <> · <strong>{csvParseResult.issues.length}</strong> registros precisam de correção</>
                    )}
                  </p>
                  {csvParseResult.issues.length > 0 && (
                    <ul className="participant-csv-issues">
                      {csvParseResult.issues.slice(0, 8).map((issue) => (
                        <li key={`${issue.recordNumber}-${issue.loginIdentifier}`}>
                          Registro {issue.recordNumber}{issue.loginIdentifier ? ` · ${issue.loginIdentifier}` : ''}: {issue.message}
                        </li>
                      ))}
                      {csvParseResult.issues.length > 8 && (
                        <li>e mais {csvParseResult.issues.length - 8} registros.</li>
                      )}
                    </ul>
                  )}
                  {csvImportResult && (
                    <div className="participant-csv-results">
                      <p className={csvImportResult.failed.length ? 'form-error' : 'success-message'} role="status">
                        {csvImportResult.created.length} criados · {csvImportResult.failed.length + csvParseResult.issues.length} não importados.
                      </p>
                      {csvImportResult.created.length > 0 && (
                        <div className="participant-csv-credentials">
                          <p>
                            Baixe agora as senhas iniciais. Elas não serão armazenadas neste portal e não poderão
                            ser recuperadas depois que você fechar esta janela.
                          </p>
                          <button
                            className="button button-primary"
                            onClick={handleDownloadCredentials}
                            type="button"
                          >
                            {credentialsDownloaded ? 'Baixar arquivo de acessos novamente' : 'Baixar arquivo de acessos'}
                          </button>
                          {credentialsDownloaded && <span className="success-message" role="status">Arquivo preparado para distribuição segura.</span>}
                        </div>
                      )}
                      {csvImportResult.failed.length > 0 && (
                        <ul className="participant-csv-issues" aria-label="Falhas de importação">
                          {csvImportResult.failed.slice(0, 8).map((failure) => (
                            <li key={`${failure.recordNumber}-${failure.loginIdentifier}`}>
                              Registro {failure.recordNumber} · {failure.loginIdentifier}: {failure.message}
                            </li>
                          ))}
                          {csvImportResult.failed.length > 8 && (
                            <li>e mais {csvImportResult.failed.length - 8} falhas.</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )}
                  {!csvImportResult && (
                    <button
                      className="button button-primary"
                      disabled={isImporting || isReadingCsv || csvParseResult.rows.length === 0}
                      onClick={() => void handleImportParticipants()}
                      type="button"
                    >
                      {isImporting ? 'Criando participantes...' : `Importar ${csvParseResult.rows.length} participantes`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </CourseDialog>
      )}

      {isDetailsOpen && selectedSummary && (
        <CourseDialog
          onClose={() => setIsDetailsOpen(false)}
          title={`Trilhas de ${selectedSummary.participant.displayName}`}
          wide
        >
          <div className="participant-detail-overview">
            <div>
              <span className="eyebrow">MATRÍCULA</span>
              <strong>{selectedSummary.participant.loginIdentifier}</strong>
            </div>
            {!readOnly && <div>
              {editingName === null
                ? <button className="button button-secondary" onClick={() => { setEditError(''); setEditingName(selectedSummary.participant.displayName); }} type="button">Editar dados</button>
                : <form className="participant-edit-form" onSubmit={(event) => void handleSaveName(event)}>
                    <label htmlFor="participant-edit-name">Nome do colaborador</label>
                    <input autoFocus id="participant-edit-name" maxLength={200} onChange={(event) => setEditingName(event.target.value)} value={editingName} />
                    {editError && <p role="alert">{editError}</p>}
                    <span>
                      <button className="button button-primary" disabled={isSavingName} type="submit">{isSavingName ? 'Salvando...' : 'Salvar'}</button>
                      <button className="button button-quiet" disabled={isSavingName} onClick={() => setEditingName(null)} type="button">Cancelar</button>
                    </span>
                  </form>}
            </div>}
            <div>
              <span className="eyebrow">TRILHAS CONCLUÍDAS</span>
              <strong>{selectedSummary.completedTrackCount} de {selectedSummary.assignedTrackCount}</strong>
            </div>
            <div>
              <span className="eyebrow">PROGRESSO POR AULAS</span>
              <strong>{selectedSummary.completedLessonCount} de {selectedSummary.lessonCount} · {selectedSummary.overallProgressPercentage}%</strong>
            </div>
            <span className={`status-pill participant-status-${selectedSummary.status}`}>
              {statusLabels[selectedSummary.status]}
            </span>
          </div>

          <section aria-labelledby="participant-assigned-tracks-title" className="participant-detail-section">
            <div className="participant-directory-heading">
              <div>
                <p className="eyebrow">ACOMPANHAMENTO INDIVIDUAL</p>
                <h3 id="participant-assigned-tracks-title">Trilhas liberadas</h3>
              </div>
              <span className="count-label">{assignedTracks.length} trilhas</span>
            </div>
            {assignedTracks.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>Nenhuma trilha atribuída ainda</h3>
                <p>{readOnly ? 'O administrador da empresa pode liberar trilhas para esta pessoa.' : 'Escolha uma trilha publicada abaixo para liberar o acesso.'}</p>
              </div>
            ) : (
              <ul className="participant-detail-track-list">
                {assignedTracks.map((track) => (
                  <li className="participant-detail-track" key={track.trackId}>
                    <div className="participant-detail-track-info">
                      <strong>{track.trackTitle}</strong>
                      <span>
                        {track.completedLessonCount} de {track.lessonCount} aulas concluídas
                      </span>
                    </div>
                    <div className="participant-detail-track-progress">
                      <progress
                        aria-label={`${track.trackTitle}: ${track.progressPercentage}% concluído`}
                        max={100}
                        value={track.progressPercentage}
                      />
                      <strong>{track.progressPercentage}%</strong>
                    </div>
                    <span className={`status-pill participant-status-${track.isCompleted ? 'completed' : track.progressPercentage > 0 ? 'in-progress' : 'not-started'}`}>
                      {track.isCompleted ? 'Concluída' : track.progressPercentage > 0 ? 'Em andamento' : 'Não iniciada'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="participant-videos-title" className="participant-detail-section">
            <div className="participant-directory-heading">
              <div>
                <p className="eyebrow">AUDITORIA</p>
                <h3 id="participant-videos-title">Vídeos assistidos</h3>
              </div>
              <button className="button button-secondary" disabled={!report} onClick={handleDownloadParticipantReport} type="button">
                Baixar relatório (CSV)
              </button>
            </div>
            {reportError && <p className="form-error" role="alert">{reportError}</p>}
            {!report && !reportError && <LoadingState className="list-state">Carregando vídeos assistidos...</LoadingState>}
            {report && report.tracks.length === 0 && <p className="muted-copy">Nenhuma trilha liberada para esta pessoa.</p>}
            {report?.tracks.map((experience) => (
              <div className="table-scroll" key={experience.track.id}>
                <table aria-label={`Vídeos de ${experience.track.title}`} className="data-table">
                  <caption>
                    {experience.track.title} · {experience.track.completedLessonCount} de {experience.track.lessonCount} vídeos concluídos
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Vídeo</th>
                      <th scope="col">Assistido</th>
                      <th scope="col">Tempo</th>
                      <th scope="col">Concluído em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experience.lessons.map((lesson) => (
                      <tr key={lesson.id}>
                        <td data-label="Vídeo">
                          {lesson.title}
                          {lesson.sectionTitle && <small className="participant-directory-secondary"> · {lesson.sectionTitle}</small>}
                        </td>
                        <td data-label="Assistido">{lesson.isCompleted ? 'Concluído' : `${lesson.watchedPercentage}%`}</td>
                        <td data-label="Tempo">{formatWatchTime(lesson.watchedMilliseconds)}</td>
                        <td data-label="Concluído em">{formatReportDate(lesson.completedAt) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          <div className="participant-detail-outcomes">
            <ParticipantOutcomesPanel participantId={selectedParticipantId} />
          </div>

          {!readOnly && selectedSummary.participant.isActive && availableTracks.length > 0 && (
            <form className="participant-detail-assignment" onSubmit={handleAssignTrack}>
              <div className="field">
                <label htmlFor="assignment-track">Liberar outra trilha</label>
                <select
                  id="assignment-track"
                  onChange={(event) => setSelectedTrackId(event.target.value)}
                  required
                  value={selectedTrackId}
                >
                  {availableTracks.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.title} · {track.lessonCount} {track.lessonCount === 1 ? 'aula' : 'aulas'}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="button button-primary"
                disabled={isAssigning || !selectedTrackId}
                type="submit"
              >
                {isAssigning ? 'Atribuindo...' : 'Atribuir trilha'}
              </button>
            </form>
          )}
          {selectedSummary.participant.isActive && availableTracks.length === 0 && publishedTracks.length > 0 && (
            <p className="assigned-tracks-empty" role="status">
              Todas as trilhas publicadas já foram atribuídas a esta pessoa.
            </p>
          )}
        </CourseDialog>
      )}
    </div>
  );
}

function ParticipantRow({
  summary,
  selected,
  onToggle,
  onOpen,
}: {
  summary: ParticipantProgressSummary;
  selected: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}) {
  return (
    <tr>
      {onToggle && <td data-label="Selecionar">
        <input
          aria-label={`Selecionar ${summary.participant.displayName}`}
          checked={selected}
          onChange={onToggle}
          type="checkbox"
        />
      </td>}
      <td data-label="Participante">
        <div className="participant-directory-person">
          <span aria-hidden="true" className="participant-directory-avatar">
            {getInitials(summary.participant.displayName)}
          </span>
          <span>
            <button className="participant-name-link" onClick={onOpen} type="button">{summary.participant.displayName}</button>
            <small>Usuário {summary.participant.loginIdentifier}</small>
          </span>
        </div>
      </td>
      <td data-label="Trilhas concluídas">
        <strong>{summary.completedTrackCount} de {summary.assignedTrackCount}</strong>
        <span className="participant-directory-secondary">
          {summary.assignedTrackCount === 0 ? 'Nenhuma liberada' : 'concluídas'}
        </span>
      </td>
      <td data-label="Aulas concluídas">
        {summary.lessonCount === 0 ? (
          <span className="participant-directory-secondary">Sem aulas atribuídas</span>
        ) : (
          <>
            <div className="participant-directory-progress">
              <progress
                aria-label={`${summary.participant.displayName}: ${summary.completedLessonCount} de ${summary.lessonCount} aulas concluídas (${summary.overallProgressPercentage}%)`}
                max={100}
                value={summary.overallProgressPercentage}
              />
              <strong>{summary.overallProgressPercentage}%</strong>
            </div>
            <span className="participant-directory-secondary">
              {summary.completedLessonCount} de {summary.lessonCount} aulas
            </span>
          </>
        )}
      </td>
      <td data-label="Situação">
        <span className={`status-pill participant-status-${summary.status}`}>
          {statusLabels[summary.status]}
        </span>
      </td>
      <td className="participant-directory-actions" data-label="Detalhes">
        <button className="button button-quiet" onClick={onOpen} type="button">
          Ver trilhas <span aria-hidden="true">→</span>
        </button>
      </td>
    </tr>
  );
}

function getInitials(displayName: string): string {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('pt-BR');
}

function downloadCsv(filename: string, content: string): void {
  const objectUrl = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function readCsvFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Não foi possível ler o arquivo CSV.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('O arquivo CSV não pôde ser convertido em texto.'));
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado. Tente novamente.';
}

function getParticipantProgressFilter(value: string | null): ParticipantProgressFilter {
  return filterOptions.find((option) => option.value === value)?.value ?? 'all';
}
