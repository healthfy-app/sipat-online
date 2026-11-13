import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Eye, Lock } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shuffled, type FinishGame, type useGameScore } from './gameKit';
import { GameMessage, type HudProgress } from './GameShell';

/** Fewest swaps that solve a permutation: pieces minus the cycles they form. */
function fewestSwaps(order: number[]) {
  const seen = new Set<number>();
  let cycles = 0;
  order.forEach((_, start) => {
    if (seen.has(start)) return;
    cycles++;
    for (let at = start; !seen.has(at); at = order[at]) seen.add(at);
  });
  return order.length - cycles;
}

export default function PuzzleGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const columns = Math.max(2, module.content?.columns ?? 2);
  const size = columns ** 2;
  const imageUrl = module.content?.imageUrl ?? '';
  const [order, setOrder] = useState(() => shuffled(size));
  const best = useMemo(() => Math.max(1, fewestSwaps(order)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [peek, setPeek] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'good' | 'bad' }>({ text: '', tone: 'neutral' });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const finishTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(finishTimer.current), []);
  const placed = order.filter((piece, index) => piece === index).length;
  const solved = placed === size;

  useEffect(() => { onProgress({ done: placed, total: size, label: 'peças no lugar' }); }, [placed, size, onProgress]);

  function swap(first: number, second: number) {
    if (first === second || order[first] === first || order[second] === second) return;
    const next = [...order];
    [next[first], next[second]] = [next[second], next[first]];
    const gained = (next[first] === first ? 1 : 0) + (next[second] === second ? 1 : 0);
    setOrder(next); setMoves(value => value + 1);
    if (gained) { score.hit(100 * gained); setMessage({ text: gained === 2 ? 'Duas peças encaixadas!' : 'Peça encaixada!', tone: 'good' }); }
    else { score.miss(); setMessage({ text: 'Nenhuma peça encaixou nessa troca.', tone: 'bad' }); }
    if (next.every((piece, index) => piece === index)) {
      const { score: points, hits, misses } = score.current();
      const used = moves + 1;
      const stars = used <= best ? 3 : used <= Math.ceil(best * 1.5) + 1 ? 2 : 1;
      setMessage({ text: 'Muito bem! A imagem está completa.', tone: 'good' });
      finishTimer.current = window.setTimeout(() => onFinish({ score: points, hits, misses, stars }), 700);
    }
  }

  function pick(index: number) {
    if (solved || order[index] === index) return;
    if (selected === null) { setSelected(index); return; }
    if (selected !== index) swap(selected, index);
    setSelected(null);
  }

  function drop(event: DragEndEvent) {
    setDragging(null);
    if (event.over) swap(Number(event.active.id), Number(event.over.id));
  }

  const pieceStyle = (piece: number): CSSProperties => ({
    backgroundImage: `url(${JSON.stringify(imageUrl)})`,
    backgroundSize: `${columns * 100}% ${columns * 100}%`,
    backgroundPosition: `${(piece % columns) / (columns - 1) * 100}% ${Math.floor(piece / columns) / (columns - 1) * 100}%`,
  });

  return <div className="grid gap-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="m-0 text-sm text-muted-foreground">Arraste uma peça sobre outra, ou selecione duas peças para trocar de lugar e reconstruir a imagem.</p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">{moves} {moves === 1 ? 'troca' : 'trocas'}</span>
        <Button aria-pressed={peek} onBlur={() => setPeek(false)} onClick={() => setPeek(value => !value)} size="sm" variant="outline"><Eye className="size-4" />Ver modelo</Button>
      </div>
    </div>
    <DndContext onDragCancel={() => setDragging(null)} onDragEnd={drop} onDragStart={event => { setSelected(null); setDragging(Number(event.active.id)); }} sensors={sensors}>
      <div className="relative mx-auto w-full max-w-[30rem]">
        <div className={cn('puzzle-board grid aspect-square w-full gap-1 rounded-xl bg-foreground/90 p-1', solved && 'is-solved')}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {order.map((piece, index) => <PuzzlePiece index={index} key={piece} locked={piece === index} onPick={() => pick(index)}
            piece={piece} selected={selected === index} solved={solved} style={pieceStyle(piece)} />)}
        </div>
        {peek && <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl bg-cover bg-center opacity-90 ring-4 ring-signal"
          style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }} />}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {dragging !== null && <div className="aspect-square rotate-3 rounded-md shadow-overlay ring-4 ring-signal" style={pieceStyle(order[dragging])} />}
      </DragOverlay>
    </DndContext>
    <GameMessage tone={message.tone}>{message.text}</GameMessage>
  </div>;
}

function PuzzlePiece({ index, piece, locked, selected, solved, style, onPick }: {
  index: number; piece: number; locked: boolean; selected: boolean; solved: boolean; style: CSSProperties; onPick: () => void;
}) {
  const disabled = locked || solved;
  const drag = useDraggable({ id: String(index), disabled });
  const dropZone = useDroppable({ id: String(index), disabled });
  return <button {...drag.attributes} {...drag.listeners}
    aria-label={`Peça ${piece + 1}, posição ${index + 1}${locked ? ', encaixada' : ''}`} aria-pressed={selected}
    className={cn('puzzle-piece relative min-w-0 overflow-hidden rounded-md border-0 bg-cover p-0',
      locked && 'is-locked', selected && 'is-selected', dropZone.isOver && !drag.isDragging && 'is-target', drag.isDragging && 'opacity-30')}
    disabled={disabled}
    onClick={onPick}
    ref={node => { drag.setNodeRef(node); dropZone.setNodeRef(node); }}
    style={style} type="button" role={undefined} tabIndex={disabled ? -1 : 0}>
    {locked && !solved && <span aria-hidden="true" className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-success text-white"><Lock className="size-3" /></span>}
  </button>;
}
