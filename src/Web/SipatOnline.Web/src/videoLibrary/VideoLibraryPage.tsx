import { CloudUpload, ImageMinus, ImagePlus, Lock, MoreHorizontal, Pencil, Play, RotateCcw, Search, Tags, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  acceptCompanyVideoTerms, deleteCompanyVideo, deletePlatformVideo, isExternal, isExtra, listCompanyVideos, listPlatformCompanies, listPlatformLibraryVideos,
  listSubjects, listVideoCompanies, listVideoSubjects, removeVideoThumbnail, renameVideo, setVideoThumbnail, videoProvider,
  type PlatformCourseVideo,
} from '@/api';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import SelectCheck from '@/components/ui/select-check';
import { formatBytes, formatDuration, getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import InlineText from '@/courseEditor/InlineText';
import { ExternalVideoFrame } from '@/ExternalVideoPreview';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import { SipatVideoPlayer } from '@sipat/video-player';
import { videoVersions } from '@/videoVersions';
import {
  cancelUpload, checkVideoFile, enqueueUploads, isActive, onVideoUploaded, retryUpload, titleFromFileName, useUploadQueue,
  type UploadItem,
} from '@/videoUploads/uploadQueue';
import AssociateVideosDialog, { type Choice } from './AssociateVideosDialog';

/** A video on the page: the video, and where it is used (the names, for a company; how many, for the operation). */
interface LibraryItem { video: PlatformCourseVideo; trainings: string[]; uses: number }

/**
 * The videos, one page for both: the platform's library, for the operation, and a company's own videos (`company`),
 * for its administrator. One thing on top: the place to drop them (nothing to fill in before sending, the name comes
 * from the file). Below, the videos as cards: watch on click, the rest behind "⋯". A company's page shows the room it
 * has; the operation's adds what is only its to decide — the assuntos of a video and which companies see it.
 */
export default function VideoLibraryPage({ company = false }: { company?: boolean }) {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  // '' every video, 'none' those without an assunto, or one assunto
  const subjectFilter = params.get('assunto') ?? '';
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  // a company's own videos: the room it has, whether it accepted the terms for sending, and whether its plan sends at all
  const [room, setRoom] = useState<{ usedBytes: number; quotaBytes: number; termsAccepted: boolean; canSend: boolean } | null>(null);
  const [subjects, setSubjects] = useState<Choice[]>([]);
  const [videoSubjects, setVideoSubjectMap] = useState<Map<string, string[]>>(new Map());
  const [companies, setCompanies] = useState<Choice[]>([]);
  const [videoCompanies, setVideoCompanyMap] = useState<Map<string, string[]>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // the videos whose assuntos and companies are being set (one from its menu, or the selection)
  const [associating, setAssociating] = useState<string[] | null>(null);
  // the video playing, in its own card (one at a time)
  const [playing, setPlaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const queue = useUploadQueue();

  const loadVideos = useCallback(async (): Promise<LibraryItem[]> => {
    if (company) {
      const mine = await listCompanyVideos();
      setRoom({ usedBytes: mine.usedBytes, quotaBytes: mine.quotaBytes, termsAccepted: mine.termsAccepted, canSend: mine.canSend });
      return mine.videos.map(item => ({ video: item.video, trainings: item.trainings, uses: item.trainings.length }));
    }
    return (await listPlatformLibraryVideos()).map(item => ({ video: item.video, trainings: [], uses: item.courseCount }));
  }, [company]);

  const load = useCallback(async () => {
    try {
      // the assuntos and the companies come apart: the videos still show if they fail
      if (!company) {
        Promise.all([listSubjects(), listVideoSubjects()]).then(([list, links]) => {
          setSubjects(list.map(item => ({ id: item.id, title: item.name })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
          setVideoSubjectMap(new Map(links.map(item => [item.videoId, item.subjectIds])));
        }, () => undefined);
        Promise.all([listPlatformCompanies(), listVideoCompanies()]).then(([list, rows]) => {
          setCompanies(list.map(item => ({ id: item.id, title: item.name })).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
          setVideoCompanyMap(new Map(rows.map(item => [item.videoId, item.companyIds])));
        }, () => undefined);
      }
      setItems(await loadVideos());
    } catch (failure) {
      setError(getErrorMessage(failure));
      setItems(current => current ?? []);
    }
  }, [company, loadVideos]);
  useEffect(() => { void load(); }, [load]);

  // each video the upload finishes shows up here; many close together cause one reload
  useEffect(() => {
    let timer: number | undefined;
    const stop = onVideoUploaded(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { loadVideos().then(setItems, () => undefined); }, 1500);
    });
    return () => { stop(); window.clearTimeout(timer); };
  }, [loadVideos]);

  // while a video is being prepared, look again quietly until it is ready (or failed)
  const preparing = items?.some(item => item.video.status === 'Processing' || item.video.status === 'Uploading') ?? false;
  useEffect(() => {
    if (!preparing) return;
    const timer = window.setInterval(() => { loadVideos().then(setItems, () => undefined); }, 15_000);
    return () => window.clearInterval(timer);
  }, [preparing, loadVideos]);

  // success notices leave on their own
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const setParam = (key: string, value: string) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  // what this browser is sending already shows in its own progress card above
  const sendingHere = useMemo(() => new Set(queue.items.map(item => item.videoId).filter(Boolean)), [queue.items]);
  const all = useMemo(() => (items ?? []).filter(item => item.video.status !== 'Uploading' || !sendingHere.has(item.video.id)), [items, sendingHere]);
  const shown = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return all.filter(item => {
      if (term && !item.video.title.toLocaleLowerCase('pt-BR').includes(term)) return false;
      if (!subjectFilter) return true;
      const ids = videoSubjects.get(item.video.id) ?? [];
      return subjectFilter === 'none' ? ids.length === 0 : ids.includes(subjectFilter);
    });
  }, [all, query, subjectFilter, videoSubjects]);

  const names = useMemo(() => ({
    subjects: new Map(subjects.map(item => [item.id, item.title])),
    companies: new Map(companies.map(item => [item.id, item.title])),
  }), [subjects, companies]);

  // the operation always sends; a company, when its plan has its own videos
  const canSend = !company || !!room?.canSend;
  const needsTerms = company && !!room && !room.termsAccepted;
  const sending = queue.items.filter(item => isActive(item.status) || item.status === 'failed');
  const totalBytes = all.reduce((sum, item) => sum + (item.video.sizeBytes ?? 0), 0);
  const narrowed = query.trim() !== '' || subjectFilter !== '';
  const used = room ? room.usedBytes / room.quotaBytes : 0;

  function send(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setError('');
    const list = Array.from(files);
    const refused = list.map(file => ({ file, problem: checkVideoFile(file) })).find(item => item.problem);
    if (refused) setError(`${refused.file.name}: ${refused.problem}`);
    enqueueUploads(list.filter(file => !checkVideoFile(file)).map(file => ({ file, title: titleFromFileName(file.name) })));
  }

  async function agree() {
    setError('');
    try { await acceptCompanyVideoTerms(); await load(); } catch (failure) { setError(getErrorMessage(failure)); }
  }

  async function rename(item: LibraryItem, title: string) {
    const next = title.trim();
    if (!next || next === item.video.title) return;
    try { await renameVideo(item.video.id, next, company); await load(); } catch (failure) { setError(getErrorMessage(failure)); }
  }

  async function changeThumbnail(item: LibraryItem, image: File | null) {
    setError('');
    try {
      if (image) await setVideoThumbnail(item.video.id, image, company); else await removeVideoThumbnail(item.video.id, company);
      await load();
      setNotice(image ? `Miniatura de "${item.video.title}" trocada.` : `"${item.video.title}" voltou a mostrar um quadro do vídeo.`);
    } catch (failure) { setError(getErrorMessage(failure)); }
  }

  const removeOne = (videoId: string) => (company ? deleteCompanyVideo(videoId) : deletePlatformVideo(videoId));

  async function remove(item: LibraryItem) {
    const usage = item.uses > 0 ? ` Ele está em ${pluralize(item.uses, 'treinamento', 'treinamentos')}.` : '';
    if (!window.confirm(`Excluir o vídeo "${item.video.title}"?${usage} O arquivo é apagado e isso não pode ser desfeito.`)) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      await removeOne(item.video.id);
      setSelected(current => { const next = new Set(current); next.delete(item.video.id); return next; });
      await load();
      setNotice(`O vídeo "${item.video.title}" foi excluído.`);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setBusy(false); }
  }

  /** Deletes the checked videos one by one; one that cannot go (in use, for instance) stays checked and is reported. */
  async function removeSelected() {
    const picked = all.filter(item => selected.has(item.video.id));
    const inUse = picked.filter(item => item.uses > 0).length;
    const usage = inUse > 0 ? ` ${pluralize(inUse, 'deles está', 'deles estão')} em treinamentos.` : '';
    if (!window.confirm(`Excluir ${pluralize(picked.length, 'vídeo', 'vídeos')}?${usage} Os arquivos são apagados e isso não pode ser desfeito.`)) return;
    setError(''); setNotice(''); setBusy(true);
    const failed: string[] = [];
    let firstError = '';
    for (const item of picked) {
      try { await removeOne(item.video.id); } catch (failure) {
        failed.push(item.video.id);
        firstError ||= `"${item.video.title}": ${getErrorMessage(failure)}`;
      }
    }
    setSelected(new Set(failed));
    await load();
    setBusy(false);
    const done = picked.length - failed.length;
    if (done > 0) setNotice(`${pluralize(done, 'vídeo excluído', 'vídeos excluídos')}.`);
    if (failed.length > 0) setError(`${failed.length === 1 ? '1 vídeo não pôde ser excluído e continua selecionado' : `${failed.length} vídeos não puderam ser excluídos e continuam selecionados`}. ${firstError}`);
  }

  const toggle = (videoId: string, checked: boolean) => setSelected(current => {
    const next = new Set(current);
    if (checked) next.add(videoId); else next.delete(videoId);
    return next;
  });

  if (!items && !error) return <LoadingState>Carregando os vídeos...</LoadingState>;

  return <Page>
    <PageHeader
      description={company
        ? 'Os vídeos da sua empresa, só para ela. Depois de enviados, entram na lista de vídeos dos seus treinamentos.'
        : 'Os vídeos da plataforma. Depois de enviados, entram nos treinamentos e na lista de vídeos das empresas.'}
      eyebrow={company ? 'Só da sua empresa' : 'Acervo da plataforma'} title={company ? 'Vídeos da empresa' : 'Biblioteca de vídeos'} />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}

    {company && room && !room.canSend && <EmptyState description="Enviar vídeos da própria empresa faz parte do plano Diamante. Fale com a operação para mudar de plano." title="Disponível no plano Diamante" />}

    {canSend && (needsTerms
      ? <section className="grid justify-items-start gap-3 rounded-3xl border border-border bg-card p-6">
        <p className="m-0 max-w-prose text-[0.9375rem] leading-relaxed">Os vídeos que você enviar são da sua empresa: ela tem o direito de usá-los e a autorização de imagem de quem aparece neles.</p>
        <Button onClick={() => void agree()}>Concordo, quero enviar</Button>
      </section>
      : <DropZone compact={sending.length > 0 || all.length > 0} onFiles={send} />)}

    {all.length > 0 && <div className="flex flex-wrap items-center gap-2.5" role="search">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-md">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar vídeo" className="pl-9" onChange={event => setParam('q', event.target.value)} placeholder="Buscar vídeo por nome" type="search" value={query} />
      </label>
      {!company && <NativeSelect aria-label="Filtrar por assunto" className="w-auto max-w-xs" onChange={event => setParam('assunto', event.target.value)} value={subjectFilter}>
        <option value="">Todos os assuntos</option>
        <option value="none">Sem assunto</option>
        {subjects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </NativeSelect>}
      {narrowed && <Button onClick={() => setParams(new URLSearchParams(), { replace: true })} size="sm" variant="ghost">Limpar</Button>}
      <span aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground max-sm:ml-0">
        {narrowed ? `${shown.length} de ${all.length}` : pluralize(all.length, 'vídeo', 'vídeos')}
        {!company && totalBytes > 0 && <> · <span title="Soma do tamanho de todos os vídeos da biblioteca">{formatBytes(totalBytes)} no total</span></>}
      </span>
    </div>}

    {shown.length > 0 && <div className={cn('sticky top-0 z-20 flex flex-wrap items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-2 shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-colors', selected.size > 0 ? 'border-primary' : 'border-[#dfe6e3]')} role="toolbar">
      <label className="m-0 flex cursor-pointer items-center gap-2.5 text-sm font-semibold">
        <SelectCheck checked={shown.every(item => selected.has(item.video.id))} label="Selecionar todos os vídeos" mixed={selected.size > 0}
          onChange={checked => setSelected(checked ? new Set(shown.map(item => item.video.id)) : new Set())} />
        {selected.size > 0 ? pluralize(selected.size, 'selecionado', 'selecionados') : 'Selecionar todos'}
      </label>
      {selected.size > 0 && <Button aria-label="Limpar seleção" onClick={() => setSelected(new Set())} size="icon-sm" title="Limpar seleção" variant="ghost"><X /></Button>}
      <span className="ml-auto flex flex-wrap gap-2 max-[640px]:ml-0 max-[640px]:w-full">
        <Button className="max-[640px]:flex-1" disabled={selected.size === 0 || busy} onClick={() => void removeSelected()} variant="outline"><Trash2 /> Excluir</Button>
        {!company && <Button className="max-[640px]:flex-[2]" disabled={selected.size === 0 || busy} onClick={() => setAssociating([...selected])}><Tags /> Associar a assunto ou empresa</Button>}
      </span>
    </div>}

    {all.length > 0 && shown.length === 0 && <EmptyState description="Tente outro nome ou outro assunto." title="Nenhum vídeo encontrado." />}

    {(sending.length > 0 || shown.length > 0) && <ul aria-label="Vídeos" className="m-0 grid list-none gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {sending.map(item => <li key={item.id}><SendingCard item={item} /></li>)}
      {shown.map(item => <li key={item.video.id}>
        <VideoCard checked={selected.has(item.video.id)} item={item} onCheck={checked => toggle(item.video.id, checked)}
          onAssociate={company ? undefined : () => setAssociating([item.video.id])} onPlay={() => setPlaying(item.video.id)} onRemove={() => void remove(item)}
          onRename={title => void rename(item, title)} onThumbnail={image => void changeThumbnail(item, image)} playing={playing === item.video.id}
          privateTo={(videoCompanies.get(item.video.id) ?? []).map(id => names.companies.get(id) ?? 'empresa removida')}
          subjects={(videoSubjects.get(item.video.id) ?? []).flatMap(id => names.subjects.get(id) ?? [])} />
      </li>)}
    </ul>}

    {company && room?.canSend && <footer aria-label="Espaço usado" className="grid max-w-[14rem] gap-1.5">
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-500', used > 0.9 ? 'bg-destructive' : 'bg-primary/60')} style={{ width: `${Math.min(100, Math.max(used > 0 ? 2 : 0, used * 100))}%` }} />
      </div>
      <p className={cn('m-0 text-xs tabular-nums', used > 0.9 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{formatBytes(room.usedBytes)} de {formatBytes(room.quotaBytes)}</p>
    </footer>}

    {associating && <AssociateVideosDialog companies={companies} onClose={() => setAssociating(null)} subjects={subjects}
      onSubjectCreated={subject => setSubjects(current => current.some(item => item.id === subject.id)
        ? current : [...current, subject].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')))}
      onSubjectDeleted={subjectId => {
        setSubjects(current => current.filter(item => item.id !== subjectId));
        setVideoSubjectMap(current => new Map([...current].map(([videoId, ids]) => [videoId, ids.filter(id => id !== subjectId)])));
      }}
      videoCompanies={videoCompanies} videoIds={associating} videoSubjects={videoSubjects}
      onSaved={async message => {
        setAssociating(null);
        setSelected(new Set());
        await load();
        setNotice(message);
      }} />}
  </Page>;
}

/** The one thing on top of the page: drop the files, or pick them. With videos on the page it is a slim strip. */
function DropZone({ onFiles, compact = false }: { onFiles: (files: FileList | File[] | null) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    onFiles(event.dataTransfer.files);
  };
  return <label
    className={cn('m-0 cursor-pointer border-dashed transition-[border-color,background-color,padding] duration-200 focus-within:border-primary',
      compact ? 'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left' : 'grid justify-items-center gap-2 rounded-3xl border-2 px-6 py-12 text-center',
      over ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary/60')}
    onDragEnter={event => { event.preventDefault(); depth.current += 1; setOver(true); }}
    onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) setOver(false); }}
    onDragOver={event => event.preventDefault()}
    onDrop={drop}>
    <CloudUpload aria-hidden="true" className={cn('shrink-0 transition-colors', compact ? 'size-5' : 'size-8', over ? 'text-primary' : 'text-muted-foreground')} />
    {compact
      ? <span className="min-w-0 flex-1 text-sm text-muted-foreground"><strong className="font-semibold text-foreground">{over ? 'Pode soltar' : 'Enviar mais vídeos'}</strong> · arraste aqui ou <span className="font-semibold text-primary underline-offset-2 hover:underline">escolha do computador</span></span>
      : <>
        <strong className="text-lg font-semibold tracking-tight">{over ? 'Pode soltar' : 'Arraste seus vídeos aqui'}</strong>
        <span className="text-sm text-muted-foreground">ou <span className="font-semibold text-primary underline-offset-2 hover:underline">escolha do computador</span> · MP4 ou WebM, até 2 GB cada</span>
      </>}
    <input accept="video/mp4,video/webm,.mp4,.webm" aria-label="Enviar vídeos" className="sr-only" multiple onChange={event => { onFiles(event.target.files); event.target.value = ''; }} type="file" />
  </label>;
}

const tile = 'relative grid aspect-video w-full place-items-center overflow-hidden rounded-xl bg-[#12332c] text-white';
const sendingTile = cn(tile, 'rounded-[1.25rem]');

/** A video on its way: how far it is, or what went wrong with a way to try again. */
function SendingCard({ item }: { item: UploadItem }) {
  const failed = item.status === 'failed';
  const percent = item.totalBytes > 0 ? Math.round((item.sentBytes / item.totalBytes) * 100) : 0;
  return <article className="grid gap-2.5">
    <div className={cn(sendingTile, failed && 'bg-destructive-soft text-destructive')}>
      {failed
        ? <p className="m-0 px-4 text-center text-sm font-medium">{item.error ?? 'O envio não terminou.'}</p>
        : <span className="text-2xl font-semibold tabular-nums">{percent}%</span>}
      {!failed && <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-white/15"><div className="h-full bg-white transition-[width] duration-300" style={{ width: `${percent}%` }} /></div>}
    </div>
    <div className="flex items-center gap-2 px-1">
      <strong className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{item.title}</strong>
      {failed
        ? <Button onClick={() => retryUpload(item.id)} size="sm" variant="outline"><RotateCcw /> Tentar de novo</Button>
        : <Button aria-label={`Cancelar o envio de ${item.title}`} onClick={() => cancelUpload(item.id)} size="sm" variant="ghost">Cancelar</Button>}
    </div>
    {!failed && <p className="m-0 -mt-1.5 px-1 text-xs text-muted-foreground" role="status">{item.status === 'paused' ? 'Envio pausado' : item.status === 'offline' ? 'Sem conexão, o envio continua quando voltar' : 'Enviando…'}</p>}
  </article>;
}

/** The picture of a video: the one chosen for it, the provider's for YouTube, or a frame of the video itself. */
function Thumbnail({ video }: { video: PlatformCourseVideo }) {
  const [broken, setBroken] = useState(false);
  const cover = 'absolute inset-0 size-full object-cover';
  if (broken) return null;
  if (video.thumbnailUrl) return <img alt="" className={cover} decoding="async" loading="lazy" onError={() => setBroken(true)} src={video.thumbnailUrl} />;
  if (isExternal(video) && videoProvider(video) === 'YouTube' && video.externalId)
    return <img alt="" className={cover} decoding="async" loading="lazy" onError={() => setBroken(true)} src={`https://i.ytimg.com/vi/${video.externalId}/hqdefault.jpg`} />;
  // a frame a second in: the video's own image, without a picture made for it
  if (!isExternal(video) && video.fileUrl) return <VideoFrame className={cover} onError={() => setBroken(true)} src={video.fileUrl} />;
  return null;
}

/** A frame of the video, asked for only when its card scrolls into view: a long library does not open every video at once. */
function VideoFrame({ src, className, onError }: { src: string; className: string; onError: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div className={className} ref={ref}>
    {visible && <video aria-hidden="true" className="pointer-events-none size-full object-cover" muted onError={onError} playsInline preload="metadata" src={`${src}#t=1`} tabIndex={-1} />}
  </div>;
}

/** The video playing in its own card: ours starts by itself; YouTube and Vimeo in their player. */
function InlinePlayer({ video }: { video: PlatformCourseVideo }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // a browser may refuse to start by itself (or have no player at all): the play button is still there
  useEffect(() => { try { void Promise.resolve(ref.current?.play()).catch(() => undefined); } catch { /* stays paused */ } }, []);
  return <div className="absolute inset-0 bg-black [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
    {isExternal(video)
      ? <ExternalVideoFrame title={video.title} video={video} />
      : <div className="video-preview"><SipatVideoPlayer preload="metadata" sources={videoVersions(video.fileUrl, video)} title={video.title} videoRef={ref} /></div>}
  </div>;
}

/**
 * A video, as the library always showed it: a card with the video on top (its picture, and a click plays it right
 * there), its name, length and size, who it is private to, its assuntos with "Editar", and where it is used. A check
 * on the corner picks several; a picture of its own and deleting are behind "⋯".
 */
function VideoCard({ item, checked, playing, onCheck, onPlay, onRename, onThumbnail, onRemove, onAssociate, subjects, privateTo }: {
  item: LibraryItem; checked: boolean; playing: boolean; onCheck: (checked: boolean) => void; onPlay: () => void; onRemove: () => void;
  onRename: (title: string) => void; onThumbnail: (image: File | null) => void; onAssociate?: () => void; subjects: string[]; privateTo: string[];
}) {
  const { video, trainings, uses } = item;
  const ready = video.status === 'Ready';
  const picker = useRef<HTMLInputElement>(null);
  const nameField = useRef<HTMLDivElement>(null);
  const length = isExtra(video) && video.durationMilliseconds <= 0 ? videoProvider(video) : formatDuration(video.durationMilliseconds);
  const facts = [isExternal(video) && video.durationMilliseconds > 0 ? videoProvider(video) : '', length, !isExternal(video) && video.sizeBytes > 0 ? formatBytes(video.sizeBytes) : ''].filter(Boolean);
  return <article className={cn('group/card flex h-full min-w-0 flex-col overflow-hidden rounded-[1.25rem] border bg-card shadow-[0_1px_2px_rgb(18_51_44/0.05)] transition-[box-shadow,border-color] duration-200 hover:shadow-[0_14px_30px_-18px_rgb(18_51_44/0.45)]',
    checked ? 'border-primary ring-1 ring-primary' : 'border-[#dfe6e3] hover:border-[#12332c]/40')}>
    <div className={cn(tile, 'rounded-none')}>
      {!ready
        ? <p className={cn('m-0 px-4 text-center text-sm font-medium', video.status === 'Failed' && 'text-destructive')} role="status">
          {video.status === 'Failed' ? video.processingError ?? 'Não foi possível preparar este vídeo.' : video.status === 'Uploading' ? 'Enviando o vídeo…' : 'Preparando o vídeo…'}
        </p>
        : playing
          ? <InlinePlayer video={video} />
          : <button aria-label={`Assistir ${video.title}`} className="group absolute inset-0 m-0 grid min-h-0 cursor-pointer place-items-center rounded-none border-0 bg-transparent p-0 text-white" onClick={onPlay} type="button">
            <Thumbnail video={video} />
            {/* a soft shade at the foot keeps the length readable on any picture */}
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
            <span className="relative grid size-14 place-items-center rounded-full bg-[#0f7a3d] shadow-[0_6px_18px_rgb(0_0_0/0.3)] transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100"><Play aria-hidden="true" className="size-6 translate-x-0.5 fill-current" /></span>
            <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/55 px-1.5 py-0.5 text-xs tabular-nums">{length}</span>
          </button>}
      {!playing && <span className="absolute top-3 left-3 z-10">
        <SelectCheck checked={checked} label={`Selecionar ${video.title}`} onChange={onCheck} tone="dark" />
      </span>}
    </div>

    <div className="grid flex-1 content-start gap-2 px-4 pt-3.5 pb-3">
      <div className="flex items-start gap-1">
        <div className="-ml-1.5 min-w-0 flex-1" ref={nameField}>
          <InlineText className="text-[1.0625rem] font-extrabold tracking-[-0.01em] text-[#12332c]" label={`Nome do vídeo ${video.title}`} onCommit={onRename} value={video.title} />
        </div>
        <input accept="image/png,image/jpeg,image/webp" aria-label={`Miniatura de ${video.title}`} className="sr-only" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onThumbnail(file); }} ref={picker} tabIndex={-1} type="file" />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild><Button aria-label={`Mais opções de ${video.title}`} size="icon-sm" variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => window.setTimeout(() => nameField.current?.querySelector('input')?.select(), 0)}><Pencil /> Renomear</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => picker.current?.click()}><ImagePlus /> {video.thumbnailUrl ? 'Trocar miniatura' : 'Escolher miniatura'}</DropdownMenuItem>
            {video.thumbnailUrl && <DropdownMenuItem onSelect={() => onThumbnail(null)}><ImageMinus /> Usar um quadro do vídeo</DropdownMenuItem>}
            {trainings.length > 0 && <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Usado em</DropdownMenuLabel>
              {trainings.map(title => <DropdownMenuItem disabled key={title}>{title}</DropdownMenuItem>)}
            </>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRemove} variant="destructive"><Trash2 /> Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="m-0 text-[0.8125rem] tabular-nums text-muted-foreground">{facts.join(' · ')}</p>
      {privateTo.length > 0 && <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-warning">
        <Lock aria-hidden="true" className="size-3.5 shrink-0" /><span className="min-w-0 truncate">Privado: {privateTo.join(', ')}</span>
      </p>}
      {/* the assuntos of the video, with the way to change them (and the companies it is private to) */}
      {onAssociate && <button className="m-0 flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-transparent px-2.5 text-left text-[0.8125rem] transition-colors hover:border-primary/50 hover:bg-accent/50" onClick={onAssociate} type="button">
        <Tags aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn('min-w-0 flex-1 truncate', subjects.length === 0 && 'text-muted-foreground')}>{subjects.length > 0 ? subjects.join(' · ') : 'Sem assunto'}</span>
        <span className="shrink-0 text-xs font-semibold text-primary">Editar</span>
      </button>}
    </div>

    <footer className="flex items-center justify-between gap-2 border-t border-[#dfe6e3] px-4 py-2.5">
      <span className={cn('truncate rounded-full px-2.5 py-0.5 text-xs font-semibold', uses > 0 ? 'bg-accent text-primary' : 'bg-warning-soft text-warning')}>
        {trainings.length === 1 ? `Usado em ${trainings[0]}` : uses > 0 ? `Usado em ${pluralize(uses, 'treinamento', 'treinamentos')}` : 'Ainda não usado em treinamentos'}
      </span>
      <Button aria-label={`Excluir vídeo ${video.title}`} onClick={onRemove} size="icon-sm" title="Excluir vídeo" variant="ghost"><Trash2 /></Button>
    </footer>
  </article>;
}
