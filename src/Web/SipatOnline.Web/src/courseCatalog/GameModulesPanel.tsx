import { useState } from 'react';
import { Play, Puzzle } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { pluralize } from '@/courseEditor/courseFormat';
import { gameTypeLabel } from '@/courseEditor/courseTrack';
import GameStage from '@/games/GameStage';
import LazyGamePlayer from '@/games/LazyGamePlayer';
import { cn } from '@/lib/utils';

const warmTypes = new Set(['RiskSpotting', 'Scenario']);

export default function GameModulesPanel({
  modules,
  busy,
  onCreate,
  onEdit,
  onDelete,
}: {
  modules: GameModule[];
  busy: boolean;
  onCreate: () => void;
  onEdit: (module: GameModule) => void;
  onDelete: (module: GameModule) => void;
}) {
  const [testing, setTesting] = useState<GameModule | null>(null);
  return (
    <section aria-label="Jogos cadastrados" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="m-0 text-sm text-muted-foreground">Jogos e perguntas para colocar entre os vídeos ou durante a reprodução.</p>
        <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{pluralize(modules.length, 'jogo', 'jogos')}</span>
      </div>

      {modules.length === 0 ? (
        <EmptyState action={<Button onClick={onCreate}>Criar o primeiro jogo</Button>} title="Nenhum jogo ainda." />
      ) : (
        <ul className="m-0 grid list-none overflow-hidden rounded-lg bg-card p-0 shadow-card">
          {modules.map((module) => (
            <li
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/60 max-sm:grid-cols-[auto_minmax(0,1fr)]"
              key={module.id}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-9 place-items-center rounded-md',
                  warmTypes.has(module.gameType) ? 'bg-warning-soft text-warning' : 'bg-accent text-accent-foreground',
                )}
              >
                <Puzzle className="size-4" />
              </span>
              <div className="grid min-w-0 gap-0.5">
                <strong className="truncate text-[0.9375rem] font-semibold">{module.title}</strong>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {gameTypeLabel(module)}
                  {module.questions.length > 0 && ` · ${pluralize(module.questions.length, 'pergunta', 'perguntas')}`}
                  {' · '}
                  {module.usageCount === 0 ? 'não usado em cursos' : `usado ${module.usageCount}×`}
                </span>
              </div>
              <div className="flex gap-1.5 max-sm:col-span-2 max-sm:justify-end">
                <Button aria-label={`Testar jogo ${module.title}`} disabled={busy} onClick={() => setTesting(module)} size="sm" variant="ghost">
                  <Play /> Testar
                </Button>
                <Button aria-label={`Editar jogo ${module.title}`} disabled={busy} onClick={() => onEdit(module)} size="sm" variant="outline">
                  Editar
                </Button>
                <Button aria-label={`Remover jogo ${module.title}`} disabled={busy} onClick={() => onDelete(module)} size="sm" variant="destructive">
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {testing && <GameStage label={testing.title} onClose={() => setTesting(null)}>
        <LazyGamePlayer module={testing} onClose={() => setTesting(null)} />
      </GameStage>}
    </section>
  );
}
