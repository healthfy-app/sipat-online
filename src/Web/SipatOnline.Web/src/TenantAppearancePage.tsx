import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { saveTenantAppearance, type TenantBranding } from './api';
import { isBrandColor, tenantTheme } from './branding';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Page, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';

const maxLogoBytes = 256 * 1024;
const maxBannerBytes = 1_500_000;
const bannerTypes = ['image/png', 'image/jpeg', 'image/webp'];

function readAsBase64(file: File, failure: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(failure));
    reader.onload = () => (typeof reader.result === 'string'
      ? resolve(reader.result.slice(reader.result.indexOf(',') + 1))
      : reject(new Error(failure)));
    reader.readAsDataURL(file);
  });
}

export default function TenantAppearancePage({ tenant, onSaved }: {
  tenant: TenantBranding;
  onSaved: (tenant: TenantBranding) => void;
}) {
  const [primary, setPrimary] = useState(tenant.primaryColor);
  const [secondary, setSecondary] = useState(tenant.secondaryColor);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoType, setLogoType] = useState('image/png');
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoName, setLogoName] = useState('');
  const [bannerBase64, setBannerBase64] = useState<string | null>(null);
  const [bannerType, setBannerType] = useState('image/png');
  const [removeBanner, setRemoveBanner] = useState(false);
  const [bannerName, setBannerName] = useState('');
  const [fileVersion, setFileVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const colorsValid = isBrandColor(primary) && isBrandColor(secondary);
  const hasBanner = Boolean(tenant.bannerReference);
  const changed = primary.toUpperCase() !== tenant.primaryColor.toUpperCase()
    || secondary.toUpperCase() !== tenant.secondaryColor.toUpperCase()
    || logoBase64 !== null || (removeLogo && tenant.logoReference !== null)
    || bannerBase64 !== null || (removeBanner && hasBanner);
  const previewLogo = removeLogo ? null : logoBase64 ? `data:${logoType};base64,${logoBase64}` : tenant.logoReference;
  const previewBanner = removeBanner ? null : bannerBase64 ? `data:${bannerType};base64,${bannerBase64}` : tenant.bannerReference ?? null;
  const bannerBright = useBannerBrightness(previewBanner);

  function reset() {
    setPrimary(tenant.primaryColor); setSecondary(tenant.secondaryColor);
    setLogoBase64(null); setRemoveLogo(false); setLogoName('');
    setBannerBase64(null); setRemoveBanner(false); setBannerName('');
    setFileVersion((value) => value + 1); setError(''); setNotice('');
  }

  async function readLogo(file?: File) {
    setError(''); setNotice('');
    if (!file) return;
    if (file.type !== 'image/png' || file.size < 1 || file.size > maxLogoBytes) {
      setError('Selecione uma logo PNG de até 256 KB. O arquivo anterior foi mantido.');
      return;
    }
    setReading(true);
    try {
      setLogoBase64(await readAsBase64(file, 'Não foi possível ler a logo. Selecione o arquivo novamente.'));
      setLogoType(file.type); setRemoveLogo(false); setLogoName(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível ler a logo.');
    } finally { setReading(false); }
  }

  async function readBanner(file?: File) {
    setError(''); setNotice('');
    if (!file) return;
    if (!bannerTypes.includes(file.type) || file.size < 1 || file.size > maxBannerBytes) {
      setError('Selecione um banner PNG, JPEG ou WebP de até 1,5 MB. O arquivo anterior foi mantido.');
      return;
    }
    setReading(true);
    try {
      setBannerBase64(await readAsBase64(file, 'Não foi possível ler o banner. Selecione o arquivo novamente.'));
      setBannerType(file.type); setRemoveBanner(false); setBannerName(file.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível ler o banner.');
    } finally { setReading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!colorsValid) {
      setError('Use cores no formato #RRGGBB.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveTenantAppearance({
        primaryColor: primary.toUpperCase(), secondaryColor: secondary.toUpperCase(),
        logoBase64, removeLogo, bannerBase64, removeBanner,
      });
      onSaved(saved); setPrimary(saved.primaryColor); setSecondary(saved.secondaryColor);
      setLogoBase64(null); setRemoveLogo(false); setLogoName('');
      setBannerBase64(null); setRemoveBanner(false); setBannerName('');
      setFileVersion((value) => value + 1);
      setNotice('Identidade visual salva. O login e o portal da empresa já usam a nova aparência.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Suas alterações continuam na prévia.');
    } finally { setBusy(false); }
  }

  const theme = tenantTheme(colorsValid ? primary : tenant.primaryColor, colorsValid ? secondary : tenant.secondaryColor);
  const working = busy || reading;

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          description={`Personalize a experiência de aprendizagem de ${tenant.tenantName}.`}
          eyebrow="PORTAL DA EMPRESA"
          title="Identidade visual"
        />

        <form className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" onSubmit={(event) => void save(event)}>
          <div className="grid min-w-0 gap-4">
            <Card aria-labelledby="appearance-logo-title" role="region">
              <CardHeader>
                <CardTitle id="appearance-logo-title">Logo da empresa</CardTitle>
                <CardDescription>Aparece na entrada e na navegação. Os certificados já emitidos não são alterados.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg border border-border bg-[conic-gradient(#f1f4f2_25%,#fff_0_50%,#f1f4f2_0_75%,#fff_0)] bg-[length:14px_14px]">
                    <img alt="Prévia da logo da empresa" className="max-h-[70%] max-w-[70%] object-contain" src={previewLogo ?? '/favicon.svg'} />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-card/90 px-1.5 text-[0.625rem] font-bold tracking-wider text-muted-foreground">PRÉVIA</span>
                  </div>
                  <div className="grid content-start gap-2">
                    <Dropzone
                      accept=".png,image/png"
                      ariaLabel="Selecionar logo PNG"
                      disabled={working}
                      fileName={logoName}
                      hint="Solte aqui ou procure no dispositivo · PNG até 256 KB"
                      id="appearance-logo"
                      onFile={(file) => void readLogo(file)}
                      resetKey={fileVersion}
                      title="Escolher arquivo PNG"
                    />
                    {(previewLogo || logoBase64) && (
                      <Button className="justify-self-start" disabled={working} size="sm" variant="ghost"
                        onClick={() => { setRemoveLogo(true); setLogoBase64(null); setLogoName(''); setFileVersion((value) => value + 1); setNotice(''); }}>
                        <Trash2 /> Remover logo
                      </Button>
                    )}
                  </div>
                </div>
                <p className="m-0 text-xs text-muted-foreground" id="appearance-logo-help">PNG de até 2000 × 2000 px. Para melhores resultados, use fundo transparente.</p>
              </CardContent>
            </Card>

            <Card aria-labelledby="appearance-banner-title" role="region">
              <CardHeader>
                <CardTitle id="appearance-banner-title">Banner da entrada</CardTitle>
                <CardDescription>Imagem de fundo da tela de login da empresa. Sem banner, a entrada usa o fundo padrão.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative grid aspect-[16/7] place-items-center overflow-hidden rounded-lg border border-border bg-muted">
                  {previewBanner
                    ? <img alt="Prévia do banner da entrada" className="absolute inset-0 size-full object-cover" src={previewBanner} />
                    : <span className="px-4 text-center text-sm text-muted-foreground">Nenhum banner. A entrada usa o fundo padrão.</span>}
                </div>
                <Dropzone
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  ariaLabel="Selecionar banner da entrada"
                  disabled={working}
                  fileName={bannerName}
                  hint="PNG, JPEG ou WebP até 1,5 MB · recomendado 1600 × 900 px"
                  id="appearance-banner"
                  onFile={(file) => void readBanner(file)}
                  resetKey={fileVersion}
                  title="Escolher imagem do banner"
                />
                {bannerBright !== null && bannerBright > 0.7 && (
                  <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
                    Esta imagem é muito clara. O painel de entrada escurece o fundo, mas o texto pode ficar menos legível. Confira a prévia ao lado.
                  </p>
                )}
                {previewBanner && (
                  <Button className="justify-self-start" disabled={working} size="sm" variant="ghost"
                    onClick={() => { setRemoveBanner(true); setBannerBase64(null); setBannerName(''); setFileVersion((value) => value + 1); setNotice(''); }}>
                    <Trash2 /> Remover banner
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card aria-labelledby="appearance-colors-title" role="region">
              <CardHeader>
                <CardTitle id="appearance-colors-title">Cores do portal</CardTitle>
                <CardDescription>Defina a cor de destaque e a cor do texto dos botões. A prévia acompanha suas alterações.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField disabled={busy} fallback={tenant.primaryColor} id="primary" label="Cor principal" onChange={setPrimary} value={primary} />
                  <ColorField disabled={busy} fallback={tenant.secondaryColor} id="secondary" label="Texto dos botões" onChange={setSecondary} value={secondary} />
                </div>
                {!colorsValid && <p className="m-0 text-sm font-medium text-destructive" role="status">Use cores no formato #RRGGBB.</p>}
              </CardContent>
            </Card>

            <div className="grid gap-3">
              {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
              {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
              <p className={cn('m-0 inline-flex items-center gap-2 text-sm text-muted-foreground', changed && 'text-warning')} role="status">
                <span aria-hidden="true">{changed ? '●' : '✓'}</span>
                {changed ? 'Alterações não publicadas' : 'Identidade visual publicada'}
              </p>
              {changed && (
                <div className="flex flex-wrap gap-2">
                  <Button aria-busy={working} disabled={working || !colorsValid} type="submit">
                    {busy ? 'Salvando...' : reading ? 'Lendo arquivo...' : 'Salvar identidade visual'}
                  </Button>
                  <Button disabled={working} onClick={reset} variant="outline">Descartar alterações</Button>
                </div>
              )}
            </div>
          </div>

          <aside aria-label="Prévia da identidade visual" className="grid min-w-0 gap-4 xl:sticky xl:top-24">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="m-0 text-base font-semibold">Prévia ao vivo</h2>
                <p className="m-0 text-sm text-muted-foreground">Veja como a identidade aparece para os participantes.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-primary">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />AO VIVO
              </span>
            </div>

            <div className="appearance-preview grid min-w-0 gap-3" style={theme}>
              <PreviewFrame label="Entrada (login)">
                <div className="grid min-h-44 grid-cols-[1.1fr_1fr]">
                  <div
                    className="relative isolate flex flex-col justify-between gap-4 overflow-hidden p-4 text-white"
                    style={{
                      background: previewBanner
                        ? '#0b241f'
                        : 'linear-gradient(145deg, color-mix(in srgb, var(--brand-primary) 22%, #0b241f), #0b241f)',
                    }}
                  >
                    {previewBanner && <span aria-hidden="true" className="absolute -inset-3 -z-10" data-testid="login-preview-banner"
                      style={{ background: `linear-gradient(180deg, rgb(8 26 21 / 55%), rgb(8 26 21 / 82%)), url(${previewBanner}) center / cover no-repeat`, filter: 'blur(6px) saturate(1.05)' }} />}
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <img alt="" className="size-6 object-contain" src={previewLogo ?? '/favicon.svg'} />
                      {tenant.tenantName}
                    </span>
                    <span className="text-base font-bold leading-tight">Aprender também faz parte de cuidar.</span>
                  </div>
                  <div className="grid content-center gap-2 bg-card p-4">
                    <span className="text-[0.625rem] font-bold tracking-wider text-primary">ACESSO SEGURO</span>
                    <span className="h-6 rounded border border-border" />
                    <span className="h-6 rounded border border-border" />
                    <span className="grid h-7 place-items-center rounded text-[0.6875rem] font-semibold"
                      style={{ background: 'var(--brand-primary)', color: 'var(--brand-secondary)' }}>Entrar no portal</span>
                  </div>
                </div>
              </PreviewFrame>

              <PreviewFrame label="Portal do participante">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <img alt="" className="size-6 object-contain" src={previewLogo ?? '/favicon.svg'} />
                  <strong className="text-sm">{tenant.tenantName}</strong>
                </div>
                <div className="grid gap-2 p-4">
                  <span className="text-xs font-semibold text-primary">Minha formação</span>
                  <h3 className="m-0 text-xl font-semibold leading-tight">Aprender também faz parte de cuidar.</h3>
                  <p className="m-0 text-sm text-muted-foreground">Os cursos e conteúdos da sua empresa, em um só lugar.</p>
                  <span className="mt-1 inline-flex w-fit items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold"
                    style={{ background: 'var(--brand-primary)', color: 'var(--brand-secondary)' }}>
                    Continuar curso <span aria-hidden="true">→</span>
                  </span>
                </div>
              </PreviewFrame>
            </div>
            <p className="m-0 text-xs text-muted-foreground">Nome, dados e certificados não mudam. A logo dos certificados é configurada separadamente pela plataforma.</p>
          </aside>
        </form>
      </Page>
    </div>
  );
}

function PreviewFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="m-0 grid gap-1.5">
      <figcaption className="text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground">{label}</figcaption>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">{children}</div>
    </figure>
  );
}

function Dropzone({ id, ariaLabel, accept, title, hint, fileName, disabled, resetKey, onFile }: {
  id: string; ariaLabel: string; accept: string; title: string; hint: string;
  fileName: string; disabled: boolean; resetKey: number; onFile: (file?: File) => void;
}) {
  return (
    <div className="grid gap-2">
      <label
        className={cn(
          'relative m-0 grid cursor-pointer justify-items-start gap-0.5 rounded-lg border border-dashed border-input px-4 py-3.5 text-sm transition-colors',
          'hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
          disabled && 'pointer-events-none opacity-60',
        )}
        htmlFor={id}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); onFile(event.dataTransfer.files[0]); }}
      >
        <span aria-hidden="true" className="mb-1 text-primary"><ImagePlus className="size-5" /></span>
        <strong className="font-semibold">{title}</strong>
        <span className="text-[0.8125rem] text-muted-foreground">{hint}</span>
        <input
          accept={accept}
          aria-label={ariaLabel}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          disabled={disabled}
          id={id}
          key={resetKey}
          onChange={(event) => onFile(event.target.files?.[0])}
          type="file"
        />
      </label>
      {fileName && <p className="m-0 text-sm text-primary" role="status">{fileName} · pronto para salvar</p>}
    </div>
  );
}

function ColorField({ label, value, fallback, onChange, disabled, id }: {
  label: string; value: string; fallback: string; onChange: (value: string) => void; disabled: boolean; id: string;
}) {
  return (
    <Field htmlFor={`appearance-${id}`} label={label}>
      <div className="flex items-center gap-2">
        <input
          aria-label={`Selecionar ${label.toLowerCase()}`}
          className="m-0 size-9 min-h-9 shrink-0 cursor-pointer rounded-md border border-border bg-card p-0.5"
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          type="color"
          value={isBrandColor(value) ? value : fallback}
        />
        <Input
          aria-invalid={!isBrandColor(value)}
          aria-label={`${label} (HEX)`}
          className="font-mono"
          disabled={disabled}
          id={`appearance-${id}`}
          maxLength={7}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          spellCheck={false}
          value={value}
        />
      </div>
    </Field>
  );
}

/** Average brightness of the banner, 0 (black) to 1 (white); null while unknown or when the image cannot be read. */
function useBannerBrightness(source: string | null): number | null {
  const [brightness, setBrightness] = useState<number | null>(null);
  useEffect(() => {
    setBrightness(null);
    if (!source) return;
    let current = true;
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24; canvas.height = 24;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, 24, 24);
        const { data } = context.getImageData(0, 0, 24, 24);
        let total = 0;
        for (let index = 0; index < data.length; index += 4) total += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
        if (current) setBrightness(total / (data.length / 4));
      } catch { /* a banner from another origin cannot be measured: no warning */ }
    };
    image.src = source;
    return () => { current = false; };
  }, [source]);
  return brightness;
}
