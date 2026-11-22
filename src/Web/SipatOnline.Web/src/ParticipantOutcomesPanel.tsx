import { useState } from 'react';
import { getCompanyAdministrationId, getParticipantOutcomes, type ParticipantOutcomes } from './api';
import CourseDialog from './CourseDialog';

/** `quiet` draws the trigger as a light link ("Histórico →") for lists where every row has one. */
export default function ParticipantOutcomesPanel({ participantId, participantName, companyId, quiet = false }: { participantId: string; participantName?: string; companyId?: string; quiet?: boolean }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ParticipantOutcomes | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const certificateCompanyId = companyId ?? getCompanyAdministrationId();
  async function load() {
    setOpen(true);
    setBusy(true);
    setError('');
    setData(null);
    try { setData(await getParticipantOutcomes(participantId, companyId)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os resultados.'); }
    finally { setBusy(false); }
  }
  return <>
    {quiet
      ? <button className="participant-outcomes-trigger inline-flex min-h-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-2.5 py-1.5 text-sm font-semibold text-primary hover:bg-accent"
        disabled={!participantId} onClick={(event) => { event.stopPropagation(); void load(); }} type="button">
        Histórico <span aria-hidden="true">→</span>
      </button>
      : <button className="button button-quiet participant-outcomes-trigger" disabled={!participantId}
        onClick={() => void load()} type="button">Ver histórico</button>}
    {open && <CourseDialog busy={busy} onClose={() => setOpen(false)} title={participantName ? `Histórico de ${participantName}` : 'Atividades e certificados'}>
      {busy && <LoadingState className="loading-state-compact">Carregando resultados...</LoadingState>}
      {error && <div role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => void load()} type="button">Tentar novamente</button></div>}
      {data && <>
        <p>{data.completedActivities} {data.completedActivities === 1 ? 'atividade concluída' : 'atividades concluídas'} · {data.skippedActivities} {data.skippedActivities === 1 ? 'pulada' : 'puladas'}</p>
        <p className="muted-copy">Jogos são opcionais e não alteram a elegibilidade do certificado.</p>
        <h3>Certificados emitidos</h3>
        {!data.certificates.length && <p>Nenhum certificado emitido. A conclusão dos dias continua no acompanhamento dos colaboradores.</p>}
        {data.certificates.map(certificate => <article className="form-card" key={certificate.id}>
          <strong>{certificate.eventTitle}</strong>
          <p>Emitido em {new Date(certificate.issuedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}{certificate.isDemonstration ? ' · Demonstrativo' : ''}</p>
          <a className="button button-secondary" href={certificateCompanyId
            ? `/api/platform/companies/${certificateCompanyId}/learning/certificates/${certificate.id}/pdf`
            : `/api/learning/certificates/${certificate.id}/pdf`}>Baixar certificado PDF</a>
        </article>)}
      </>}
    </CourseDialog>}
  </>;
}
import LoadingState from './LoadingState';
