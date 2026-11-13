import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'motion/react';
import { ArrowRight, Check, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, starsFor, type FinishGame, type useGameScore } from './gameKit';
import type { HudProgress } from './GameShell';

const swipeDistance = 110;
const swipeSpeed = 600;

/**
 * "Seguro ou arriscado?": a deck of situations. The participant throws each card right (safe)
 * or left (risky), or uses the buttons and arrow keys, then reads why.
 */
export default function SafeOrRiskyGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const cards = (module.content?.cards ?? []).filter(item => item.text.trim());
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<boolean | null>(null);
  const deciding = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-14, 14]);
  const safeStamp = useTransform(x, [20, swipeDistance], [0, 1]);
  const riskyStamp = useTransform(x, [-swipeDistance, -20], [1, 0]);
  const reduced = prefersReducedMotion();
  const card = cards[index];
  const answered = answer !== null;
  const correct = answered && answer === card.safe;
  const isLast = index >= cards.length - 1;

  useEffect(() => { onProgress({ done: index + (answered ? 1 : 0), total: cards.length, label: 'cartas' }); }, [index, answered, cards.length, onProgress]);

  async function decide(safe: boolean) {
    if (answered || deciding.current) return;
    deciding.current = true;
    if (!reduced) await animate(x, safe ? 520 : -520, { duration: 0.28, ease: [0.4, 0, 1, 1] });
    if (safe === card.safe) score.hit(100); else score.miss();
    setAnswer(safe);
    deciding.current = false;
  }

  function next() {
    if (!isLast) { x.set(0); setAnswer(null); setIndex(index + 1); return; }
    const { score: points, hits, misses } = score.current();
    onFinish({ score: points, hits, misses, stars: starsFor(hits, misses) });
  }

  function release(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.x) > swipeDistance || Math.abs(info.velocity.x) > swipeSpeed) void decide(info.offset.x > 0);
    else if (reduced) x.set(0);
    else void animate(x, 0, { type: 'spring', stiffness: 500, damping: 32 });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (!answered && event.key === 'ArrowRight') { event.preventDefault(); void decide(true); }
      if (!answered && event.key === 'ArrowLeft') { event.preventDefault(); void decide(false); }
      // Enter or Space moves on even when focus is not on the button (e.g. after a mouse swipe)
      if (answered && (event.key === 'Enter' || event.key === ' ') && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); next(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return <div className="grid gap-4 overflow-hidden p-4 @lg:p-6">
    <div className="relative mx-auto grid h-72 w-full max-w-sm @lg:h-80">
      {/* the next cards peek from behind, so the deck reads as a stack */}
      {[2, 1].map(depth => index + depth < cards.length && <div aria-hidden="true"
        className="absolute inset-0 rounded-3xl border border-border bg-card shadow-card"
        key={`behind-${depth}`} style={{ transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, opacity: 1 - depth * 0.25 }} />)}

      {!answered ? <motion.div
        className="safe-card absolute inset-0 grid cursor-grab touch-none content-center justify-items-center gap-4 rounded-3xl border border-border bg-card p-6 text-center shadow-overlay select-none active:cursor-grabbing"
        // dragging follows the hand, so it stays on with reduced motion; only the fly-away is skipped
        drag="x" dragElastic={0.9} dragMomentum={false} key={index} onDragEnd={release}
        style={{ x, rotate }}>
        <motion.span aria-hidden="true" className="safe-stamp is-risky absolute top-5 left-5" style={{ opacity: riskyStamp }}>Arriscado</motion.span>
        <motion.span aria-hidden="true" className="safe-stamp is-safe absolute top-5 right-5" style={{ opacity: safeStamp }}>Seguro</motion.span>
        <p className="m-0 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Carta {index + 1} de {cards.length}</p>
        <h4 className="m-0 text-xl leading-snug font-semibold [text-wrap:balance] @lg:text-2xl">{card.text}</h4>
        <p className="m-0 text-sm text-muted-foreground">É seguro ou arriscado?</p>
      </motion.div> : <motion.div
        animate={{ opacity: 1, scale: 1, rotateY: 0 }}
        className={cn('absolute inset-0 grid content-center justify-items-center gap-3 rounded-3xl border-2 p-6 text-center shadow-overlay select-none',
          correct ? 'border-success bg-success-soft' : 'border-destructive bg-destructive-soft')}
        initial={reduced ? false : { opacity: 0, scale: 0.92, rotateY: -25 }} key={`answer-${index}`} role="status"
        transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
        <span aria-hidden="true" className={cn('grid size-12 place-items-center rounded-full text-white', correct ? 'bg-success' : 'bg-destructive')}>
          {correct ? <Check className="size-6" /> : <X className="size-6" />}
        </span>
        <p className={cn('m-0 text-lg font-bold', correct ? 'text-success' : 'text-destructive')}>
          {correct ? 'Acertou!' : 'Não foi dessa vez.'} {card.safe ? 'É seguro.' : 'É arriscado.'}
        </p>
        <p className="m-0 text-sm font-medium [text-wrap:balance]">{card.text}</p>
        {card.explanation && <p className="m-0 text-sm text-muted-foreground [text-wrap:balance]">{card.explanation}</p>}
      </motion.div>}
    </div>

    {!answered ? <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
      <Button className="h-14 border-destructive/40 text-base text-destructive hover:border-destructive hover:bg-destructive-soft hover:text-destructive"
        onClick={() => void decide(false)} variant="outline"><ThumbsDown className="size-5" />Arriscado</Button>
      <Button className="h-14 border-success/40 text-base text-success hover:border-success hover:bg-success-soft hover:text-success"
        onClick={() => void decide(true)} variant="outline">Seguro<ThumbsUp className="size-5" /></Button>
    </div> : <div className="mx-auto w-full max-w-sm">
      <Button autoFocus className="h-12 w-full text-base" onClick={next}>{isLast ? 'Ver resultado' : 'Próxima carta'}<ArrowRight className="size-4" /></Button>
    </div>}
  </div>;
}
