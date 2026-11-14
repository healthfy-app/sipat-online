import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Lightbulb } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, starsFor, type FinishGame, type useGameScore } from './gameKit';
import { GameMessage, type HudProgress } from './GameShell';

const hintAfterSeconds = 15;

interface Miss { id: number; x: number; y: number }

export default function RiskSpottingGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const risks = module.content?.risks ?? [];
  const [found, setFound] = useState<number[]>([]);
  const [misses, setMisses] = useState<Miss[]>([]);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'good' | 'bad' }>({ text: '', tone: 'neutral' });
  const [hint, setHint] = useState<number | null>(null);
  const [idle, setIdle] = useState(0);
  const scene = useRef<HTMLDivElement>(null);
  const missId = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(timer => window.clearTimeout(timer)), []);
  const reduced = prefersReducedMotion();

  useEffect(() => { onProgress({ done: found.length, total: risks.length, label: 'riscos' }); }, [found.length, risks.length, onProgress]);
  useEffect(() => {
    const timer = window.setInterval(() => setIdle(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function moveLens(event: PointerEvent<HTMLDivElement>) {
    const box = scene.current?.getBoundingClientRect();
    if (!box || !box.width) return;
    scene.current!.style.setProperty('--lens-x', `${(event.clientX - box.left) / box.width * 100}%`);
    scene.current!.style.setProperty('--lens-y', `${(event.clientY - box.top) / box.height * 100}%`);
  }

  function missAt(event: { clientX: number; clientY: number }) {
    const box = scene.current?.getBoundingClientRect();
    const x = box && box.width ? (event.clientX - box.left) / box.width * 100 : 50;
    const y = box && box.height ? (event.clientY - box.top) / box.height * 100 : 50;
    const id = ++missId.current;
    setMisses(current => [...current, { id, x, y }]);
    timers.current.push(window.setTimeout(() => setMisses(current => current.filter(item => item.id !== id)), 700));
    score.miss();
    setMessage({ text: 'Nada de risco aqui. Observe os detalhes e tente outra área.', tone: 'bad' });
  }

  function spot(index: number) {
    if (found.includes(index)) return;
    const next = [...found, index];
    setFound(next); setHint(null); setIdle(0);
    score.hit(100);
    setMessage({ text: `Risco identificado: ${risks[index].label}`, tone: 'good' });
    if (next.length === risks.length) {
      const { score: points, hits, misses: wrong } = score.current();
      timers.current.push(window.setTimeout(() => onFinish({ score: points, hits, misses: wrong, stars: starsFor(hits, wrong) }), reduced ? 0 : 900));
    }
  }

  function showHint() {
    const remaining = risks.findIndex((_, index) => !found.includes(index));
    if (remaining < 0) return;
    setHint(remaining); setIdle(0);
    score.miss();
    setMessage({ text: 'Dica: olhe a área que está piscando.', tone: 'neutral' });
  }

  const allFound = found.length === risks.length;
  return <div className="grid gap-3 p-4 @2xl:grid-cols-[minmax(0,1fr)_13rem] @lg:p-5">
    <div className="grid min-w-0 gap-2">
      <p className="m-0 text-sm text-muted-foreground">Encontre os riscos na imagem. Você também pode usar Tab e Enter para identificá-los.</p>
      <div className={cn('risk-scene relative w-full overflow-hidden rounded-xl bg-black select-none', !allFound && 'is-searching')}
        onClick={event => { if (!allFound) missAt(event); }} onPointerMove={moveLens} ref={scene}>
        <img alt="Ambiente de trabalho para identificar situações de risco" className="block w-full" draggable={false} src={module.content?.imageUrl ?? undefined} />
        <div aria-hidden="true" className="risk-lens pointer-events-none absolute inset-0" />
        {risks.map((risk, index) => {
          const isFound = found.includes(index);
          return <button
            aria-label={`Identificar risco: ${risk.label}`} aria-pressed={isFound}
            className={cn('risk-region absolute min-h-6 min-w-6 rounded-lg border-0 bg-transparent p-0', isFound && 'is-found', hint === index && 'is-hinted')}
            key={index}
            onClick={event => { event.stopPropagation(); spot(index); }}
            style={{ left: `${risk.x}%`, top: `${risk.y}%`, width: `${risk.width}%`, height: `${risk.height}%` }}
            type="button">
            {isFound && <motion.span animate={{ scale: 1, opacity: 1 }} aria-hidden="true"
              className="risk-found-mark absolute inset-0 grid place-items-center rounded-lg"
              initial={reduced ? false : { scale: 1.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 18 }}>
              <span className="grid size-7 place-items-center rounded-full bg-success text-xs font-bold text-white shadow-lg">{found.indexOf(index) + 1}</span>
            </motion.span>}
          </button>;
        })}
        <AnimatePresence>
          {misses.map(miss => <motion.span animate={{ scale: 1.4, opacity: 0 }} aria-hidden="true"
            className="pointer-events-none absolute size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-destructive"
            initial={{ scale: 0.4, opacity: 1 }} key={miss.id} style={{ left: `${miss.x}%`, top: `${miss.y}%` }} transition={{ duration: 0.6 }} />)}
        </AnimatePresence>
      </div>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <GameMessage tone={message.tone}>{message.text}</GameMessage>
        {!allFound && idle >= hintAfterSeconds && hint === null &&
          <Button onClick={showHint} size="sm" variant="outline"><Lightbulb className="size-4" />Pedir dica</Button>}
      </div>
    </div>
    <aside className="grid content-start gap-2">
      <p className="m-0 text-sm font-semibold">{found.length} de {risks.length} riscos identificados</p>
      <ul className="m-0 grid list-none gap-1.5 p-0">
        {risks.map((_, slot) => {
          const index = found[slot];
          return <li className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm',
            index === undefined ? 'border border-dashed border-border text-muted-foreground' : 'bg-success-soft font-medium text-success')} key={slot}>
            {index === undefined ? <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-muted text-[0.6875rem] font-bold">{slot + 1}</span>
              : <Check aria-hidden="true" className="size-4 shrink-0" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{index === undefined ? 'Risco escondido' : risks[index].label}</span>
          </li>;
        })}
      </ul>
    </aside>
  </div>;
}
