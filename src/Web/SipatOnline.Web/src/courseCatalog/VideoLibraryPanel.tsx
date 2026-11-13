import { Trash2 } from 'lucide-react';
import type { PlatformLibraryVideo } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { formatBytes, formatDuration, pluralize } from '@/courseEditor/courseFormat';
import VideoPreview from '@/VideoPreview';

export default function VideoLibraryPanel({
  library,
  busy,
  onUpload,
  onDelete,
}: {
  library: PlatformLibraryVideo[];
  busy: boolean;
  onUpload: () => void;
  onDelete: (video: PlatformLibraryVideo) => void;
}) {
  return (
    <section aria-label="Vídeos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 text-sm text-muted-foreground">Vídeos reutilizáveis em qualquer tema do acervo.</p>
        <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{pluralize(library.length, 'vídeo', 'vídeos')}</span>
      </div>

      {library.length === 0 ? (
        <EmptyState action={<Button onClick={onUpload}>Enviar o primeiro vídeo</Button>} title="A biblioteca ainda não tem vídeos." />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {library.map((item) => {
            const { video, courseCount } = item;
            return (
            <article className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-card" key={video.id}>
              <div className="aspect-video bg-[#0b1f19] [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
                <VideoPreview preload="metadata" src={video.fileUrl} title={`Prévia de ${video.title}`} />
              </div>
              <div className="grid gap-1.5 px-4 pb-4 pt-3.5">
                <h3 className="m-0 line-clamp-2 text-[0.9375rem] font-semibold leading-[1.35]" title={video.title}>{video.title}</h3>
                <p className="m-0 text-[0.8125rem] tabular-nums text-muted-foreground">
                  {formatDuration(video.durationMilliseconds)} · {formatBytes(video.sizeBytes)}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <Badge variant={courseCount === 0 ? 'warning' : 'default'}>
                    {courseCount === 0 ? 'Ainda não usado em temas' : `Usado em ${pluralize(courseCount, 'tema', 'temas')}`}
                  </Badge>
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
