import { ArrowLeft, ArrowRight, Eye, Info, X } from 'lucide-react';
import { useContext, useId, useMemo, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BrandThemeContext } from '@/branding';
import GameStage from '@/games/GameStage';
import GamePlayer from '@/games/LazyGamePlayer';
import DayActivities from '@/learning/day/DayActivities';
import { DayControls, DayDone, DayPlaylist, DayStageHead, DayTop } from '@/learning/day/DayParts';
import { dayStanding } from '@/learning/day/dayLessons';
import UpNextCard from '@/learning/UpNextCard';
import { formatDayDate } from '@/learning/WeekVideos';
import { keepTabInside, useIsolatedLayer } from '@/lib/isolatedLayer';
import { cn } from '@/lib/utils';
import { ExternalVideoLink } from '@sipat/video-player';
import type { Catalog, DaySlots } from '../model';
import { buildPreviewDays, type PreviewDay } from './previewModel';
import PreviewPlayer, { PlayerState } from './PreviewPlayer';
import { usePreviewSession, type PreviewSession } from './previewSession';
// the participant's own look: the preview loads on demand, and with it the styles of the participant's pages
import '@/LearningCatalog.css';

/**
 * "Visão do participante": the training over the whole screen, the way the participant gets it. The day in the
 * middle is the participant's own day page, fed by the board as it is now (saved or not); the bar on top is the
 * preview's: which day, and the way out. Nothing is recorded: what is watched lives in memory and goes with the preview.
 */
export default function TrainingPreview({ name, days, catalog, word, games, onClose }: {
  name: string;
  days: DaySlots[];
  catalog: Catalog;
  /** "Dia" or "Módulo", the way the board names its columns. */
  word: string;
  /** The company's plan has games (Diamante); without them the server delivers none. */
  games: boolean;
  onClose: () => void;
}) {
  const previewDays = useMemo(() => buildPreviewDays(days, catalog, word, { games }), [days, catalog, word, games]);
  const session = usePreviewSession(previewDays);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const theme = useContext(BrandThemeContext);
  useIsolatedLayer(panel, { focus: ['[data-autofocus]'] });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    keepTabInside(event, panel.current);
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // the player closes its own menus and leaves "fill the screen" with Escape: that is not leaving the preview
    if ((event.target as Element).closest('.day-player') || document.documentElement.classList.contains('sipat-player-filling')) return;
    event.stopPropagation();
    if (session.upNext) session.cancelUpNext(); else onClose();
  }

  return createPortal(<div aria-labelledby={titleId} aria-modal="true"
    className="portal-layout-learner fixed inset-0 z-50 flex flex-col bg-[var(--learner-canvas)] text-[var(--learner-forest)] outline-none animate-overlay-in"
    onKeyDown={onKeyDown} ref={panel} role="dialog" style={theme} tabIndex={-1}>
    <PreviewBar days={previewDays} name={name} onClose={onClose} onDay={session.openDay} openDay={session.day?.key ?? null} titleId={titleId} word={word} />
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="px-[clamp(0.75rem,2.5vw,2rem)] py-[clamp(1rem,2.5vw,1.75rem)]">
        {session.day
          // a new day comes in the way the participant's page does
          ? <PreviewDayPage day={session.day} days={previewDays} key={session.day.key} onClose={onClose} session={session} word={word} />
          : <PlayerState icon="▶" text="Monte um dia na grade para ver como ele aparece." title="Nenhum dia ainda" />}
      </div>
    </div>
  </div>, document.body);
}

/** The preview's own bar: what this is, the days to go through, and the way out. */
function PreviewBar({ days, openDay, word, name, titleId, onDay, onClose }: {
  days: PreviewDay[]; openDay: string | null; word: string; name: string; titleId: string;
  onDay: (dayKey: string) => void; onClose: () => void;
}) {
  return <header className="shrink-0 bg-[var(--learner-deep)] text-white shadow-[0_1px_0_rgb(255_255_255/0.08)]">
    <div className="flex items-center gap-x-4 gap-y-2.5 px-5 py-3 max-md:flex-wrap max-md:px-3 max-md:py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-[24rem] md:flex-none">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--learner-progress-accent)] px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--learner-forest)]">
          <Eye aria-hidden="true" className="size-3.5" />Prévia
        </span>
        <div className="grid min-w-0 leading-tight">
          <h2 className="m-0 truncate text-[0.9375rem] font-bold text-white" id={titleId}>Visão do participante</h2>
          <p className="m-0 truncate text-xs text-white/65" title={name}>{name || 'Treinamento sem nome'}</p>
        </div>
      </div>

      <nav aria-label="Dias do treinamento" className="order-last flex min-w-0 basis-full gap-1 overflow-x-auto rounded-full bg-white/[0.08] p-1 [scrollbar-width:none] md:order-none md:flex-1 md:basis-auto [&::-webkit-scrollbar]:hidden">
        {days.map(day => {
          const open = day.key === openDay;
          const empty = day.lessons.length === 0;
          return <button aria-pressed={open} className={cn(
            'inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border-0 px-3.5 text-sm font-semibold transition-colors duration-150',
            'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--learner-progress-accent)]',
            open ? 'bg-white text-[var(--learner-forest)] shadow-sm' : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white',
          )} data-autofocus={open ? true : undefined} key={day.key} onClick={() => onDay(day.key)}
            title={empty ? `${day.title}: ainda sem vídeos` : day.title} type="button">
            {word} {day.position}
            {day.date && <span className={cn('text-xs font-medium tabular-nums', open ? 'text-[var(--learner-text-secondary)]' : 'text-white/55')}>
              {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
            </span>}
            {empty && <span aria-hidden="true" className={cn('size-1.5 rounded-full', open ? 'bg-[var(--learner-text-secondary)]' : 'bg-white/40')} />}
          </button>;
        })}
      </nav>

      <button className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-transparent px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--learner-progress-accent)]"
        onClick={onClose} type="button">
        <X aria-hidden="true" className="size-4" />Fechar
        <kbd className="rounded bg-white/10 px-1.5 font-sans text-[0.6875rem] font-semibold text-white/70 max-md:hidden">Esc</kbd>
      </button>
    </div>
    <p className="m-0 flex items-center justify-center gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-1.5 text-center text-[0.8125rem] text-white/75 max-md:justify-start max-md:text-left max-md:text-xs">
      <Info aria-hidden="true" className="size-3.5 shrink-0 text-[var(--learner-progress-accent)]" />
      A grade como está agora, mesmo antes de salvar. Nada aqui é registrado, e na prévia o vídeo pode ser adiantado.
    </p>
  </header>;
}

/** One day, on the participant's own pieces: the top, the stage with the player, the videos of the day and its games. */
function PreviewDayPage({ day, days, word, session, onClose }: {
  day: PreviewDay; days: PreviewDay[]; word: string; session: PreviewSession; onClose: () => void;
}) {
  const { lessons, current, upNext, activities, game } = session;
  const standing = dayStanding(lessons);
  const index = current ? lessons.findIndex(lesson => lesson.id === current.id) : -1;
  const source = current ? day.sources[current.id] : undefined;
  const nextDay = days[days.indexOf(day) + 1];

  return <main className="learning-page day-page">
    <DayTop
      // the way back of the participant, drawn but not followed: in the preview the days are on the bar above
      back={<span aria-hidden="true" className="day-back pointer-events-none select-none"><ArrowLeft aria-hidden="true" /> Seu treinamento</span>}
      currentId={current?.id ?? null}
      date={formatDayDate(day.date)}
      position={day.position}
      standing={standing}
      subtitle={null}
      title={day.title}
      word={word}
    />

    {standing.isComplete && <DayDone
      action={nextDay
        ? <button className="day-done-action cursor-pointer border-0 [font:inherit]" onClick={() => session.openDay(nextDay.key)} type="button">Ir para o {word} {nextDay.position} <ArrowRight aria-hidden="true" /></button>
        : <button className="day-done-action cursor-pointer border-0 [font:inherit]" onClick={onClose} type="button">Fechar a prévia <ArrowRight aria-hidden="true" /></button>}
      position={day.position}
      word={word}
    />}

    <div className="day-layout">
      <section aria-label="Vídeo" className="day-stage">
        {current && <DayStageHead key={current.id} lesson={current} standing={standing} />}
        <div className="learning-player-frame day-player">
          {current && source
            ? <>
              <PreviewPlayer key={current.id} lesson={current} onEvent={event => session.onPlayerEvent(current, event)} ref={session.player} source={source} />
              {upNext && source.kind === 'house' && <UpNextCard key={upNext.id} onCancel={session.cancelUpNext} onPlay={session.playUpNext} title={upNext.title} />}
            </>
            : <PlayerState icon="▶" text="Escolha os vídeos deste dia na grade para vê-lo aqui." title="Este dia ainda não tem vídeos" />}
        </div>
        {current && <DayControls
          canGoBack={index > 0}
          canGoForward={index >= 0 && index < lessons.length - 1}
          lesson={current}
          onBack={() => { if (index > 0) session.select(lessons[index - 1].id); }}
          onForward={() => { if (index < lessons.length - 1) session.select(lessons[index + 1].id); }}
        />}
        {current?.isBonus && source?.kind === 'external' && <div className="day-outside">
          <ExternalVideoLink externalId={source.externalId} provider={source.provider} />
        </div>}
      </section>

      <aside aria-label="Conteúdo do dia" className="day-rail">
        {lessons.length > 0 && <DayPlaylist currentId={current?.id ?? null} lessons={lessons} onSelect={lesson => session.select(lesson.id)} playing={session.playing} standing={standing} />}
        <DayActivities activities={activities} listOpen={session.listOpen} onCloseList={session.closeList} onOpenList={session.openList} onStart={session.startGame}>
          {game && <GameStage label={game.title} onClose={() => session.closeGame('skipped')}>
            {/* closed before the end counts as skipped, as for the participant */}
            <GamePlayer key={game.id} module={game.module} onClose={outcome => session.closeGame(outcome ?? 'skipped')} />
          </GameStage>}
        </DayActivities>
      </aside>
    </div>
  </main>;
}
