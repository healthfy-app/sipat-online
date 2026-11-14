import { useEffect, useRef, useState } from 'react';
import { Plus, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import type { GameCard } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const minCards = 3;
export const maxCards = 20;

/** Cards of "Seguro ou arriscado?": a situation, the right answer and an optional "why". */
export default function SafeCardsEditor({ cards, onChange }: { cards: GameCard[]; onChange: (cards: GameCard[]) => void }) {
  const texts = useRef<(HTMLInputElement | null)[]>([]);
  const [focus, setFocus] = useState<number | null>(null);
  useEffect(() => {
    if (focus === null) return;
    texts.current[focus]?.focus();
    setFocus(null);
  }, [focus]);

  const update = (index: number, change: Partial<GameCard>) =>
    onChange(cards.map((card, current) => (current === index ? { ...card, ...change } : card)));
  const safeCount = cards.filter(card => card.safe).length;

  return <div className="grid gap-3">
    <p className="m-0 text-xs text-muted-foreground">
      De {minCards} a {maxCards} cartas. Escreva uma situação do dia a dia, marque a resposta certa e explique em uma frase o porquê.
      Misture situações seguras e arriscadas.
    </p>
    <ol className="m-0 grid list-none gap-2.5 p-0">
      {cards.map((card, index) => <li className="grid gap-2.5 rounded-lg border border-border bg-card p-3" key={index}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[0.8125rem] font-semibold">Carta {index + 1}</span>
          <Button aria-label={`Remover carta ${index + 1}`} disabled={cards.length <= 1}
            onClick={() => onChange(cards.filter((_, current) => current !== index))} size="icon-sm" variant="ghost"><Trash2 /></Button>
        </div>
        <label className="sr-only" htmlFor={`safe-card-text-${index}`}>Situação da carta {index + 1}</label>
        <Input id={`safe-card-text-${index}`} maxLength={200} placeholder="Ex.: Subir na escada com um degrau quebrado" required
          ref={element => { texts.current[index] = element; }} value={card.text}
          onChange={event => update(index, { text: event.target.value })} />
        <div aria-label={`Resposta certa da carta ${index + 1}`} className="grid grid-cols-2 gap-2" role="radiogroup">
          {([false, true] as const).map(safe => {
            const on = card.safe === safe;
            const Icon = safe ? ThumbsUp : ThumbsDown;
            return <button aria-checked={on} className={cn('flex h-10 items-center justify-center gap-2 rounded-md border-2 text-sm font-semibold transition-colors',
              on && safe && 'border-success bg-success-soft text-success',
              on && !safe && 'border-destructive bg-destructive-soft text-destructive',
              !on && 'border-border bg-card text-muted-foreground hover:bg-muted')}
              key={String(safe)} onClick={() => update(index, { safe })} role="radio" type="button">
              <Icon aria-hidden="true" className="size-4" />{safe ? 'Seguro' : 'Arriscado'}
            </button>;
          })}
        </div>
        <label className="sr-only" htmlFor={`safe-card-why-${index}`}>Por que, na carta {index + 1}</label>
        <Input id={`safe-card-why-${index}`} maxLength={300} placeholder="Por quê? (aparece depois da resposta)"
          value={card.explanation ?? ''} onChange={event => update(index, { explanation: event.target.value })} />
      </li>)}
    </ol>
    <div className="flex flex-wrap items-center justify-between gap-2">
      {cards.length < maxCards && <Button onClick={() => { onChange([...cards, { text: '', safe: false, explanation: '' }]); setFocus(cards.length); }} variant="outline">
        <Plus /> Adicionar carta
      </Button>}
      <span className="text-xs text-muted-foreground tabular-nums">{safeCount} {safeCount === 1 ? 'segura' : 'seguras'} · {cards.length - safeCount} {cards.length - safeCount === 1 ? 'arriscada' : 'arriscadas'}</span>
    </div>
  </div>;
}
