import { useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Flame, Play, RotateCcw, Star, Timer, Trophy } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatSeconds, prefersReducedMotion, type GameResult } from './gameKit';
import { gameLooks } from './gameTypes';
import './games.css';

export interface HudProgress { done: number; total: number; label: string }

const singular: Record<string, string> = { perguntas: 'pergunta', 'situações': 'situação', riscos: 'risco', pares: 'par' };

/** Frame shared by every game: branded header, opening screen, live scoreboard and result. */
export function GameFrame({ module, titleId, onSkip, showSkip, children }: {
  module: GameModule; titleId: string; onSkip: () => void; showSkip: boolean; children: ReactNode;
}) {
  const look = gameLooks[module.gameType];
  const Icon = look.icon;
  return <section aria-labelledby={titleId} className="game-frame @container flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card font-sans text-foreground shadow-overlay">
    <header className="game-frame-header relative flex items-center gap-3 overflow-hidden px-4 py-3.5 text-white @lg:px-5">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12 ring-1 ring-white/20">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[0.6875rem] font-semibold tracking-[0.08em] text-signal uppercase">{look.label}</p>
        <h3 className="m-0 truncate text-base leading-tight font-semibold text-white @lg:text-lg" id={titleId}>{module.title}</h3>
      </div>
      {showSkip && <Button className="text-white/80 hover:bg-white/12 hover:text-white" onClick={onSkip} size="sm" variant="ghost">Pular</Button>}
    </header>
    {children}
  </section>;
}

export function GameIntro({ module, onStart }: { module: GameModule; onStart: () => void }) {
  const look = gameLooks[module.gameType];
  const Icon = look.icon;
  return <div className="game-intro grid justify-items-center gap-5 px-5 py-8 text-center @lg:px-10">
    <span aria-hidden="true" className="game-intro-badge grid size-20 place-items-center rounded-3xl text-white">
      <Icon className="size-9" strokeWidth={1.75} />
    </span>
    <div className="grid gap-1">
      <p className="m-0 text-sm text-muted-foreground">Atividade opcional · não bloqueia seu progresso</p>
      <p className="m-0 text-2xl font-semibold tracking-tight">{look.label}</p>
    </div>
    <ol className="m-0 grid w-full max-w-md list-none gap-2 p-0 text-left">
      {look.howTo.map((step, index) => <li className="flex items-start gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm" key={step}>
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">{index + 1}</span>
        <span className="pt-0.5">{step}</span>
      </li>)}
    </ol>
    <Button autoFocus className="min-w-44" onClick={onStart} size="lg"><Play className="size-4" />Começar</Button>
  </div>;
}

/** 3, 2, 1, Vai! — skipped entirely when the user prefers less motion. */
export function GameCountdown({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(3);
  useEffect(() => {
    if (step < 0) { onDone(); return; }
    const timer = window.setTimeout(() => setStep(step - 1), step === 0 ? 450 : 620);
    return () => window.clearTimeout(timer);
  }, [step, onDone]);
  return <div aria-live="assertive" className="grid min-h-72 place-items-center" role="status">
    <AnimatePresence mode="popLayout">
      {step >= 0 && <motion.span animate={{ opacity: 1, scale: 1 }} className="game-countdown text-7xl font-bold tracking-tight text-primary"
        exit={{ opacity: 0, scale: 1.6 }} initial={{ opacity: 0, scale: 0.4 }} key={step} transition={{ type: 'spring', stiffness: 420, damping: 22 }}>
        {step === 0 ? 'Vai!' : step}
      </motion.span>}
    </AnimatePresence>
  </div>;
}

export function GameHud({ score, streak, lastGain, gainId, seconds, progress }: {
  score: number; streak: number; lastGain: number; gainId: number; seconds: number; progress: HudProgress | null;
}) {
  const percent = progress && progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  return <div className="border-b border-border bg-card">
    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 @lg:px-5">
      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground tabular-nums">
        <Trophy aria-hidden="true" className="size-4" />
        <span aria-label={`${score} pontos`}>{score}</span>
        <AnimatePresence>
          {lastGain > 0 && <motion.span animate={{ opacity: 0, y: -26 }} aria-hidden="true"
            className="pointer-events-none absolute -top-1 right-1 text-sm font-bold text-primary" initial={{ opacity: 1, y: 0 }}
            key={gainId} transition={{ duration: 0.9, ease: 'easeOut' }}>+{lastGain}</motion.span>}
        </AnimatePresence>
      </span>
      <AnimatePresence>
        {streak >= 2 && <motion.span animate={{ opacity: 1, scale: 1 }} className="game-combo inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold"
          exit={{ opacity: 0, scale: 0.6 }} initial={{ opacity: 0, scale: 0.6 }} key={Math.min(streak, 3)}>
          <Flame aria-hidden="true" className="size-4" />Combo x{Math.min(streak, 3)}
        </motion.span>}
      </AnimatePresence>
      <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
        <Timer aria-hidden="true" className="size-4" /><span aria-label={`Tempo ${formatSeconds(seconds)}`}>{formatSeconds(seconds)}</span>
      </span>
      {progress && <span className="text-sm font-medium tabular-nums">{progress.done} de {progress.total} {progress.total === 1 ? singular[progress.label] ?? progress.label : progress.label}</span>}
    </div>
    {progress && <div aria-hidden="true" className="h-1 bg-muted">
      <div className="h-full bg-primary transition-[width] duration-500 ease-out-soft" style={{ width: `${percent}%` }} />
    </div>}
  </div>;
}

const verdicts = { 3: 'Perfeito!', 2: 'Mandou bem!', 1: 'Concluído!' } as const;

export function GameVictory({ result, onContinue, onReplay }: { result: GameResult; onContinue: () => void; onReplay: () => void }) {
  const total = result.hits + result.misses;
  const accuracy = total ? Math.round(result.hits / total * 100) : 100;
  const celebrate = result.stars >= 2 && !prefersReducedMotion();
  return <div className="game-victory relative grid justify-items-center gap-5 overflow-hidden px-5 py-8 text-center @lg:px-10" role="status">
    {celebrate && <Confetti />}
    <div aria-label={`${result.stars} de 3 estrelas`} className="flex items-end gap-2" role="img">
      {[1, 2, 3].map(position => {
        const lit = position <= result.stars;
        return <motion.span animate={{ scale: 1, rotate: 0, opacity: 1 }} className={cn('grid place-items-center', position === 2 && '-translate-y-2')}
          initial={prefersReducedMotion() ? false : { scale: 0, rotate: -40, opacity: 0 }} key={position}
          transition={{ delay: 0.15 + position * 0.18, type: 'spring', stiffness: 380, damping: 16 }}>
          <Star aria-hidden="true" className={cn(position === 2 ? 'size-16' : 'size-12', lit ? 'game-star-lit' : 'text-border')}
            fill={lit ? 'currentColor' : 'none'} strokeWidth={1.5} />
        </motion.span>;
      })}
    </div>
    <div className="grid gap-1">
      <p className="m-0 text-3xl font-bold tracking-tight">{verdicts[result.stars]}</p>
      <p className="m-0 text-sm text-muted-foreground">Atividade concluída.</p>
    </div>
    <dl className="m-0 grid w-full max-w-md grid-cols-3 gap-2">
      {[['Pontos', String(result.score)], ['Precisão', `${accuracy}%`], ['Tempo', formatSeconds(result.seconds)]].map(([label, value]) =>
        <div className="rounded-xl bg-muted px-2 py-3" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="m-0 text-xl font-bold tabular-nums">{value}</dd>
        </div>)}
    </dl>
    <div className="flex flex-wrap justify-center gap-2">
      <Button autoFocus className="min-w-40" onClick={onContinue} size="lg">Continuar</Button>
      <Button onClick={onReplay} size="lg" variant="outline"><RotateCcw className="size-4" />Jogar de novo</Button>
    </div>
  </div>;
}

const confettiColors = ['#ffd166', '#14694b', '#3ec28f', '#ffffff', '#f4845f'];

function Confetti() {
  const [pieces] = useState(() => Array.from({ length: 42 }, (_, index) => ({
    id: index,
    x: (Math.random() - 0.5) * 640,
    y: 260 + Math.random() * 220,
    rotate: (Math.random() - 0.5) * 720,
    delay: Math.random() * 0.25,
    color: confettiColors[index % confettiColors.length],
    wide: index % 3 === 0,
  })));
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
    {pieces.map(piece => <motion.span animate={{ x: piece.x, y: piece.y, rotate: piece.rotate, opacity: [1, 1, 0] }}
      className={cn('absolute rounded-[2px]', piece.wide ? 'h-2 w-3' : 'h-3 w-1.5')} initial={{ x: 0, y: 0, opacity: 1 }} key={piece.id}
      style={{ backgroundColor: piece.color }} transition={{ duration: 1.6, delay: piece.delay, ease: [0.2, 0.7, 0.4, 1] }} />)}
  </div>;
}

export function GameMessage({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'bad'; children: ReactNode }) {
  return <p aria-live="polite" className={cn('m-0 min-h-6 text-sm font-medium',
    tone === 'good' && 'text-success', tone === 'bad' && 'text-destructive', tone === 'neutral' && 'text-muted-foreground')} role="status">{children}</p>;
}

export function useTitleId() { return useId(); }
