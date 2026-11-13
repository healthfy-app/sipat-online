import { ArrowLeft, ArrowRight, Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import GamePlayer from '@/GamePlayer';
import { cn } from '@/lib/utils';
import VideoPreview from '@/VideoPreview';
import type { TrackItem } from './courseTrack';

export type PreviewSize = 'phone' | 'desktop';

export default function CoursePreviewCanvas({
  track,
  selectedIndex,
  size,
  onSize,
  onSelectIndex,
}: {
  track: TrackItem[];
  selectedIndex: number;
  size: PreviewSize;
  onSize: (size: PreviewSize) => void;
  onSelectIndex: (index: number) => void;
}) {
  const [replay, setReplay] = useState(0);
  const item = track[selectedIndex];
  const progress = track.length === 0 ? 0 : ((selectedIndex + 1) / track.length) * 100;
  const desktop = size === 'desktop';

  return (
    <section
      aria-label="Prévia do curso"
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col items-center justify-[safe_center] gap-5 overflow-y-auto px-6 pb-6 pt-14',
        'max-[1180px]:min-h-auto max-[1180px]:overflow-visible max-[860px]:order-first max-[860px]:px-4 max-[860px]:pb-4',
      )}
    >
      <div aria-label="Tamanho da prévia" className="absolute right-4 top-3 flex gap-1.5" role="group">
        <Button aria-label="Celular" aria-pressed={!desktop} onClick={() => onSize('phone')} size="icon-sm" title="Celular" variant={desktop ? 'outline' : 'default'}>
          <Smartphone />
        </Button>
        <Button aria-label="Desktop" aria-pressed={desktop} onClick={() => onSize('desktop')} size="icon-sm" title="Desktop" variant={desktop ? 'default' : 'outline'}>
          <Monitor />
        </Button>
      </div>

      <div
        className={cn(
          'flex flex-col overflow-hidden bg-[var(--learner-forest,#12332c)] text-white shadow-[0_24px_48px_-24px_rgb(14_42_34/0.45)]',
          'transition-[width,border-radius,min-height] duration-300 ease-out-soft',
          desktop
            ? 'min-h-[min(30rem,calc(100dvh-12rem))] w-[min(100%,52rem)] rounded-lg'
            : 'min-h-[min(40rem,calc(100dvh-12rem))] w-[min(100%,24rem)] rounded-[1.5rem] max-[860px]:min-h-[30rem]',
        )}
      >
        <div aria-hidden="true" className="h-[5px] bg-white/15">
          <span className="block h-full rounded-r-full bg-signal transition-[width] duration-300 ease-out-soft" style={{ width: `${progress}%` }} />
        </div>
        <header className="flex items-center justify-between gap-4 border-b border-white/12 px-4.5 py-3.5">
          <span className="text-sm font-bold tracking-tight">SIPAT Online</span>
          {item && <span className="rounded-sm bg-black/30 px-2 py-1 text-[0.8125rem] font-bold tabular-nums">{selectedIndex + 1} / {track.length}</span>}
        </header>
        <div className={cn('flex flex-1 flex-col justify-center gap-4 p-5 text-center', item?.kind === 'activity' && 'justify-start p-3 text-left')}>
          {!item && <p className="m-0 text-white/75">Adicione um vídeo para visualizar o conteúdo.</p>}
          {item?.kind === 'video' && <>
            <h2 className="m-0 text-[1.375rem] font-medium leading-snug text-white [text-wrap:balance]">{item.video.title}</h2>
            <div className="[&_video]:max-h-96 [&_video]:w-full [&_video]:rounded-md [&_video]:bg-black [&_.video-preview-error]:text-white">
              <VideoPreview key={item.video.id} src={item.video.fileUrl} title={`Prévia de ${item.video.title}`} />
            </div>
          </>}
          {item?.kind === 'activity' && (
            <div className="flex-1 overflow-auto text-foreground">
              <GamePlayer key={`${item.key}-${replay}`} module={item.module} onClose={() => setReplay((value) => value + 1)} />
            </div>
          )}
        </div>
      </div>

      <nav aria-label="Navegar na prévia" className="flex gap-4">
        <Button aria-label="Item anterior" className="rounded-full" disabled={selectedIndex <= 0} onClick={() => onSelectIndex(selectedIndex - 1)}
          size="icon-sm" variant="outline">
          <ArrowLeft />
        </Button>
        <Button aria-label="Próximo item" className="rounded-full" disabled={selectedIndex >= track.length - 1} onClick={() => onSelectIndex(selectedIndex + 1)}
          size="icon-sm" variant="outline">
          <ArrowRight />
        </Button>
      </nav>
    </section>
  );
}
