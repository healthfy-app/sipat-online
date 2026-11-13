import { Check, Film, Gamepad2, ListChecks, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { gameTypeOptions } from '@/gamificationGames';
import { cn } from '@/lib/utils';
import { formatClock, normalize, type Catalog, type DaySlots } from './model';

export type PickTarget = { kind: 'video' | 'game'; dayIndex: number; slot: number };

/** Chooses the content of one cell: a video grouped by subject, or a game, quiz or form. */
export default function ContentPicker({ catalog, day, dayNumber, target, onPick, onPickMany, onClose }: {
  catalog: Catalog; day: DaySlots; dayNumber: number; target: PickTarget;
  onPick: (id: string) => void; onPickMany: (ids: string[]) => void; onClose: () => void;
}) {
  const label = target.kind === 'video' ? `Vídeo ${target.slot + 1}` : `Jogo ${target.slot + 1}`;
  const title = `Dia ${dayNumber} · ${label}`;
  return <Dialog description={target.kind === 'video'
    ? 'Escolha um vídeo do catálogo. Você pode procurar pelo nome ou pelo código, como A1V4.'
    : 'Escolha um jogo, quiz ou formulário para este dia.'} onClose={onClose} size="lg" title={title}>
    {target.kind === 'video'
      ? <VideoList catalog={catalog} day={day} onPick={onPick} onPickMany={onPickMany} />
      : <GameList catalog={catalog} day={day} onPick={onPick} />}
  </Dialog>;
}

function VideoList({ catalog, day, onPick, onPickMany }: {
  catalog: Catalog; day: DaySlots; onPick: (id: string) => void; onPickMany: (ids: string[]) => void;
}) {
  const inDay = new Set(day.videos.filter((id): id is string => !!id));
  const preferred = catalog.subjects.find(subject => normalize(subject.title) === normalize(day.subject));
  const [subjectId, setSubjectId] = useState(preferred?.id ?? catalog.subjects[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const subject = catalog.subjects.find(item => item.id === subjectId);
  const searching = query.trim().length > 0;
  const needle = normalize(query);

  const items = useMemo(() => {
    const ids = searching ? [...catalog.videos.keys()] : subject?.videoIds ?? [];
    return ids.map(id => catalog.videos.get(id)!).filter(video => !searching
      || normalize(video.title).includes(needle) || (video.code ?? '').toLowerCase() === query.trim().toLowerCase());
  }, [catalog, searching, subject, needle, query]);
  const addable = !searching && subject ? subject.videoIds.filter(id => !inDay.has(id)) : [];

  return <div className="grid gap-3">
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input aria-label="Procurar vídeo" className="pl-9" data-autofocus onChange={event => setQuery(event.target.value)}
        placeholder="Procurar pelo nome ou código (A1V4)" type="search" value={query} />
    </div>
    <div className="grid min-h-0 gap-3 sm:grid-cols-[13.5rem_minmax(0,1fr)]">
      <nav aria-label="Assuntos" className={cn('flex max-h-[22rem] gap-1 overflow-auto sm:grid sm:content-start', searching && 'opacity-45')}>
        {catalog.subjects.map(item => <button aria-pressed={!searching && item.id === subjectId}
          className={cn('flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
            !searching && item.id === subjectId ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent')}
          key={item.id} onClick={() => { setSubjectId(item.id); setQuery(''); }} type="button">
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span>
          <span className={cn('rounded-full px-1.5 text-xs tabular-nums', !searching && item.id === subjectId ? 'bg-white/20' : 'bg-muted text-muted-foreground')}>{item.videoIds.length}</span>
        </button>)}
      </nav>
      <div className="grid min-w-0 content-start gap-2">
        {!searching && subject && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
          <p className="m-0 text-sm text-muted-foreground">{subject.videoIds.length} vídeos · {formatClock(subject.totalMs)}</p>
          <Button disabled={addable.length === 0} onClick={() => onPickMany(addable)} size="sm" variant="outline">
            <ListChecks /> Escolher todos
          </Button>
        </div>}
        <ul className="m-0 grid max-h-[22rem] list-none gap-1.5 overflow-auto p-0">
          {items.map(video => {
            const used = inDay.has(video.id);
            return <li key={video.id}>
              <button className={cn('group flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors',
                used ? 'cursor-not-allowed bg-muted opacity-60' : 'hover:border-primary hover:bg-accent')}
                disabled={used} onClick={() => onPick(video.id)} type="button">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><Film className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium [overflow-wrap:anywhere]">{video.title}</span>
                  <span className="text-xs text-muted-foreground">{used ? 'Já está neste dia' : 'Toque para escolher'}</span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatClock(video.durationMs)}</span>
                {used && <Check aria-hidden="true" className="size-4 shrink-0 text-success" />}
              </button>
            </li>;
          })}
          {items.length === 0 && <li className="rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
            {searching ? 'Nenhum vídeo encontrado para essa busca.' : 'Este assunto ainda não tem vídeos.'}
          </li>}
        </ul>
      </div>
    </div>
  </div>;
}

function GameList({ catalog, day, onPick }: { catalog: Catalog; day: DaySlots; onPick: (id: string) => void }) {
  const inDay = new Set(day.games.filter((id): id is string => !!id));
  const games = [...catalog.games.values()].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  if (games.length === 0) {
    return <p className="m-0 rounded-lg bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
      Ainda não há jogos, quizzes ou formulários no catálogo. Crie na aba "Jogos e perguntas" de Cursos.
    </p>;
  }
  return <ul className="m-0 grid max-h-[24rem] list-none gap-1.5 overflow-auto p-0">
    {games.map(game => {
      const used = inDay.has(game.id);
      const type = gameTypeOptions.find(option => option.value === game.gameType)?.label ?? 'Atividade';
      return <li key={game.id}>
        <button className={cn('flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors',
          used ? 'cursor-not-allowed bg-muted opacity-60' : 'hover:border-primary hover:bg-accent')}
          disabled={used} onClick={() => onPick(game.id)} type="button">
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-warning-soft text-warning"><Gamepad2 className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium [overflow-wrap:anywhere]">{game.title}</span>
            <span className="text-xs text-muted-foreground">{used ? 'Já está neste dia' : type}</span>
          </span>
          {used && <Check aria-hidden="true" className="size-4 shrink-0 text-success" />}
        </button>
      </li>;
    })}
  </ul>;
}
