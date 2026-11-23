import { LoaderCircle, Lock, Tags, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isExtra, videoProvider, type PlatformLibraryVideo } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import ExtraBadge from '@/courseEditor/ExtraBadge';
import { ExternalVideoFrame, ExternalVideoOutside } from '@/ExternalVideoPreview';
import { formatBytes, formatDuration, pluralize } from '@/courseEditor/courseFormat';
import VideoPreview from '@/VideoPreview';

export interface SubjectOption { id: string; title: string }

/** The assuntos of a video as chips; the list opens to check or uncheck from the fixed list. */
function SubjectPicker({ title, subjects, selected, onChange }: {
  title: string; subjects: SubjectOption[]; selected: string[]; onChange: (subjectIds: string[]) => void;
}) {
  const names = subjects.filter(item => selected.includes(item.id)).map(item => item.title);
  return <details className="group/subjects rounded-md border border-border">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[0.8125rem]" aria-label={`Assuntos de ${title}`}>
      <Tags aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn('min-w-0 flex-1 truncate', names.length === 0 && 'text-warning font-semibold')}>{names.length === 0 ? 'Sem assunto' : names.join(' · ')}</span>
      <span className="text-xs font-semibold text-primary group-open/subjects:hidden">Editar</span>
    </summary>
    <div className="grid max-h-56 gap-1 overflow-y-auto border-t border-border px-2.5 py-2">
      {subjects.map(item => <label className="m-0 flex cursor-pointer items-start gap-2 text-[0.8125rem] leading-snug" key={item.id}>
        <input checked={selected.includes(item.id)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-primary)]" type="checkbox"
          onChange={event => onChange(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />
        {item.title}
      </label>)}
    </div>
  </details>;
}

export default function VideoLibraryPanel({
  library,
  hasVideos = false,
  onClearFilters = () => undefined,
  busy,
  onUpload,
  onDelete,
  subjects = [],
  videoSubjects,
  onSubjects,
  selected,
  onSelect,
  privateTo,
}: {
  library: PlatformLibraryVideo[];
  hasVideos?: boolean;
  onClearFilters?: () => void;
  busy: boolean;
  onUpload: () => void;
  onDelete: (video: PlatformLibraryVideo) => void;
  subjects?: SubjectOption[];
  videoSubjects?: Map<string, string[]>;
  onSubjects?: (videoId: string, subjectIds: string[]) => void;
  /** Checked videos, for associating many at once; without it there are no checkboxes. */
  selected?: Set<string>;
  onSelect?: (videoId: string, checked: boolean) => void;
  /** The names of the companies each private video belongs to. */
  privateTo?: Map<string, string[]>;
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
            <article className={cn('relative flex min-w-0 flex-col overflow-hidden rounded-lg bg-card shadow-card', selected?.has(video.id) && 'ring-2 ring-primary')} key={video.id}>
              {selected && onSelect && <label className="absolute left-2 top-2 z-10 m-0 grid size-9 cursor-pointer place-items-center rounded-md bg-card/90 shadow-card">
                <input aria-label={`Selecionar ${video.title}`} checked={selected.has(video.id)} className="size-5 accent-[var(--brand-primary)]"
                  onChange={event => onSelect(video.id, event.target.checked)} type="checkbox" />
              </label>}
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
                {(privateTo?.get(video.id)?.length ?? 0) > 0 && <p className="m-0 flex items-center gap-1.5 text-[0.8125rem] font-semibold text-warning">
                  <Lock aria-hidden="true" className="size-3.5 shrink-0" /><span className="min-w-0 truncate">Privado: {privateTo!.get(video.id)!.join(', ')}</span>
                </p>}
                {videoSubjects && onSubjects && <SubjectPicker onChange={ids => onSubjects(video.id, ids)} selected={videoSubjects.get(video.id) ?? []} subjects={subjects} title={video.title} />}
                <div className="mt-1 flex items-center justify-between gap-2">
                  {video.status === 'Processing' ? <Badge variant="warning">Processando</Badge>
                    : video.status === 'Failed' ? <Badge variant="destructive">Falhou</Badge>
                    : (
                      <Badge variant={courseCount === 0 ? 'warning' : 'default'}>
                        {courseCount === 0 ? 'Ainda não usado em treinamentos' : `Usado em ${pluralize(courseCount, 'treinamento', 'treinamentos')}`}
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
