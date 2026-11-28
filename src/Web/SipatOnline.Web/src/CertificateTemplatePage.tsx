import { ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { companyFileAddress, getCertificateTemplate, getCompanyAdministrationId, saveCertificateTemplate, type CertificateTemplate, type TenantBranding } from './api';
import LoadingState from './LoadingState';
import { Dropzone, readAsBase64 } from './TenantAppearancePage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/ui/page';
import { fitPicture } from '@/lib/fitPicture';
import { cn } from '@/lib/utils';

type Slot = 'cover' | 'emblem' | 'footer';
/** What the person chose for one picture and has not saved yet. */
interface Draft { base64: string | null; type: string; remove: boolean; name: string }

const samplePdf = '/api/tenant/certificate-template/preview';
const untouched: Draft = { base64: null, type: 'image/png', remove: false, name: '' };
/** The biggest file a person may pick; the page then redraws it to what the certificate takes. */
const MAX_PICKED_BYTES = 15 * 1024 * 1024;
const slots: { slot: Slot; title: string; description: string; pick: string; hint: string; maxBytes: number; maxSide: number; limit: string; frame: string }[] = [
  {
    slot: 'cover', title: 'Imagem de capa', pick: 'Escolher capa',
    description: 'Faixa no topo do certificado, no lugar das logos. Ocupa toda a largura; o que passar da altura é cortado.',
    hint: 'PNG, JPEG ou WebP · recomendado 1600 × 220 px · ajustamos o tamanho para você', maxBytes: 1_000_000, maxSide: 2400, limit: '1 MB', frame: 'aspect-[774/106] sm:col-span-2',
  },
  {
    slot: 'emblem', title: 'Emblema do certificado', pick: 'Escolher emblema',
    description: 'Selo redondo no centro, sobre a borda da capa. Sem capa, fica no topo, entre as logos.',
    hint: 'PNG, JPEG ou WebP · quadrado, recomendado 360 × 360 px · ajustamos o tamanho para você', maxBytes: 256 * 1024, maxSide: 720, limit: '256 KB', frame: 'aspect-square',
  },
  {
    slot: 'footer', title: 'Imagem de rodapé', pick: 'Escolher imagem',
    description: 'Fica no centro do rodapé: a logo da empresa, um selo ou uma assinatura.',
    hint: 'PNG, JPEG ou WebP · recomendado 400 × 84 px, fundo transparente · ajustamos o tamanho para você', maxBytes: 256 * 1024, maxSide: 1200, limit: '256 KB', frame: 'aspect-[200/42]',
  },
];

/** `embedded`: inside the Certificado tab of the Identidade visual page, which has the header. */
export default function CertificateTemplatePage({ tenant, embedded = false }: { tenant: TenantBranding; embedded?: boolean }) {
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

  async function read(slot: Slot, title: string, maxBytes: number, maxSide: number, limit: string, file?: File) {
    setError(''); setNotice('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size < 1 || file.size > MAX_PICKED_BYTES) {
      setError(`${title}: selecione uma imagem PNG, JPEG ou WebP. O arquivo anterior foi mantido.`);
      return;
    }
    setReading(true);
    try {
      // redrawn as a plain PNG of the right size: whatever the designer exported, the certificate can draw it
      const fitted = await fitPicture(file, maxSide, maxBytes);
      if (fitted !== null) {
        setDraft(slot, { base64: fitted, type: 'image/png', remove: false, name: file.name });
        return;
      }
      // a browser that cannot redraw it: the file goes as it is, when it is one the certificate takes
      if (file.type === 'image/webp' || file.size > maxBytes) {
        setError(`${title}: não foi possível ajustar esta imagem. Envie um PNG ou JPEG de até ${limit}. O arquivo anterior foi mantido.`);
        return;
      }
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

  // the operator inside a company: the link alone cannot say which company, so the PDF is fetched and then opened
  async function openSample(event: MouseEvent<HTMLAnchorElement>) {
    if (!getCompanyAdministrationId()) return;
    event.preventDefault();
    const tab = window.open('', '_blank');
    try {
      const address = await companyFileAddress(samplePdf);
      if (tab) tab.location.href = address; else window.location.href = address;
    } catch (failure) {
      tab?.close();
      setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o PDF de exemplo.');
    }
  }

  const content = <>
        {saved === null && !error && <LoadingState>Carregando certificado...</LoadingState>}
        {saved === null && error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

        {saved !== null && (
          <form className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" onSubmit={(event) => void save(event)}>
            <div className="grid min-w-0 gap-4">
              {slots.map(({ slot, title, description, pick, hint, maxBytes, maxSide, limit, frame }) => {
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
                            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                            ariaLabel={`Selecionar ${title.toLowerCase()}`}
                            disabled={working}
                            fileName={drafts[slot].name}
                            hint={hint}
                            id={`certificate-${slot}`}
                            onFile={(file) => void read(slot, title, maxBytes, maxSide, limit, file)}
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
                : <a className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary" href={samplePdf} onClick={(event) => void openSample(event)} rel="noreferrer" target="_blank">
                  <ExternalLink aria-hidden="true" className="size-4" /> Abrir PDF de exemplo
                </a>}
              <p className="m-0 text-xs text-muted-foreground">Os certificados já emitidos não mudam: cada um guarda o modelo com que foi emitido.</p>
            </aside>
          </form>
        )}
  </>;
  if (embedded) return content;
  return (
    <div className="page-content">
      <Page>
        <PageHeader
          description="Personalize o certificado que os colaboradores recebem ao concluir um treinamento."
          eyebrow="PORTAL DA EMPRESA"
          title="Modelo do certificado"
        />
        {content}
      </Page>
    </div>
  );
}

const ink = '#102d26';
const green = '#14694b';
const gold = '#c9a227';
const muted = '#607068';
const hairline = '#c8d6ce';
// the same made-up contents as the sample PDF
const sampleCourses = ['Segurança em primeiro lugar', 'Ergonomia no dia a dia', 'Saúde e bem-estar', 'Prevenção de acidentes', 'Primeiros socorros'];

/** The certificate drawn with the same measures as the PDF (842 × 595 points), so what is seen here is what is issued. */
function CertificatePreview({ companyName, cover, emblem, footer, logo }: {
  companyName: string; cover: string | null; emblem: string | null; footer: string | null; logo: string | null;
}) {
  // the text starts under the logos, the cover or the emblem
  const top = !cover ? 116 : emblem ? 180 : 150;
  const footerPicture = footer ?? (cover ? logo : null);
  const year = new Date().getFullYear();
  // a line of text whose top is at `y`, as the PDF places it
  const line = (y: number, size: number, fill: string, content: string, weight = 400) => (
    <text fill={fill} fontSize={size} fontWeight={weight} textAnchor="middle" x={421} y={y + size}>{content}</text>
  );
  // the list as the PDF sets these five names in the room each layout leaves: one column, then two, then three
  const list = !cover ? { size: 12, columns: 1 } : emblem ? { size: 9, columns: 3 } : { size: 13, columns: 2 };
  const rowHeight = list.size + 6;
  const mark = list.size + 7;
  const columnWidth = Math.max(...sampleCourses.map((name) => name.length)) * list.size * 0.54 + mark;
  const perColumn = Math.ceil(sampleCourses.length / list.columns);
  const gap = 32;
  const listLeft = 421 - (list.columns * columnWidth + (list.columns - 1) * gap) / 2;
  const listTop = top + 246 + 18;
  return (
    <svg aria-label="Prévia do certificado" className="block h-auto w-full" data-testid="certificate-preview" role="img" viewBox="0 0 842 595">
      <defs><clipPath id="certificate-emblem-clip"><circle cx={421} cy={134} r={34} /></clipPath></defs>
      <rect fill="#fff" height={595} width={842} />
      {cover && <image height={106} href={cover} preserveAspectRatio="xMidYMid slice" width={774} x={40} y={28} />}

      {!cover && <>
        {logo && <image height={58} href={logo} preserveAspectRatio="xMaxYMid meet" width={200} x={590} y={50} />}
        {emblem && <image height={58} href={emblem} width={58} x={392} y={50} />}
      </>}
      {cover && emblem && <>
        <circle cx={421} cy={134} fill="#fff" r={38} stroke={gold} strokeWidth={1.5} />
        <image clipPath="url(#certificate-emblem-clip)" height={68} href={emblem} width={68} x={387} y={100} />
      </>}

      {line(top, 20, ink, 'Certificado de')}
      {line(top + 24, 34, ink, 'Participação', 700)}
      {line(top + 78, 12, muted, 'Este certificado reconhece que')}
      {line(top + 98, 24, ink, 'Maria Aparecida da Silva', 700)}
      {line(top + 146, 12, ink, `da empresa ${companyName}, participou do treinamento`)}
      {line(top + 178, 16, green, `SIPAT ${year}`, 700)}
      {line(top + 216, 11, muted, `Realizado de 09/11/${year} a 13/11/${year}, com 50 min de conteúdo.`)}
      {line(top + 246, 8, green, 'CONTEÚDOS CONCLUÍDOS', 700)}
      {sampleCourses.map((name, index) => {
        const x = listLeft + Math.floor(index / perColumn) * (columnWidth + gap);
        const middle = listTop + (index % perColumn) * rowHeight + rowHeight / 2;
        return (
          <g key={name}>
            <circle cx={x + list.size / 2} cy={middle} fill={green} r={list.size / 2} />
            <polyline fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3}
              points={`${x + list.size * 0.27},${middle + list.size * 0.02} ${x + list.size * 0.44},${middle + list.size * 0.19} ${x + list.size * 0.74},${middle - list.size * 0.18}`} />
            <text dominantBaseline="central" fill={ink} fontSize={list.size} x={x + mark} y={middle}>{name}</text>
          </g>
        );
      })}

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
