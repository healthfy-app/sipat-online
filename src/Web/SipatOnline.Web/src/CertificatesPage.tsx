import { useEffect, useState } from 'react';
import { issueCertificate, listCertificates, type CertificateEligibility } from './api';
import AchievementMark from './AchievementMark';
import LoadingState from './LoadingState';

export default function CertificatesPage() {
  const [items, setItems] = useState<CertificateEligibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [retry, setRetry] = useState(0);
  const [issuedCertificateId, setIssuedCertificateId] = useState('');
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    listCertificates().then(result => { if (current) setItems(result); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os certificados.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [retry]);
  async function issue(item: CertificateEligibility) {
    setBusy(item.sipatEventId); setError('');
    try {
      const certificate = await issueCertificate(item.sipatEventId);
      setItems(current => current.map(value => value.sipatEventId === item.sipatEventId ? { ...value, certificate } : value));
      setIssuedCertificateId(certificate.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível emitir o certificado.');
    } finally { setBusy(''); }
  }
  return <section className="page-content">
    <header className="page-heading"><div><p className="eyebrow">SUA PARTICIPAÇÃO</p><h1>Meus certificados</h1>
      <p className="muted-copy">Conclua todos os cursos atribuídos a uma SIPAT para emitir seu certificado. Jogos são opcionais.</p>
    </div></header>
    {loading && <LoadingState>Carregando certificados...</LoadingState>}
    {error && <div className="form-error" role="alert"><p>{error}</p>
      <button className="button button-secondary" onClick={() => setRetry(value => value + 1)} type="button">Tentar novamente</button></div>}
    {!loading && !error && !items.length && <div className="empty-state"><p>Você ainda não tem uma SIPAT atribuída para certificação.</p></div>}
    <div className="learning-catalog-grid">{items.map(item => <article className="form-card" key={item.sipatEventId}>
      <h2>{item.eventTitle}</h2><p>{item.completedCourses} de {item.totalCourses} cursos concluídos</p>
      {item.certificate ? <div className="certificate-availability">
        <AchievementMark animate={issuedCertificateId === item.certificate.id} />
        <p role="status">Certificado disponível</p>
        <p>{item.certificate.participantName} · {item.certificate.companyName}</p>
        <p>Emitido em {new Date(item.certificate.issuedAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
        {item.certificate.isDemonstration && <p className="learning-demo-notice">Documento demonstrativo, sem comprovação de participação oficial.</p>}
        <a className="button button-primary" href={`/api/learning/certificates/${item.certificate.id}/pdf`}>Baixar certificado PDF</a>
        <small>Identificador: {item.certificate.id}</small>
      </div> : <>
        <p className="muted-copy">{item.isEligible ? 'Tudo pronto para emitir seu certificado com a logo da sua empresa.'
          : item.completedCourses === item.totalCourses && !item.hasCompanyLogo
            ? 'Seus cursos estão concluídos. A empresa precisa cadastrar a logo para liberar a emissão.'
            : 'Conclua os cursos pendentes. Cada vídeo exige pelo menos 90% de cobertura reproduzida.'}</p>
        <button className="button button-primary" aria-busy={busy === item.sipatEventId} disabled={!item.isEligible || !!busy} onClick={() => void issue(item)} type="button">
          {busy === item.sipatEventId ? 'Emitindo...' : 'Emitir certificado'}
        </button>
      </>}
    </article>)}</div>
  </section>;
}
