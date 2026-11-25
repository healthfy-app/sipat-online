import { CloudUpload, MoreHorizontal, Play, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  acceptCompanyVideoTerms, deleteCompanyVideo, listCompanyVideos, renameCompanyVideo,
  type CompanyVideo, type CompanyVideos,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { formatBytes, formatDuration, getErrorMessage } from '@/courseEditor/courseFormat';
import InlineText from '@/courseEditor/InlineText';
import LoadingState from '@/LoadingState';
import { cn } from '@/lib/utils';
import VideoPreview from '@/VideoPreview';
import {
  cancelUpload, checkVideoFile, enqueueUploads, isActive, onVideoUploaded, retryUpload, titleFromFileName, useUploadQueue,
  type UploadItem,
} from '@/videoUploads/uploadQueue';

/**
 * The videos a company sends itself. One thing on top: the place to drop them. Below, the videos as cards. Nothing to
 * fill in before sending: the name comes from the file and is changed on the card.
 */
export default function CompanyVideosPage() {
  const [data, setData] = useState<CompanyVideos | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<CompanyVideo | null>(null);
  const queue = useUploadQueue();

  const load = useCallback(() => listCompanyVideos().then(setData, (failure: unknown) => setError(getErrorMessage(failure))), []);
  useEffect(() => { void load(); }, [load]);
  // a video that finished sending joins the list
  useEffect(() => onVideoUploaded(() => { void load(); }), [load]);
  // while one is being prepared, look again quietly until it is ready
  const preparing = data?.videos.some(item => item.video.status === 'Processing') ?? false;
  useEffect(() => {
    if (!preparing) return;
    const timer = window.setInterval(() => { void load(); }, 10_000);
    return () => window.clearInterval(timer);
  }, [preparing, load]);

  const sending = queue.items.filter(item => isActive(item.status) || item.status === 'failed');

  function send(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setError('');
    const list = Array.from(files);
    const refused = list.map(file => ({ file, problem: checkVideoFile(file) })).filter(item => item.problem);
    if (refused.length > 0) setError(`${refused[0].file.name}: ${refused[0].problem}`);
    enqueueUploads(list.filter(file => !checkVideoFile(file)).map(file => ({ file, title: titleFromFileName(file.name) })));
  }

  async function agree() {
    setError('');
    try { await acceptCompanyVideoTerms(); await load(); } catch (failure) { setError(getErrorMessage(failure)); }
  }

  async function rename(item: CompanyVideo, title: string) {
    const next = title.trim();
    if (!next || next === item.video.title) return;
    try { await renameCompanyVideo(item.video.id, next); await load(); } catch (failure) { setError(getErrorMessage(failure)); }
  }

  async function remove(item: CompanyVideo) {
    if (!window.confirm(`Excluir "${item.video.title}"? O arquivo é apagado e isso não pode ser desfeito.`)) return;
    setError('');
    try { await deleteCompanyVideo(item.video.id); await load(); } catch (failure) { setError(getErrorMessage(failure)); }
  }

  if (!data && !error) return <LoadingState>Carregando os vídeos...</LoadingState>;
  const used = data ? data.usedBytes / data.quotaBytes : 0;

  return <Page>
    <PageHeader description="Os vídeos da sua empresa, só para ela. Depois de enviados, entram na lista de vídeos dos seus treinamentos." eyebrow="Biblioteca" title="Vídeos da empresa" />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {data && !data.canSend && <EmptyState description="Enviar vídeos da própria empresa faz parte do plano Diamante. Fale com a operação para mudar de plano." title="Disponível no plano Diamante" />}

    {data?.canSend && (data.termsAccepted
      ? <DropZone onFiles={send} />
      : <section className="grid justify-items-start gap-3 rounded-3xl border border-border bg-card p-6">
        <p className="m-0 max-w-prose text-[0.9375rem] leading-relaxed">Os vídeos que você enviar são da sua empresa: ela tem o direito de usá-los e a autorização de imagem de quem aparece neles.</p>
        <Button onClick={() => void agree()}>Concordo, quero enviar</Button>
      </section>)}

    {data && (sending.length > 0 || data.videos.length > 0) && <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sending.map(item => <li key={item.id}><SendingCard item={item} /></li>)}
      {data.videos.map(item => <li key={item.video.id}>
        <VideoCard item={item} onPlay={() => setPlaying(item)} onRemove={() => void remove(item)} onRename={title => void rename(item, title)} />
      </li>)}
    </ul>}

    {data?.canSend && <footer aria-label="Espaço usado" className="mt-2 grid max-w-xs gap-1.5">
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-[width] duration-500', used > 0.9 ? 'bg-destructive' : 'bg-primary/60')} style={{ width: `${Math.min(100, Math.max(used > 0 ? 2 : 0, used * 100))}%` }} />
      </div>
      <p className={cn('m-0 text-xs tabular-nums', used > 0.9 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{formatBytes(data.usedBytes)} de {formatBytes(data.quotaBytes)}</p>
    </footer>}

    {playing && <Dialog description={formatDuration(playing.video.durationMilliseconds)} onClose={() => setPlaying(null)} size="lg" title={playing.video.title}>
      <div className="aspect-video overflow-hidden rounded-xl bg-[#0b1f19] [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
        <VideoPreview preload="metadata" src={playing.video.fileUrl} title={playing.video.title} />
      </div>
    </Dialog>}
  </Page>;
}

/** The one thing on top of the page: drop the files, or pick them. */
function DropZone({ onFiles }: { onFiles: (files: FileList | File[] | null) => void }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    onFiles(event.dataTransfer.files);
  };
  return <label
    className={cn('m-0 grid cursor-pointer justify-items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-colors duration-150 focus-within:border-primary',
      over ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary/60')}
    onDragEnter={event => { event.preventDefault(); depth.current += 1; setOver(true); }}
    onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) setOver(false); }}
    onDragOver={event => event.preventDefault()}
    onDrop={drop}>
    <CloudUpload aria-hidden="true" className={cn('size-8 transition-colors', over ? 'text-primary' : 'text-muted-foreground')} />
    <strong className="text-lg font-semibold tracking-tight">{over ? 'Pode soltar' : 'Arraste seus vídeos aqui'}</strong>
    <span className="text-sm text-muted-foreground">ou <span className="font-semibold text-primary underline-offset-2 hover:underline">escolha do computador</span> · MP4 ou WebM, até 2 GB cada</span>
    <input accept="video/mp4,video/webm,.mp4,.webm" className="sr-only" multiple onChange={event => { onFiles(event.target.files); event.target.value = ''; }} type="file" />
  </label>;
}

const tile = 'relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-[#12332c] text-white';

/** A video on its way: how far it is, or what went wrong with a way to try again. */
function SendingCard({ item }: { item: UploadItem }) {
  const failed = item.status === 'failed';
  const percent = item.totalBytes > 0 ? Math.round((item.sentBytes / item.totalBytes) * 100) : 0;
  return <article className="grid gap-2.5">
    <div className={cn(tile, failed && 'bg-destructive-soft text-destructive')}>
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

/** A video of the company: click to watch, the name is changed in place, the rest is behind "⋯". */
function VideoCard({ item, onPlay, onRename, onRemove }: { item: CompanyVideo; onPlay: () => void; onRename: (title: string) => void; onRemove: () => void }) {
  const { video, trainings } = item;
  const ready = video.status === 'Ready';
  return <article className="grid gap-2.5">
    {ready
      ? <button aria-label={`Assistir ${video.title}`} className={cn(tile, 'group m-0 min-h-0 cursor-pointer border-0 p-0 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0')} onClick={onPlay} type="button">
        <span className="grid size-12 place-items-center rounded-full bg-white/15 transition-colors group-hover:bg-white group-hover:text-[#12332c]"><Play aria-hidden="true" className="size-5 translate-x-px fill-current" /></span>
        <span className="absolute right-2.5 bottom-2.5 rounded-md bg-black/45 px-1.5 py-0.5 text-xs tabular-nums">{formatDuration(video.durationMilliseconds)}</span>
      </button>
      : <div className={cn(tile, video.status === 'Failed' && 'bg-destructive-soft text-destructive')}>
        <p className="m-0 px-4 text-center text-sm font-medium" role="status">{video.status === 'Failed' ? video.processingError ?? 'Não foi possível preparar este vídeo.' : 'Preparando o vídeo…'}</p>
      </div>}
    <div className="flex items-start gap-1 px-1">
      <div className="min-w-0 flex-1">
        <InlineText className="text-[0.9375rem] font-semibold" label={`Nome do vídeo ${video.title}`} onCommit={onRename} value={video.title} />
        <p className="m-0 px-1.5 text-xs text-muted-foreground">{trainings.length === 0 ? 'Ainda em nenhum treinamento' : trainings.length === 1 ? `Em ${trainings[0]}` : `Em ${trainings.length} treinamentos`}</p>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild><Button aria-label={`Mais opções de ${video.title}`} size="icon-sm" variant="ghost"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{trainings.length === 0 ? 'Em nenhum treinamento' : 'Usado em'}</DropdownMenuLabel>
          {trainings.map(title => <DropdownMenuItem disabled key={title}>{title}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onRemove} variant="destructive"><Trash2 /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </article>;
}
