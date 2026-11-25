import { CirclePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface Choice { id: string; title: string; hint?: string }
/** all: every selected thing has it; some: only part of them; none: no one. */
export type Mark = 'all' | 'some' | 'none';

const same = (a: string, b: string) => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR');

function ChoiceRow({ choice, mark, mode, group, someLabel, removeLabel, disabled, onToggle, onRemove }: {
  choice: Choice; mark: Mark; mode: 'multi' | 'single'; group: string; someLabel: string; removeLabel: string; disabled?: boolean;
  onToggle: () => void; onRemove?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current && mode === 'multi') ref.current.indeterminate = mark === 'some'; }, [mark, mode]);
  return <div className="group/mark flex items-start rounded-md hover:bg-muted">
    <label className="m-0 flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-2 py-2 text-sm leading-snug max-[640px]:py-2.5">
      <input checked={mark === 'all'} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-primary)]" disabled={disabled}
        name={mode === 'single' ? group : undefined} onChange={onToggle} ref={ref} type={mode === 'single' ? 'radio' : 'checkbox'} />
      <span className="min-w-0 flex-1">{choice.title}{mark === 'some' && <span className="ml-1 text-xs text-muted-foreground">{someLabel}</span>}</span>
      {choice.hint && <span aria-hidden="true" className="shrink-0 text-xs tabular-nums text-muted-foreground">{choice.hint}</span>}
    </label>
    {onRemove && <button
      aria-label={removeLabel}
      className="m-0 mr-1 mt-1 grid size-7 min-h-0 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-card hover:text-destructive focus-visible:opacity-100 group-hover/mark:opacity-100 max-[860px]:opacity-100"
      onClick={onRemove}
      title={removeLabel}
      type="button"
    >
      <X aria-hidden="true" className="size-4" />
    </button>}
  </div>;
}

/**
 * A list to mark: search it, mark several (or one), add what is missing right there and take out what is not wanted,
 * asking once before. The videos' assuntos, a training's units and a person's unit and sector are all picked with it.
 */
export function ChoiceList({ choices, marks, onToggle, mode = 'multi', noun, someLabel = '(em parte dos vídeos)', onCreate, onRemove, removeNote, removeVerb = 'Apagar', removeLabel, canRemove, disabled }: {
  choices: Choice[];
  marks: ReadonlyMap<string, Mark>;
  onToggle: (id: string) => void;
  /** multi: boxes; single: only one marked at a time. */
  mode?: 'multi' | 'single';
  /** What each item is, for the texts: "assunto", "unidade", "setor", "empresa". */
  noun: string;
  someLabel?: string;
  /** Adds the name typed. On failure it shows the error itself and rejects, so the search keeps what was typed. */
  onCreate?: (name: string) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  /** What happens when this one is removed, said in the confirmation. */
  removeNote?: (choice: Choice) => string;
  removeVerb?: string;
  removeLabel?: (choice: Choice) => string;
  /** Which ones can be removed (all of them when not given). */
  canRemove?: (choice: Choice) => boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const group = useRef(`choice-${Math.random().toString(36).slice(2)}`).current;

  const needle = query.trim().replace(/\s+/g, ' ');
  const shown = choices.filter(item => item.title.toLocaleLowerCase('pt-BR').includes(needle.toLocaleLowerCase('pt-BR')));
  const canCreate = !!onCreate && needle.length > 0 && !choices.some(item => same(item.title, needle));
  const searchLabel = onCreate ? `Buscar ou criar ${noun}` : `Buscar ${noun}`;
  const labelOf = (choice: Choice) => removeLabel?.(choice) ?? `${removeVerb} ${choice.title}`;

  async function create() {
    if (!onCreate || creating) return;
    setCreating(true);
    try { await onCreate(needle); setQuery(''); } catch { /* the owner shows the error */ } finally { setCreating(false); }
  }

  async function remove(id: string) {
    if (!onRemove) return;
    setRemoving(true);
    try { await onRemove(id); setConfirming(null); } catch { /* the owner shows the error */ } finally { setRemoving(false); }
  }

  return <>
    <Input aria-label={searchLabel} onChange={event => setQuery(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (canCreate && shown.length === 0) void create(); } }}
      placeholder={searchLabel} type="search" value={query} />
    <div className="grid max-h-[50vh] content-start overflow-y-auto rounded-md border border-border p-1">
      {canCreate && <button
        className="m-0 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-accent px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-accent/70 disabled:cursor-default disabled:opacity-60"
        disabled={creating || disabled} onClick={() => void create()} type="button">
        <CirclePlus aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{creating ? 'Criando...' : <>Criar {noun} “{needle}”</>}</span>
      </button>}
      {shown.length === 0
        ? !canCreate && <p className="m-0 p-3 text-sm text-muted-foreground">Nada encontrado.</p>
        : shown.map(item => confirming === item.id
          ? <div aria-label={labelOf(item)} className="grid gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm" key={item.id} role="alertdialog">
            <p className="m-0 leading-snug">
              {removeVerb} <strong>{item.title}</strong>?{removeNote && <>{' '}<span className="text-muted-foreground">{removeNote(item)}</span></>}
            </p>
            <div className="flex justify-end gap-2">
              <Button disabled={removing} onClick={() => setConfirming(null)} size="sm" type="button" variant="outline">Não</Button>
              <Button disabled={removing} onClick={() => void remove(item.id)} size="sm" type="button" variant="destructive">{removing ? 'Aguarde...' : removeVerb}</Button>
            </div>
          </div>
          : <ChoiceRow choice={item} disabled={disabled} group={group} key={item.id} mark={marks.get(item.id) ?? 'none'} mode={mode}
            onRemove={onRemove && !disabled && (canRemove?.(item) ?? true) ? () => setConfirming(item.id) : undefined} onToggle={() => onToggle(item.id)}
            removeLabel={labelOf(item)} someLabel={someLabel} />)}
    </div>
  </>;
}
