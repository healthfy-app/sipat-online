import { useState, type FormEvent } from 'react';
import { saveTenantAppearance, type TenantBranding } from './api';
import { colorContrast, isBrandColor, tenantTheme } from './branding';
import './TenantAppearancePage.css';

export default function TenantAppearancePage({ tenant, onSaved }: {
  tenant: TenantBranding;
  onSaved: (tenant: TenantBranding) => void;
}) {
  const [primary, setPrimary] = useState(tenant.primaryColor);
  const [secondary, setSecondary] = useState(tenant.secondaryColor);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileVersion, setFileVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const colorsValid = isBrandColor(primary) && isBrandColor(secondary);
  const contrast = colorsValid ? colorContrast(primary, secondary) : 0;
  const changed = primary.toUpperCase() !== tenant.primaryColor.toUpperCase()
    || secondary.toUpperCase() !== tenant.secondaryColor.toUpperCase()
    || logoBase64 !== null || (removeLogo && tenant.logoReference !== null);
  const previewLogo = removeLogo ? null : logoBase64 ? `data:image/png;base64,${logoBase64}` : tenant.logoReference;

  function reset() {
    setPrimary(tenant.primaryColor); setSecondary(tenant.secondaryColor);
    setLogoBase64(null); setRemoveLogo(false); setFileName('');
    setFileVersion(value => value + 1); setError(''); setNotice('');
  }

  async function readLogo(file?: File) {
    setError(''); setNotice('');
    if (!file) return;
    if (file.type !== 'image/png' || file.size < 1 || file.size > 256 * 1024) {
      setError('Selecione uma logo PNG de até 256 KB. O arquivo anterior foi mantido.');
      return;
    }
    setReading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Não foi possível ler a logo. Selecione o arquivo novamente.'));
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result) : reject(new Error('O arquivo da logo não pôde ser lido.'));
        reader.readAsDataURL(file);
      });
      setLogoBase64(data.slice(data.indexOf(',') + 1));
      setRemoveLogo(false); setFileName(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível ler a logo.');
    } finally { setReading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!colorsValid || contrast < 4.5) {
      setError('Ajuste as cores para garantir um contraste mínimo de 4,5:1.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveTenantAppearance({
        primaryColor: primary.toUpperCase(), secondaryColor: secondary.toUpperCase(),
        logoBase64, removeLogo,
      });
      onSaved(saved); setPrimary(saved.primaryColor); setSecondary(saved.secondaryColor);
      setLogoBase64(null); setRemoveLogo(false); setFileName('');
      setFileVersion(value => value + 1);
      setNotice('Identidade visual salva. O login e o portal da empresa já usam a nova aparência.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Suas alterações continuam na prévia.');
    } finally { setBusy(false); }
  }

  return <div className="page-content tenant-appearance-page">
    <div className="page-heading">
      <div>
        <h1>Identidade visual</h1>
        <p className="muted-copy">Personalize o portal de {tenant.tenantName}. Confira a prévia antes de publicar para a sua empresa.</p>
      </div>
    </div>
    <form className="appearance-layout" onSubmit={event => void save(event)}>
      <div className="appearance-settings">
        <section className="appearance-section" aria-labelledby="appearance-logo-title">
          <h2 id="appearance-logo-title">Logo da empresa</h2>
          <p>Ela aparece na página de entrada e na navegação do portal, sem mudar os certificados já emitidos.</p>
          <div className="appearance-logo-sample">
            <img src={previewLogo ?? '/favicon.svg'} alt="Prévia da logo da empresa" />
          </div>
          <label
            className="appearance-upload-dropzone"
            htmlFor="appearance-logo"
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault();
              void readLogo(event.dataTransfer.files[0]);
            }}
          >
            <strong>Selecionar logo PNG</strong>
            <span>Arraste o arquivo até aqui ou clique para procurar · até 256 KB</span>
            <input
              aria-label="Selecionar logo PNG"
              aria-describedby="appearance-logo-help"
              accept=".png,image/png"
              className="appearance-file-input"
              disabled={busy || reading}
              id="appearance-logo"
              key={fileVersion}
              onChange={event => void readLogo(event.target.files?.[0])}
              type="file"
            />
          </label>
          <p className="field-hint" id="appearance-logo-help">Até 2000 × 2000 pixels. Prefira um PNG com fundo transparente.</p>
          {fileName && <p className="muted-copy">{fileName} · pronto para salvar</p>}
          {(previewLogo || logoBase64) && <button className="button button-quiet" type="button" disabled={busy || reading}
            onClick={() => { setRemoveLogo(true); setLogoBase64(null); setFileName(''); setFileVersion(value => value + 1); setNotice(''); }}>
            Remover logo
          </button>}
        </section>
        <section className="appearance-section" aria-labelledby="appearance-colors-title">
          <h2 id="appearance-colors-title">Cores do portal</h2>
          <p>A cor principal identifica a empresa nos botões e destaques. A segunda cor mantém o texto legível sobre ela.</p>
          <ColorField label="Cor principal" value={primary} fallback={tenant.primaryColor} onChange={setPrimary} disabled={busy} id="primary" />
          <ColorField label="Cor do texto dos botões" value={secondary} fallback={tenant.secondaryColor} onChange={setSecondary} disabled={busy} id="secondary" />
          <p className={`appearance-contrast${colorsValid && contrast >= 4.5 ? '' : ' appearance-contrast-warning'}`} role="status">
            {colorsValid
              ? `${contrast >= 4.5 ? '✓' : '!'} Contraste ${contrast.toFixed(2).replace('.', ',')}:1 · ${contrast >= 4.5 ? 'Texto legível' : 'Ajuste as cores para atingir 4,5:1'}`
              : 'Use cores no formato #RRGGBB.'}
          </p>
        </section>
        <div className="appearance-save">
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="success-message" role="status">{notice}</p>}
          <p className="field-hint">{changed ? 'Alterações ainda não salvas. A prévia é visível somente para você.' : 'A aparência publicada está atualizada.'}</p>
          <div className="form-actions">
            <button className="button button-primary" type="submit"
              aria-busy={busy || reading}
              disabled={busy || reading || !changed || !colorsValid || contrast < 4.5}>
              {busy ? 'Salvando...' : reading ? 'Lendo logo...' : 'Salvar identidade visual'}
            </button>
            <button className="button button-secondary" type="button" disabled={busy || reading || !changed} onClick={reset}>Descartar alterações</button>
          </div>
        </div>
      </div>
      <aside className="appearance-preview-column" aria-label="Prévia da identidade visual">
        <h2>Assim ficará o portal</h2>
        <p className="muted-copy">Uma prévia, não uma publicação automática.</p>
        <div className="appearance-preview" style={tenantTheme(colorsValid ? primary : tenant.primaryColor, colorsValid ? secondary : tenant.secondaryColor)}>
          <div className="appearance-preview-header">
            <img src={previewLogo ?? '/favicon.svg'} alt="" />
            <strong>{tenant.tenantName}</strong>
          </div>
          <div className="appearance-preview-content">
            <span className="appearance-preview-section">Minha formação</span>
            <h3>Aprender também faz parte de cuidar.</h3>
            <p>Os cursos e conteúdos da sua empresa, em um só lugar.</p>
            <span className="appearance-preview-button">Continuar curso</span>
          </div>
        </div>
        <p className="field-hint">O nome e os dados da empresa permanecem os mesmos. A logo do certificado é configurada separadamente pelo dono da plataforma.</p>
      </aside>
    </form>
  </div>;
}

function ColorField({ label, value, fallback, onChange, disabled, id }: {
  label: string; value: string; fallback: string; onChange: (value: string) => void; disabled: boolean; id: string;
}) {
  return <div className="field appearance-color-field">
    <label htmlFor={`appearance-${id}`}>{label}</label>
    <div className="appearance-color-controls">
      <input type="color" aria-label={`Selecionar ${label.toLowerCase()}`} disabled={disabled}
        value={isBrandColor(value) ? value : fallback} onChange={event => onChange(event.target.value)} />
      <input id={`appearance-${id}`} type="text" aria-label={`${label} (HEX)`} disabled={disabled} spellCheck={false}
        value={value} maxLength={7} pattern="#[0-9a-fA-F]{6}" aria-invalid={!isBrandColor(value)}
        onChange={event => onChange(event.target.value)} />
    </div>
  </div>;
}
