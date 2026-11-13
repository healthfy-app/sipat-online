import { useEffect, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, Check, GripVertical, X } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { shuffled, type FinishGame, type useGameScore } from './gameKit';
import { GameMessage, type HudProgress } from './GameShell';

export default function OrderingGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const items = module.content?.items ?? [];
  const [order, setOrder] = useState(() => shuffled(items.length));
  const [checked, setChecked] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'neutral' | 'good' | 'bad' }>({ text: '', tone: 'neutral' });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rightNow = order.filter((item, index) => item === index).length;

  useEffect(() => { onProgress({ done: checked ? rightNow : 0, total: items.length, label: 'na posição certa' }); }, [checked, rightNow, items.length, onProgress]);

  function reorder(next: number[]) { setOrder(next); setChecked(false); setMessage({ text: '', tone: 'neutral' }); }
  function move(from: number, to: number) { if (!solved && to >= 0 && to < order.length) reorder(arrayMove(order, from, to)); }
  function drop(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    move(order.indexOf(Number(event.active.id)), order.indexOf(Number(event.over.id)));
  }

  function verify() {
    const tries = attempts + 1;
    setAttempts(tries); setChecked(true);
    if (rightNow === items.length) {
      setSolved(true);
      score.hit(items.length * 100);
      setMessage({ text: 'Muito bem! A sequência está correta.', tone: 'good' });
      const { score: points, hits, misses } = score.current();
      window.setTimeout(() => onFinish({ score: points, hits, misses, stars: tries === 1 ? 3 : tries === 2 ? 2 : 1 }), 600);
    } else {
      score.miss();
      setMessage({ text: `Ainda não está correto: ${rightNow} de ${items.length} etapas na posição certa. Ajuste e tente novamente.`, tone: 'bad' });
    }
  }

  return <div className="grid gap-3 p-4 sm:p-5">
    <p className="m-0 text-sm text-muted-foreground">Organize as etapas na ordem correta. Arraste pela alça (ou foque nela e use Espaço e as setas).</p>
    <DndContext collisionDetection={closestCenter} onDragEnd={drop} sensors={sensors}>
      <SortableContext items={order.map(String)} strategy={verticalListSortingStrategy}>
        <ol className="m-0 grid list-none gap-2 p-0">
          {order.map((item, index) => <OrderingRow disabled={solved} first={index === 0} id={item} key={item} last={index === order.length - 1}
            onDown={() => move(index, index + 1)} onUp={() => move(index, index - 1)} position={index + 1}
            state={!checked ? 'idle' : item === index ? 'right' : 'wrong'} text={items[item]} />)}
        </ol>
      </SortableContext>
    </DndContext>
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
      <GameMessage tone={message.tone}>{message.text}</GameMessage>
      {!solved && <Button onClick={verify}>Verificar ordem</Button>}
    </div>
  </div>;
}

function OrderingRow({ id, text, position, state, first, last, disabled, onUp, onDown }: {
  id: number; text: string; position: number; state: 'idle' | 'right' | 'wrong'; first: boolean; last: boolean; disabled: boolean;
  onUp: () => void; onDown: () => void;
}) {
  const sortable = useSortable({ id: String(id), disabled });
  return <li className={cn('flex items-center gap-2 rounded-xl border-2 bg-card py-2 pr-2 pl-1.5 transition-colors',
    state === 'idle' && 'border-border', state === 'right' && 'border-success bg-success-soft', state === 'wrong' && 'border-destructive/60 bg-destructive-soft',
    sortable.isDragging && 'relative z-10 shadow-overlay ring-2 ring-primary')}
    ref={sortable.setNodeRef} style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}>
    <button aria-label={`Arrastar ${text}`} className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg border-0 bg-transparent text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-default"
      disabled={disabled} type="button" {...sortable.attributes} {...sortable.listeners}>
      <GripVertical aria-hidden="true" className="size-5" />
    </button>
    <span aria-hidden="true" className={cn('grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold',
      state === 'right' ? 'bg-success text-white' : state === 'wrong' ? 'bg-destructive text-white' : 'bg-muted')}>
      {state === 'right' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : position}
    </span>
    <span className="min-w-0 flex-1 text-[0.9375rem] font-medium [overflow-wrap:anywhere]">{text}</span>
    <span className="flex shrink-0 gap-1">
      <Button aria-label={`Subir ${text}`} disabled={first || disabled} onClick={onUp} size="icon-sm" variant="ghost"><ArrowUp /></Button>
      <Button aria-label={`Descer ${text}`} disabled={last || disabled} onClick={onDown} size="icon-sm" variant="ghost"><ArrowDown /></Button>
    </span>
  </li>;
}
