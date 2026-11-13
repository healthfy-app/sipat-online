import { useEffect, useRef, useState } from 'react';
import {
  Check, Ear, Eye, FireExtinguisher, FlaskConical, Footprints, Glasses, Hand, HardHat, ShieldCheck, Sparkles, Wind, Zap, type LucideIcon,
} from 'lucide-react';
import type { GameModule } from '@/api';
import { cn } from '@/lib/utils';
import { shuffled, starsFor, type FinishGame, type useGameScore } from './gameKit';
import { GameMessage, type HudProgress } from './GameShell';

/** Picks a safety icon from the card text; unknown words get a neutral one. */
const iconRules: [RegExp, LucideIcon][] = [
  [/capacete|cabe[çc]a|cr[aâ]nio/i, HardHat],
  [/[óo]culos|vis[ãa]o|face|rosto/i, Glasses],
  [/olho/i, Eye],
  [/luva|m[ãa]o/i, Hand],
  [/bota|cal[çc]ado|sapato|p[ée]s?\b/i, Footprints],
  [/auricular|abafador|ouvido|audi[çc][ãa]o|ru[íi]do/i, Ear],
  [/m[áa]scara|respirador|pulm|respira|poeira|g[áa]s/i, Wind],
  [/el[ée]tric|choque|tens[ãa]o/i, Zap],
  [/qu[íi]mic|[áa]cido|solvente/i, FlaskConical],
  [/extintor|fogo|inc[êe]ndio|chama/i, FireExtinguisher],
];
function iconFor(text: string, fallback: LucideIcon) {
  return iconRules.find(([rule]) => rule.test(text))?.[1] ?? fallback;
}

export default function MemoryGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const pairs = module.content?.pairs ?? [];
  const [cards] = useState(() => shuffled(pairs.length * 2));
  const [revealed, setRevealed] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const [shaking, setShaking] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'good' | 'bad' }>({ text: '', tone: 'neutral' });
  const revealedRef = useRef<number[]>([]);
  const matchedRef = useRef(new Set<number>());

  useEffect(() => { onProgress({ done: matched.length / 2, total: pairs.length, label: 'pares' }); }, [matched.length, pairs.length, onProgress]);

  useEffect(() => {
    if (revealed.length !== 2) return;
    const [first, second] = revealed;
    const isPair = Math.floor(first / 2) === Math.floor(second / 2);
    if (!isPair) setShaking(revealed);
    const timer = window.setTimeout(() => {
      if (isPair) {
        revealed.forEach(card => matchedRef.current.add(card));
        const next = [...matchedRef.current];
        setMatched(next);
        score.hit(200);
        const pair = pairs[Math.floor(first / 2)];
        const done = next.length === cards.length;
        setMessage({ text: done ? 'Todos os pares encontrados!' : `Par encontrado: ${pair?.first} + ${pair?.second}.`, tone: 'good' });
        if (done) {
          const { score: points, hits, misses } = score.current();
          // Memory always has some misses; judge by moves against the perfect run instead.
          const extra = Math.max(0, misses - pairs.length);
          onFinish({ score: points, hits, misses, stars: starsFor(pairs.length, extra) });
        }
      } else {
        score.miss();
        setMessage({ text: 'Essas cartas não formam um par. Tente novamente.', tone: 'bad' });
      }
      setShaking([]);
      revealedRef.current = []; setRevealed([]);
    }, isPair ? 550 : 900);
    return () => window.clearTimeout(timer);
  // score and onFinish are stable for the life of the board
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, cards.length, pairs]);

  function flip(card: number) {
    if (revealedRef.current.length >= 2 || revealedRef.current.includes(card) || matchedRef.current.has(card)) return;
    revealedRef.current = [...revealedRef.current, card];
    setRevealed(revealedRef.current);
    if (revealedRef.current.length === 2) setMoves(value => value + 1);
  }

  const columns = cards.length <= 6 ? 'grid-cols-3' : cards.length <= 8 ? 'grid-cols-2 @md:grid-cols-4' : cards.length <= 12 ? 'grid-cols-3 @lg:grid-cols-4' : 'grid-cols-3 @lg:grid-cols-5';
  return <div className="grid gap-3 p-4 @lg:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="m-0 text-sm text-muted-foreground">Associe cada equipamento à sua proteção. As duas cartas de um par se complementam; não têm o mesmo texto.</p>
      <p className="m-0 text-sm font-medium tabular-nums">{moves} {moves === 1 ? 'jogada' : 'jogadas'}</p>
    </div>
    <p className="sr-only">{matched.length / 2} de {pairs.length} pares encontrados</p>
    <div className={cn('memory-board grid gap-2.5 @lg:gap-3', columns)}>
      {cards.map((card, position) => {
        const isMatched = matched.includes(card);
        const visible = revealed.includes(card) || isMatched;
        const pair = pairs[Math.floor(card / 2)];
        const isFirst = card % 2 === 0;
        const text = isFirst ? pair?.first : pair?.second;
        const Icon = iconFor(text ?? '', isFirst ? ShieldCheck : Sparkles);
        return <button
          aria-label={visible ? `${text}${isMatched ? ', par encontrado' : ''}` : `Revelar carta ${position + 1}`}
          aria-pressed={visible}
          className={cn('memory-card group relative aspect-[3/4] min-w-0 rounded-xl border-0 bg-transparent p-0 @lg:aspect-[4/5]',
            visible && 'is-revealed', isMatched && 'is-matched', shaking.includes(card) && 'is-shaking')}
          disabled={visible || revealed.length === 2} key={card} onClick={() => flip(card)} type="button">
          <span className="memory-card-inner absolute inset-0">
            <span aria-hidden="true" className="memory-card-back absolute inset-0 grid place-items-center rounded-xl">
              <ShieldCheck className="size-8 text-white/85" strokeWidth={1.5} />
            </span>
            <span className={cn('memory-card-face absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 bg-card p-2.5 text-center',
              isMatched ? 'border-success bg-success-soft' : 'border-border')}>
              <span aria-hidden="true" className={cn('grid size-10 place-items-center rounded-full',
                isMatched ? 'bg-success text-white' : isFirst ? 'bg-accent text-accent-foreground' : 'bg-warning-soft text-warning')}>
                {isMatched ? <Check className="size-5" /> : <Icon className="size-5" />}
              </span>
              <span className="text-[0.8125rem] leading-tight font-semibold [overflow-wrap:anywhere] @lg:text-sm">{text}</span>
            </span>
          </span>
        </button>;
      })}
    </div>
    <GameMessage tone={message.tone}>{message.text}</GameMessage>
  </div>;
}
