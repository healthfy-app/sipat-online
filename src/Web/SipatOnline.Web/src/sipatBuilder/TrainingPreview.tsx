import { ArrowLeft, ArrowRight, Gamepad2, Play } from 'lucide-react';
import { useState } from 'react';
import { isExternal } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ExternalVideoFrame } from '@/ExternalVideoPreview';
import { formatDayDate } from '@/learning/WeekVideos';
import { cn } from '@/lib/utils';
import VideoPreview from '@/VideoPreview';
import { formatClock, type Catalog, type DaySlots } from './model';

/**
 * The training the way the participant gets it: the days, the videos of each one in order, and the player.
 * It plays what is on the board right now (saved or not) and records nothing: no progress, no presence.
 */
export default function TrainingPreview({ catalog, days, dayWord, name, onClose }: {
  catalog: Catalog; days: DaySlots[];
  /** "Dia" or "Módulo", the way the board names its columns. */
  dayWord: string;
  name: string; onClose: () => void;
}) {
  const [dayIndex, setDayIndex] = useState(() => Math.max(0, days.findIndex(day => day.videos.some(Boolean))));
  const [videoIndex, setVideoIndex] = useState(0);
  const day = days[dayIndex];
  const videos = (day?.videos ?? []).flatMap(id => { const video = id ? catalog.videos.get(id) : undefined; return video ? [video] : []; });
  const games = (day?.games ?? []).flatMap(id => { const game = id ? catalog.games.get(id) : undefined; return game ? [game] : []; });
  const playing = videos[Math.min(videoIndex, videos.length - 1)];
  const position = playing ? videos.indexOf(playing) : 0;
  const openDay = (index: number) => { setDayIndex(index); setVideoIndex(0); };
  // after the last video of a day comes the first of the next day that has videos
  const nextDay = days.findIndex((item, index) => index > dayIndex && item.videos.some(Boolean));
  const goNext = () => { if (position < videos.length - 1) setVideoIndex(position + 1); else if (nextDay >= 0) openDay(nextDay); };
  const goBack = () => { if (position > 0) setVideoIndex(position - 1); };
  const dayName = (item: DaySlots, index: number) => item.title.trim() || `${dayWord} ${index + 1}`;

  return <Dialog className="w-[min(72rem,calc(100vw-2rem))]" description="É assim que o treinamento aparece para quem vai fazer. Aqui nada é registrado: você pode assistir e pular à vontade."
    onClose={onClose} title={`${name || 'Treinamento'}: visão do participante`}>
    <div className="grid min-h-0 gap-4 overflow-y-auto rounded-xl bg-[var(--learner-forest,#12332c)] p-4 text-white max-[760px]:p-3">
      <ul aria-label="Dias do treinamento" className="m-0 flex list-none gap-2 overflow-x-auto p-0 pb-1">
        {days.map((item, index) => <li className="shrink-0" key={item.key}>
          <button aria-pressed={index === dayIndex} className={cn(
            'grid min-h-11 cursor-pointer gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
            index === dayIndex ? 'border-transparent bg-white text-[#12332c]' : 'border-white/20 bg-white/5 text-white hover:bg-white/12',
          )} onClick={() => openDay(index)} type="button">
            <strong className="font-semibold">{dayWord} {index + 1}</strong>
            {formatDayDate(item.date) && <span className="text-xs opacity-75">{formatDayDate(item.date)}</span>}
          </button>
        </li>)}
      </ul>

      {day && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Vídeo" className="grid content-start gap-3">
          <div className="aspect-video overflow-hidden rounded-xl bg-black [&_.video-preview]:size-full [&_video]:size-full [&_video]:object-contain">
            {!playing
              ? <p className="m-0 grid size-full place-items-center px-6 text-center text-sm text-white/75">Este dia ainda não tem vídeos.</p>
              : playing.source && isExternal(playing.source)
                ? <ExternalVideoFrame key={playing.id} title={playing.title} video={playing.source} />
                : playing.source
                  ? <VideoPreview key={playing.id} preload="metadata" src={playing.source.fileUrl} title={playing.title} />
                  : <p className="m-0 grid size-full place-items-center px-6 text-center text-sm text-white/75">Este vídeo ainda está sendo preparado.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--signal-on-green,#ffe28a)]">{dayName(day, dayIndex)}</span>
              <h3 className="m-0 text-lg font-semibold leading-snug text-white">{playing?.title ?? 'Sem vídeos'}</h3>
            </div>
            <div className="flex gap-2">
              <Button className="border-white/25 bg-transparent text-white hover:bg-white/12 hover:text-white" disabled={position === 0} onClick={goBack} size="sm" variant="outline"><ArrowLeft /> Anterior</Button>
              <Button className="bg-white text-[#12332c] hover:bg-white/90" disabled={position >= videos.length - 1 && nextDay < 0} onClick={goNext} size="sm">
                {position >= videos.length - 1 && nextDay >= 0 ? 'Próximo dia' : 'Próximo'} <ArrowRight />
              </Button>
            </div>
          </div>
        </section>

        <section aria-label={`Vídeos de ${dayName(day, dayIndex)}`} className="grid content-start gap-2">
          <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.06em] text-white/70">Neste dia</h3>
          <ol className="m-0 grid max-h-[26rem] list-none gap-1.5 overflow-y-auto p-0">
            {videos.map((video, index) => <li key={video.id}>
              <button aria-current={index === position ? 'true' : undefined} className={cn(
                'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 px-3 py-2 text-left text-sm transition-colors',
                index === position ? 'bg-white/18 text-white' : 'bg-white/5 text-white/85 hover:bg-white/12',
              )} onClick={() => setVideoIndex(index)} type="button">
                <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold', index === position ? 'bg-white text-[#12332c]' : 'bg-white/15')}>
                  {index === position ? <Play className="size-3" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">{video.title}</span>
                {video.durationMs > 0 && <span className="shrink-0 text-xs tabular-nums text-white/65">{formatClock(video.durationMs)}</span>}
              </button>
            </li>)}
            {games.map(game => <li className="flex min-h-11 items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/85" key={game.id}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/15"><Gamepad2 className="size-3.5" /></span>
              <span className="min-w-0 flex-1">{game.title}</span>
              <span className="shrink-0 text-xs text-white/65">Jogo</span>
            </li>)}
          </ol>
        </section>
      </div>}
    </div>
  </Dialog>;
}
