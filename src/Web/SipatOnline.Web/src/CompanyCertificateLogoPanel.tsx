import { useState } from 'react';
import { getCompanyCertificateLogo, saveCompanyCertificateLogo } from './api';
import CourseDialog from './CourseDialog';

export default function CompanyCertificateLogoPanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);

  async function load() {
    setOpen(true); setBusy(true); setError(''); setNotice(''); setFile(null);
    try { setConfigured((await getCompanyCertificateLogo(companyId)).configured); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar a logo.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await saveCompanyCertificateLogo(companyId, file);
      setConfigured(true); setVersion(value => value + 1); setFile(null);
      setNotice('Logo salva. Os próximos certificados usarão a identidade desta empresa. Documentos já emitidos não mudam.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a logo.'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button button-secondary" onClick={() => void load()} type="button">Logo do certificado</button>
    {open && <CourseDialog busy={busy} onClose={() => setOpen(false)} title="Logo da empresa no certificado">
      <p>Envie a logo oficial da empresa contratante. Ela será incorporada ao PDF, sem depender de links externos.</p>
      {configured && <figure className="certificate-company-logo"><img
        alt="Logo da empresa cadastrada para os certificados"
        src={`/api/platform/companies/${companyId}/learning/certificate-logo/image?v=${version}`}
        onError={() => setError('Não foi possível exibir a logo cadastrada. Tente recarregar ou enviar o arquivo novamente.')} /></figure>}
      {busy && <LoadingState className="loading-state-compact">Processando logo...</LoadingState>}
      {error && <div className="form-error" role="alert"><p>{error}</p>
        <button className="button button-quiet" onClick={() => void load()} disabled={busy} type="button">Recarregar logo</button></div>}
      {notice && <p role="status">{notice}</p>}
      <form className="event-form event-form-single" onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="field"><label htmlFor="certificate-company-logo">Arquivo da logo (PNG)</label>
          <input accept=".png,image/png" disabled={busy} id="certificate-company-logo" key={version}
            onChange={event => {
              const selected = event.target.files?.[0] ?? null;
              setNotice(''); setError(''); setFile(null);
              if (!selected) return;
              if (selected.type !== 'image/png' || selected.size < 1 || selected.size > 256 * 1024) {
                setError('Selecione uma imagem PNG de até 256 KB.'); return;
              }
              setFile(selected);
            }} type="file" aria-describedby="certificate-logo-hint" />
          <p className="field-hint" id="certificate-logo-hint">Até 256 KB e 2000 × 2000 pixels. Prefira fundo transparente e espaço livre ao redor da marca.</p>
        </div>
        <button className="button button-primary" disabled={busy || !file} type="submit">Salvar logo do certificado</button>
      </form>
    </CourseDialog>}
  </>;
}
import LoadingState from './LoadingState';
