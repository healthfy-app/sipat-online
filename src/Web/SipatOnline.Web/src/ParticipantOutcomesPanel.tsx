import { useState } from 'react';
import { getCompanyAdministrationId, getParticipantOutcomes, type ParticipantOutcomes } from './api';
import CourseDialog from './CourseDialog';

export default function ParticipantOutcomesPanel({ participantId, companyId }: { participantId: string; companyId?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ParticipantOutcomes | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const certificateCompanyId = companyId ?? getCompanyAdministrationId();
  async function load() {
    setOpen(true); setBusy(true); setError(''); setData(null);
    try { setData(await getParticipantOutcomes(participantId, companyId)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os resultados.'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button button-quiet" disabled={!participantId} onClick={() => void load()} type="button">Atividades e certificados</button>
    {open && <CourseDialog busy={busy} onClose={() => setOpen(false)} title="Atividades e certificados">
      {busy && <LoadingState className="loading-state-compact">Carregando resultados...</LoadingState>}
      {error && <div role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => void load()} type="button">Tentar novamente</button></div>}
      {data && <>
        <p>{data.completedActivities} atividades concluídas · {data.skippedActivities} puladas</p>
        <p className="muted-copy">Jogos são opcionais e não alteram a elegibilidade do certificado.</p>
        <h3>Certificados emitidos</h3>
        {!data.certificates.length && <p>Nenhum certificado emitido. A conclusão dos cursos continua no acompanhamento de trilhas.</p>}
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
