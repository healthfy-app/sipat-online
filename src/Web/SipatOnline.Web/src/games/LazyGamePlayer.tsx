import { lazy, Suspense } from 'react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import type { GameOutcome } from './gameKit';

// The games bring motion and dnd-kit; download them only when an activity opens.
const GamePlayer = lazy(() => import('@/GamePlayer'));

export default function LazyGamePlayer({ module, onClose }: { module: GameModule; onClose: (outcome?: GameOutcome) => void }) {
  return <Suspense fallback={<div aria-busy="true" className="flex items-center justify-between gap-3 rounded-2xl bg-card px-5 py-4 font-sans text-sm text-muted-foreground shadow-overlay">
    <span role="status">Carregando atividade…</span>
    <Button onClick={() => onClose('skipped')} size="sm" variant="ghost">Pular</Button>
  </div>}>
    <GamePlayer module={module} onClose={onClose} />
  </Suspense>;
}
