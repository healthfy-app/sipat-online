import { useId, useState } from 'react';
import { AlertCircle, Check, ChevronDown, CloudUpload, History, Pause, Play, RotateCw, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';
import {
  cancelAllUploads,
  cancelUpload,
  checkVideoFile,
  clearFinishedUploads,
  discardAllInterrupted,
  enqueueUploads,
  isActive,
  isMoving,
  pauseAllUploads,
  pauseUpload,
  resumeAllUploads,
  resumeUpload,
  retryFailedUploads,
  retryUpload,
  useUploadQueue,
  type UploadItem,
  type UploadStatus,
} from './uploadQueue';

const order: Record<UploadStatus, number> = {
  uploading: 0, finishing: 0, preparing: 0, retrying: 1, offline: 1, paused: 2, waiting: 3, failed: 4, canceled: 5, done: 6,
};

export function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return 'menos de 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `cerca de ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `cerca de ${hours} h ${rest} min` : `cerca de ${hours} h`;
}

function percent(item: UploadItem) {
  if (item.status === 'done') return 100;
  return item.totalBytes > 0 ? Math.min(100, Math.floor((item.sentBytes / item.totalBytes) * 100)) : 0;
}

function statusText(item: UploadItem): string {
  const progress = `${percent(item)}% de ${formatBytes(item.totalBytes)}`;
  switch (item.status) {
    case 'waiting': return item.resumed ? 'Na fila · continua de onde parou' : `Na fila · ${formatBytes(item.totalBytes)}`;
    case 'preparing': return item.resumed ? 'Conferindo o que já foi enviado…' : 'Preparando…';
    case 'uploading': return item.speed > 0 ? `${progress} · ${formatBytes(item.speed)}/s` : progress;
    case 'finishing': return 'Finalizando…';
    case 'retrying': return item.error ?? 'Tentando de novo…';
    case 'offline': return 'Sem internet · continua quando voltar';
    case 'paused': return `Pausado · ${progress}`;
    case 'done': return 'Enviado · a conversão termina no servidor';
    case 'canceled': return 'Cancelado';
    case 'failed': return item.error ?? 'Não foi possível enviar.';
  }
}

/**
 * The floating card with the progress of the library uploads, on every page of the portal, so the
 * operator keeps working while the videos go up. On a phone it spans the width and starts collapsed.
 */
export default function VideoUploadTray() {
  const { items, interrupted, online } = useUploadQueue();
  const [isOpen, setIsOpen] = useState(() => typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    || !window.matchMedia('(max-width: 640px)').matches);
  const resumeInputId = useId();
  if (items.length === 0 && interrupted.length === 0) return null;

  const counted = items.filter((item) => item.status !== 'canceled');
  const done = items.filter((item) => item.status === 'done').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  const active = items.filter((item) => isActive(item.status)).length;
  const moving = items.filter((item) => isMoving(item.status)).length;
  const paused = items.filter((item) => item.status === 'paused').length;
  const totalBytes = counted.reduce((sum, item) => sum + item.totalBytes, 0);
  const sentBytes = counted.reduce((sum, item) => sum + (item.status === 'done' ? item.totalBytes : item.sentBytes), 0);
  const speed = items.reduce((sum, item) => sum + (item.status === 'uploading' ? item.speed : 0), 0);
  const remainingBytes = items.filter((item) => isActive(item.status)).reduce((sum, item) => sum + item.totalBytes - item.sentBytes, 0);
  const overall = totalBytes > 0 ? Math.min(100, (sentBytes / totalBytes) * 100) : 0;
  const remaining = speed > 0 && moving > 0 ? formatRemaining(remainingBytes / speed) : '';
  const sorted = [...items].sort((a, b) => order[a.status] - order[b.status]);
  const allPaused = active > 0 && paused === active;

  const title = active > 0
    ? !online ? 'Sem internet'
      : allPaused ? 'Envio pausado'
        : `Enviando ${Math.min(done + 1, counted.length)} de ${counted.length} ${counted.length === 1 ? 'vídeo' : 'vídeos'}`
    : items.length === 0 ? 'Envio interrompido'
      : failed > 0 ? `${failed} ${failed === 1 ? 'vídeo não foi enviado' : 'vídeos não foram enviados'}`
        : `${done} ${done === 1 ? 'vídeo enviado' : 'vídeos enviados'}`;
  const detail = active > 0
    ? !online ? 'O envio continua sozinho quando a conexão voltar.'
      : [`${Math.floor(overall)}%`, `${formatBytes(sentBytes)} de ${formatBytes(totalBytes)}`, speed > 0 ? `${formatBytes(speed)}/s` : '', remaining]
        .filter(Boolean).join(' · ')
    : items.length === 0 ? 'Escolha os arquivos de novo para continuar.'
      : failed > 0 ? `${done} enviados. Os outros podem ser tentados de novo.`
        : 'Ficam prontos na biblioteca quando a conversão terminar.';
  const tone = !online && active > 0 ? 'warning' : failed > 0 && active === 0 ? 'error' : 'ok';

  function pickToResume(files: FileList | null) {
    if (!files) return;
    enqueueUploads(Array.from(files).filter((file) => !checkVideoFile(file)).map((file) => ({ file, title: '' })));
  }

  return (
    <section
      aria-label="Envio de vídeos"
      className={cn(
        'fixed right-4 bottom-4 z-50 grid w-[24rem] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-overlay animate-dialog-in',
        'max-[640px]:inset-x-2 max-[640px]:bottom-[max(0.5rem,env(safe-area-inset-bottom))] max-[640px]:w-auto',
      )}
    >
      <header className="flex items-center gap-3 py-3 pr-2 pl-4">
        <span className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          tone === 'warning' ? 'bg-warning-soft text-warning' : tone === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-accent text-primary',
        )}>
          {tone === 'warning' ? <WifiOff aria-hidden="true" className="size-[1.125rem]" />
            : tone === 'error' ? <AlertCircle aria-hidden="true" className="size-[1.125rem]" />
              : items.length === 0 ? <History aria-hidden="true" className="size-[1.125rem]" />
                : active > 0 ? <CloudUpload aria-hidden="true" className={cn('size-[1.125rem]', moving > 0 && 'animate-pulse')} />
                  : <Check aria-hidden="true" className="size-[1.125rem]" />}
        </span>
        <button
          aria-expanded={isOpen}
          className="grid min-w-0 flex-1 cursor-pointer gap-0.5 border-0 bg-transparent p-0 text-left text-foreground"
          onClick={() => setIsOpen((open) => !open)}
          type="button"
        >
          <strong aria-live="polite" className="truncate text-sm leading-tight">{title}</strong>
          <span className="truncate text-xs text-muted-foreground tabular-nums">{detail}</span>
        </button>
        {active > 0 && (
          <Button aria-label={allPaused ? 'Continuar todos os envios' : 'Pausar todos os envios'} className="max-[640px]:size-10"
            onClick={allPaused ? resumeAllUploads : pauseAllUploads} size="icon-sm" variant="ghost">
            {allPaused ? <Play /> : <Pause />}
          </Button>
        )}
        <Button aria-expanded={isOpen} aria-label={isOpen ? 'Recolher lista de envios' : 'Mostrar lista de envios'}
          className="max-[640px]:size-10" onClick={() => setIsOpen((open) => !open)} size="icon-sm" variant="ghost">
          <ChevronDown className={cn('transition-transform duration-200', !isOpen && 'rotate-180')} />
        </Button>
        {active === 0 && items.length > 0 && (
          <Button aria-label="Fechar painel de envios" className="max-[640px]:size-10" onClick={clearFinishedUploads} size="icon-sm" variant="ghost">
            <X />
          </Button>
        )}
      </header>

      {items.length > 0 && (
        <div aria-hidden="true" className="h-1 bg-border/60">
          <div className={cn(
            'h-full transition-[width] duration-500 ease-out',
            tone === 'warning' || allPaused ? 'bg-signal' : tone === 'error' ? 'bg-destructive' : 'bg-primary',
          )} style={{ width: `${overall}%` }} />
        </div>
      )}

      {isOpen && (
        <>
          {interrupted.length > 0 && (
            <div className="grid gap-2 border-b border-border bg-warning-soft/60 px-4 py-3">
              <p className="m-0 text-[0.8125rem] leading-snug">
                <strong>{interrupted.length === 1 ? '1 envio ficou pela metade' : `${interrupted.length} envios ficaram pela metade`}</strong>
                {' '}da última vez. Escolha os mesmos arquivos para continuar de onde parou.
              </p>
              <ul className="m-0 grid max-h-24 list-none gap-0.5 overflow-y-auto p-0 text-xs text-muted-foreground">
                {interrupted.map((entry) => (
                  <li className="truncate" key={entry.key} title={entry.fileName}>{entry.fileName} · {formatBytes(entry.sizeBytes)}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-[0.8125rem] font-semibold text-primary-foreground hover:bg-primary/90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring max-[640px]:h-10"
                  htmlFor={resumeInputId}>
                  <RotateCw className="size-4" aria-hidden="true" /> Escolher arquivos
                  <input accept="video/mp4,video/webm,.mp4,.webm" className="sr-only" id={resumeInputId} multiple
                    onChange={(event) => { pickToResume(event.target.files); event.target.value = ''; }} type="file" />
                </label>
                <Button className="max-[640px]:h-10" onClick={discardAllInterrupted} size="sm" variant="ghost">Descartar</Button>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <ul aria-label="Vídeos do envio" className="m-0 grid max-h-[min(20rem,50vh)] list-none overflow-y-auto overscroll-contain p-0 max-[640px]:max-h-[45vh]">
              {sorted.map((item) => (
                <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 border-b border-border/70 py-2.5 pr-2 pl-4 last:border-b-0" key={item.id}>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[0.8125rem] font-medium" title={item.file.name}>{item.title}</span>
                    <span className={cn(
                      'truncate text-xs tabular-nums',
                      item.status === 'failed' ? 'font-medium text-destructive'
                        : item.status === 'done' ? 'text-primary'
                          : item.status === 'retrying' || item.status === 'offline' ? 'text-warning'
                            : 'text-muted-foreground',
                    )} title={statusText(item)}>
                      {statusText(item)}
                    </span>
                  </div>
                  <ItemActions item={item} />
                  {isActive(item.status) && item.status !== 'waiting' && (
                    <div aria-hidden="true" className="col-span-2 mr-2 h-1 overflow-hidden rounded-full bg-border/60">
                      <div className={cn(
                        'h-full rounded-full transition-[width] duration-300 ease-out',
                        item.status === 'paused' || item.status === 'retrying' || item.status === 'offline' ? 'bg-signal' : 'bg-primary',
                        (item.status === 'finishing' || item.status === 'preparing') && 'animate-pulse',
                      )} style={{ width: `${item.status === 'preparing' ? Math.max(percent(item), 3) : percent(item)}%` }} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/60 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">
                {active > 0 ? 'Pode usar o sistema. Só não feche esta aba.' : `${done} de ${counted.length} enviados`}
              </span>
              <div className="flex gap-1.5">
                {failed > 0 && (
                  <Button className="max-[640px]:h-10" onClick={retryFailedUploads} size="sm" variant="outline"><RotateCw /> Tentar de novo</Button>
                )}
                {active > 0 && (
                  <Button className="max-[640px]:h-10" onClick={() => {
                    if (window.confirm(`Cancelar ${active === 1 ? 'o envio que falta' : `os ${active} envios que faltam`}? O que já foi enviado deles é descartado.`)) cancelAllUploads();
                  }} size="sm" variant="ghost">Cancelar todos</Button>
                )}
              </div>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

function ItemActions({ item }: { item: UploadItem }) {
  const touch = 'max-[640px]:size-10';
  if (item.status === 'done') {
    return <Check aria-label="Enviado" className="mr-2 size-4 text-primary" role="img" />;
  }
  if (isActive(item.status)) {
    return (
      <div className="flex">
        {item.status === 'paused' ? (
          <Button aria-label={`Continuar envio de ${item.title}`} className={touch} onClick={() => resumeUpload(item.id)} size="icon-sm" variant="ghost">
            <Play />
          </Button>
        ) : item.status !== 'waiting' && item.status !== 'finishing' && (
          <Button aria-label={`Pausar envio de ${item.title}`} className={touch} onClick={() => pauseUpload(item.id)} size="icon-sm" variant="ghost">
            <Pause />
          </Button>
        )}
        {item.status !== 'finishing' && (
          <Button aria-label={`Cancelar envio de ${item.title}`} className={touch} onClick={() => cancelUpload(item.id)} size="icon-sm" variant="ghost">
            <X />
          </Button>
        )}
      </div>
    );
  }
  return checkVideoFile(item.file) === null ? (
    <Button aria-label={`Tentar de novo ${item.title}`} className={touch} onClick={() => retryUpload(item.id)} size="icon-sm" variant="ghost">
      <RotateCw />
    </Button>
  ) : <span />;
}
