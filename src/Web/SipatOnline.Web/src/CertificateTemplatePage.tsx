import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { getCertificateTemplate, saveCertificateTemplate, type CertificateTemplate, type TenantBranding } from './api';
import LoadingState from './LoadingState';
import { Dropzone, readAsBase64 } from './TenantAppearancePage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { cn } from '@/lib/utils';

type Slot = 'cover' | 'emblem' | 'footer';
/** What the person chose for one picture and has not saved yet. */
interface Draft { base64: string | null; type: string; remove: boolean; name: string }

const untouched: Draft = { base64: null, type: 'image/png', remove: false, name: '' };
const slots: { slot: Slot; title: string; description: string; pick: string; hint: string; maxBytes: number; limit: string; frame: string }[] = [
  {
    slot: 'cover', title: 'Imagem de capa', pick: 'Escolher capa',
    description: 'Faixa no topo do certificado, no lugar das logos. Ocupa toda a largura; o que passar da altura é cortado.',
    hint: 'PNG ou JPEG até 1 MB · recomendado 1600 × 220 px', maxBytes: 1_000_000, limit: '1 MB', frame: 'aspect-[774/106] sm:col-span-2',
  },
  {
    slot: 'emblem', title: 'Emblema do certificado', pick: 'Escolher emblema',
    description: 'Selo redondo no centro, sobre a borda da capa. Sem capa, fica no topo, entre as logos.',
    hint: 'PNG ou JPEG até 256 KB · quadrado, recomendado 360 × 360 px', maxBytes: 256 * 1024, limit: '256 KB', frame: 'aspect-square',
  },
  {
    slot: 'footer', title: 'Imagem de rodapé', pick: 'Escolher imagem',
    description: 'Fica no centro do rodapé: a logo da empresa, um selo ou uma assinatura.',
    hint: 'PNG ou JPEG até 256 KB · recomendado 400 × 84 px, fundo transparente', maxBytes: 256 * 1024, limit: '256 KB', frame: 'aspect-[200/42]',
  },
];

export default function CertificateTemplatePage({ tenant }: { tenant: TenantBranding }) {
  const [saved, setSaved] = useState<CertificateTemplate | null>(null);
  const [drafts, setDrafts] = useState<Record<Slot, Draft>>({ cover: untouched, emblem: untouched, footer: untouched });
  const [fileVersion, setFileVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    getCertificateTemplate()
      .then((template) => { if (current) setSaved(template); })
      .catch((failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar o certificado.'); });
    return () => { current = false; };
  }, []);

  const reference = (slot: Slot) => saved?.[`${slot}Reference`] ?? null;
  const preview = (slot: Slot) => {
    const draft = drafts[slot];
    return draft.remove ? null : draft.base64 ? `data:${draft.type};base64,${draft.base64}` : reference(slot);
  };
  const changed = slots.some(({ slot }) => drafts[slot].base64 !== null || (drafts[slot].remove && reference(slot) !== null));
  const working = busy || reading;

  function setDraft(slot: Slot, draft: Draft) {
    setDrafts((current) => ({ ...current, [slot]: draft }));
  }

  function reset() {
    setDrafts({ cover: untouched, emblem: untouched, footer: untouched });
    setFileVersion((value) => value + 1); setError(''); setNotice('');
  }

  async function read(slot: Slot, title: string, maxBytes: number, limit: string, file?: File) {
    setError(''); setNotice('');
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size < 1 || file.size > maxBytes) {
      setError(`${title}: selecione uma imagem PNG ou JPEG de até ${limit}. O arquivo anterior foi mantido.`);
      return;
    }
    setReading(true);
    try {
      const base64 = await readAsBase64(file, 'Não foi possível ler a imagem. Selecione o arquivo novamente.');
      setDraft(slot, { base64, type: file.type, remove: false, name: file.name });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível ler a imagem.');
    } finally { setReading(false); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      setSaved(await saveCertificateTemplate({
        coverBase64: drafts.cover.base64, removeCover: drafts.cover.remove,
        emblemBase64: drafts.emblem.base64, removeEmblem: drafts.emblem.remove,
        footerBase64: drafts.footer.base64, removeFooter: drafts.footer.remove,
      }));
      setDrafts({ cover: untouched, emblem: untouched, footer: untouched });
      setFileVersion((value) => value + 1);
      setNotice('Certificado salvo. Os próximos certificados emitidos já usam este modelo.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar. Suas alterações continuam na prévia.');
    } finally { setBusy(false); }
  }

  return (
    <div className="page-content">
      <Page>
        <PageHeader
          description="Personalize o certificado que os colaboradores recebem ao concluir um treinamento."
          eyebrow="PORTAL DA EMPRESA"
          title="Certificado"
        />

        {saved === null && !error && <LoadingState>Carregando certificado...</LoadingState>}
        {saved === null && error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        {saved !== null && (
          <form className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onSubmit={(event) => void save(event)}>
            <div className="grid min-w-0 gap-4">
              {slots.map(({ slot, title, description, pick, hint, maxBytes, limit, frame }) => {
                const source = preview(slot);
                return (
                  <Card aria-labelledby={`certificate-${slot}-title`} key={slot} role="region">
                    <CardHeader>
                      <CardTitle id={`certificate-${slot}-title`}>{title}</CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                        <div className={cn(
                          'relative grid w-full place-items-center overflow-hidden rounded-lg border border-border bg-[conic-gradient(#f1f4f2_25%,#fff_0_50%,#f1f4f2_0_75%,#fff_0)] bg-[length:14px_14px]',
                          frame, slot === 'emblem' && 'rounded-full',
                        )}>
                          {source
                            ? <img alt={`Prévia: ${title.toLowerCase()}`} className={cn('absolute inset-0 size-full', slot === 'cover' ? 'object-cover' : 'object-contain')} src={source} />
                            : <span className="px-2 text-center text-xs text-muted-foreground">Sem imagem</span>}
                        </div>
                        <div className={cn('grid content-start gap-2', slot === 'cover' && 'sm:col-span-2')}>
                          <Dropzone
                            accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                            ariaLabel={`Selecionar ${title.toLowerCase()}`}
                            disabled={working}
                            fileName={drafts[slot].name}
                            hint={hint}
                            id={`certificate-${slot}`}
                            onFile={(file) => void read(slot, title, maxBytes, limit, file)}
                            resetKey={fileVersion}
                            title={pick}
                          />
                          {source && (
                            <Button className="justify-self-start" disabled={working} size="sm" variant="ghost"
                              onClick={() => { setDraft(slot, { ...untouched, remove: true }); setFileVersion((value) => value + 1); setNotice(''); }}>
                              <Trash2 /> Remover
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="grid gap-3">
                {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
                {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
                <p className={cn('m-0 inline-flex items-center gap-2 text-sm text-muted-foreground', changed && 'text-warning')} role="status">
                  <span aria-hidden="true">{changed ? '●' : '✓'}</span>
                  {changed ? 'Alterações não publicadas' : 'Certificado publicado'}
                </p>
                {changed && (
                  <div className="flex flex-wrap gap-2">
                    <Button aria-busy={working} disabled={working} type="submit">
                      {busy ? 'Salvando...' : reading ? 'Lendo arquivo...' : 'Salvar certificado'}
                    </Button>
                    <Button disabled={working} onClick={reset} variant="outline">Descartar alterações</Button>
                  </div>
                )}
              </div>
            </div>

            <aside aria-label="Prévia do certificado" className="grid min-w-0 gap-3 xl:sticky xl:top-24">
              <div className="flex items-start justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="m-0 text-base font-semibold">Prévia ao vivo</h2>
                  <p className="m-0 text-sm text-muted-foreground">O certificado como o colaborador recebe, com dados de exemplo.</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[0.6875rem] font-bold tracking-wider text-primary">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />AO VIVO
                </span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <CertificatePreview
                  companyName={tenant.tenantName}
                  cover={preview('cover')}
                  emblem={preview('emblem')}
                  footer={preview('footer')}
                  logo={saved.logoReference}
                />
              </div>
              {changed
                ? <p className="m-0 text-xs text-muted-foreground">Salve para abrir o PDF de exemplo com este modelo.</p>
                : <a className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary" href="/api/tenant/certificate-template/preview" rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" className="size-4" /> Abrir PDF de exemplo
                </a>}
              <p className="m-0 text-xs text-muted-foreground">Os certificados já emitidos não mudam: cada um guarda o modelo com que foi emitido.</p>
            </aside>
          </form>
        )}
      </Page>
    </div>
  );
}

const ink = '#102d26';
const green = '#14694b';
const gold = '#c9a227';
const muted = '#607068';
const hairline = '#c8d6ce';

/** The certificate drawn with the same measures as the PDF (842 × 595 points), so what is seen here is what is issued. */
function CertificatePreview({ companyName, cover, emblem, footer, logo }: {
  companyName: string; cover: string | null; emblem: string | null; footer: string | null; logo: string | null;
}) {
  const top = emblem ? 176 : 146;
  const text = cover
    ? { heading: top, title: top + 20, titleSize: 28, rule: top + 66, lead: top + 76, name: top + 98, nameSize: 26, line: top + 154,
      company: top + 162, companySize: 13, event: top + 200, eventSize: 17, period: top + 248, periodSize: 12 }
    : { heading: 128, title: 150, titleSize: 32, rule: 200, lead: 216, name: 240, nameSize: 28, line: 304,
      company: 316, companySize: 14, event: 358, eventSize: 18, period: 412, periodSize: 13 };
  const footerPicture = footer ?? (cover ? logo : null);
  const year = new Date().getFullYear();
  // a line of text whose top is at `y`, as the PDF places it
  const line = (y: number, size: number, fill: string, content: string, weight = 400) => (
    <text fill={fill} fontSize={size} fontWeight={weight} textAnchor="middle" x={421} y={y + size}>{content}</text>
  );
  return (
    <svg aria-label="Prévia do certificado" className="block h-auto w-full" data-testid="certificate-preview" role="img" viewBox="0 0 842 595">
      <defs><clipPath id="certificate-emblem-clip"><circle cx={421} cy={134} r={34} /></clipPath></defs>
      <rect fill="#fff" height={595} width={842} />
      <rect fill={green} height={595} width={14} />
      <rect fill={gold} height={595} width={4} x={14} />
      {cover && <image height={106} href={cover} preserveAspectRatio="xMidYMid slice" width={774} x={40} y={28} />}
      <rect fill="none" height={551} stroke={green} strokeWidth={1.6} width={786} x={34} y={22} />
      <rect fill="none" height={539} stroke={hairline} strokeWidth={0.6} width={774} x={40} y={28} />

      {!cover && <>
        <rect fill={ink} height={58} width={58} x={64} y={50} />
        <image height={48} href="/favicon.svg" width={48} x={69} y={55} />
        <text fill={ink} fontSize={11} x={132} y={78}>SIPAT Online</text>
        {logo && <image height={58} href={logo} preserveAspectRatio="xMaxYMid meet" width={200} x={590} y={50} />}
        {emblem && <image height={58} href={emblem} width={58} x={392} y={50} />}
      </>}
      {cover && emblem && <>
        <circle cx={421} cy={134} fill="#fff" r={38} stroke={gold} strokeWidth={1.5} />
        <image clipPath="url(#certificate-emblem-clip)" height={68} href={emblem} width={68} x={387} y={100} />
      </>}

      {line(text.heading, 13, green, 'CERTIFICADO')}
      {line(text.title, text.titleSize, ink, 'de participação')}
      <line stroke={gold} strokeWidth={2} x1={391} x2={451} y1={text.rule} y2={text.rule} />
      {line(text.lead, 13, muted, 'Certificamos que')}
      {line(text.name, text.nameSize, ink, 'Maria Aparecida da Silva')}
      <line stroke={hairline} strokeWidth={0.8} x1={231} x2={611} y1={text.line} y2={text.line} />
      {line(text.company, text.companySize, ink, `da empresa ${companyName}, participou do treinamento`)}
      {line(text.event, text.eventSize, green, `SIPAT ${year}`)}
      {line(text.period, text.periodSize, muted, `Realizado de 09/11/${year} a 13/11/${year}, com 50 min de conteúdo.`)}

      <line stroke={hairline} strokeWidth={0.6} x1={64} x2={790} y1={478} y2={478} />
      <text fill={muted} fontSize={8} x={64} y={498}>EMITIDO EM</text>
      <text fill={ink} fontSize={12} x={64} y={516}>13/11/{year}</text>
      <text fill={muted} fontSize={8} textAnchor="end" x={790} y={498}>IDENTIFICADOR</text>
      <text fill={ink} fontSize={9} textAnchor="end" x={790} y={516}>00000000-0000-0000-0000-000000000000</text>
      {footerPicture && <image height={42} href={footerPicture} width={200} x={321} y={484} />}
      <text fill={muted} fontSize={9} textAnchor="middle" x={421} y={554}>
        SIPAT Online · Documento de participação, sem assinatura ou habilitação profissional presumida.
      </text>
    </svg>
  );
}
