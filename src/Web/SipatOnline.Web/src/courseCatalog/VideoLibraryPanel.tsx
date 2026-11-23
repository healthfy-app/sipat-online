import { LoaderCircle, Trash2 } from 'lucide-react';
import { isExtra, videoProvider, type PlatformLibraryVideo } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { ExternalVideoFrame, ExternalVideoOutside } from '@/ExternalVideoPreview';
import { formatBytes, formatDuration, pluralize } from '@/courseEditor/courseFormat';
import VideoPreview from '@/VideoPreview';

export default function VideoLibraryPanel({
  library,
  hasVideos = false,
  onClearFilters = () => undefined,
  busy,
  onUpload,
  onDelete,
}: {
  library: PlatformLibraryVideo[];
  hasVideos?: boolean;
  onClearFilters?: () => void;
  busy: boolean;
  onUpload: () => void;
  onDelete: (video: PlatformLibraryVideo) => void;
}) {
  return (
    <section aria-label="Vídeos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      {library.length === 0 ? (
        hasVideos
          ? <EmptyState action={<Button onClick={onClearFilters} variant="outline">Limpar filtros</Button>} title="Nenhum vídeo corresponde à busca." />
          : <EmptyState action={<Button onClick={onUpload}>Enviar o primeiro vídeo</Button>} title="A biblioteca ainda não tem vídeos." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {library.map((item) => {
            const { video, courseCount } = item;
            return (
            <article className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-card" key={video.id}>
              <div className="aspect-video bg-[#0b1f19] [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
                {video.status === 'Ready' ? (
                  isExtra(video)
                    ? <ExternalVideoFrame title={`Prévia de ${video.title}`} video={video} />
                    : <VideoPreview preload="metadata" src={video.fileUrl} title={`Prévia de ${video.title}`} />
                ) : video.status === 'Processing' ? (
                  <div className="grid size-full place-content-center justify-items-center gap-2 p-4 text-center text-white/80">
                    <LoaderCircle aria-hidden="true" className="size-6 animate-spin motion-reduce:animate-none" />
                    <p className="m-0 text-[0.875rem] font-semibold text-white">Preparando o vídeo</p>
                    <p className="m-0 max-w-[30ch] text-[0.8125rem] leading-snug">Leva alguns minutos. Você pode sair desta tela.</p>
                  </div>
                ) : (
                  <p className="m-0 grid size-full place-items-center p-4 text-center text-[0.8125rem] leading-snug text-white/80">
                    {video.processingError ?? 'Não foi possível preparar este vídeo. Envie o arquivo de novo.'}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5 px-4 pb-4 pt-3.5">
                <h3 className="m-0 line-clamp-2 text-[0.9375rem] font-semibold leading-[1.35]" title={video.title}>{video.title}{isExtra(video) && <> <ExtraBadge className="align-middle" /></>}</h3>
                <p className="m-0 text-[0.8125rem] tabular-nums text-muted-foreground">
                  {isExtra(video)
                    ? `${videoProvider(video)}${video.durationMilliseconds > 0 ? ` · ${formatDuration(video.durationMilliseconds)}` : ''}`
                    : video.status === 'Ready'
                      ? `${formatDuration(video.durationMilliseconds)} · ${formatBytes(video.sizeBytes)}`
                      : formatBytes(video.sizeBytes)}
                </p>
                {isExtra(video) && <ExternalVideoOutside video={video} />}
                <div className="mt-1 flex items-center justify-between gap-2">
                  {video.status === 'Processing' ? <Badge variant="warning">Processando</Badge>
                    : video.status === 'Failed' ? <Badge variant="destructive">Falhou</Badge>
                    : (
                      <Badge variant={courseCount === 0 ? 'warning' : 'default'}>
                        {courseCount === 0 ? 'Ainda não usado em assuntos' : `Usado em ${pluralize(courseCount, 'assunto', 'assuntos')}`}
                      </Badge>
                    )}
                  <Button aria-label={`Excluir vídeo ${video.title}`} disabled={busy} onClick={() => onDelete(item)} size="icon-sm" title="Excluir vídeo" variant="ghost"><Trash2 /></Button>
                </div>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
