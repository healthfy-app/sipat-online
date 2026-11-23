import { Building2, CirclePlus, Tags, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { changeVideosCompanies, changeVideosSubjects, createSubject, deleteSubject } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';

export interface Choice { id: string; title: string }
type Tab = 'subjects' | 'companies';
/** all: every selected video has it; some: only part of them; none: no one. */
type Mark = 'all' | 'some' | 'none';

function marksOf(choices: Choice[], videoIds: string[], current: Map<string, string[]>) {
  return new Map(choices.map(choice => {
    const count = videoIds.filter(id => (current.get(id) ?? []).includes(choice.id)).length;
    return [choice.id, (count === 0 ? 'none' : count === videoIds.length ? 'all' : 'some') as Mark];
  }));
}

function MarkBox({ mark, label, onToggle, onDelete }: { mark: Mark; label: string; onToggle: () => void; onDelete?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mark === 'some'; }, [mark]);
  return <div className="group/mark flex items-start rounded-md hover:bg-muted">
    <label className="m-0 flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 px-2 py-2 text-sm leading-snug max-[640px]:py-2.5">
      <input checked={mark === 'all'} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-primary)]" onChange={onToggle} ref={ref} type="checkbox" />
      <span>{label}{mark === 'some' && <span className="ml-1 text-xs text-muted-foreground">(em parte dos vídeos)</span>}</span>
    </label>
    {onDelete && <button
      aria-label={`Apagar o assunto ${label}`}
      className="m-0 mr-1 mt-1 grid size-7 min-h-0 shrink-0 cursor-pointer place-items-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground opacity-0 transition-opacity hover:bg-card hover:text-destructive focus-visible:opacity-100 group-hover/mark:opacity-100 max-[860px]:opacity-100"
      onClick={onDelete}
      title="Apagar assunto"
      type="button"
    >
      <X aria-hidden="true" className="size-4" />
    </button>}
  </div>;
}

/** Asks once before an assunto is gone for good, saying how many videos lose it. */
function ConfirmDelete({ label, usedBy, busy, onConfirm, onCancel }: {
  label: string; usedBy: number; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return <div className="grid gap-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2.5 text-sm" role="alertdialog" aria-label={`Apagar o assunto ${label}`}>
    <p className="m-0 leading-snug">
      Apagar <strong>{label}</strong>?{' '}
      <span className="text-muted-foreground">
        {usedBy > 0 ? `Sai de ${pluralize(usedBy, 'vídeo', 'vídeos')}; os vídeos continuam na biblioteca.` : 'Nenhum vídeo usa este assunto.'}
      </span>
    </p>
    <div className="flex justify-end gap-2">
      <Button disabled={busy} onClick={onCancel} size="sm" type="button" variant="outline">Não</Button>
      <Button disabled={busy} onClick={onConfirm} size="sm" type="button" variant="destructive">{busy ? 'Apagando...' : 'Apagar'}</Button>
    </div>
  </div>;
}

/**
 * Associates the selected videos, in one go, to assuntos (a classification) and to companies (the video becomes private
 * to them). Only what the operator touches changes: a box left as it was keeps every video as it is.
 */
export default function AssociateVideosDialog({ videoIds, subjects: knownSubjects, companies, videoSubjects, videoCompanies, onClose, onSaved, onSubjectCreated, onSubjectDeleted }: {
  videoIds: string[]; subjects: Choice[]; companies: Choice[];
  videoSubjects: Map<string, string[]>; videoCompanies: Map<string, string[]>;
  onClose: () => void; onSaved: (message: string) => Promise<void>;
  /** A new assunto made here, so the page lists it even if the dialog is cancelled. */
  onSubjectCreated?: (subject: Choice) => void;
  /** An assunto deleted here, so the page drops it from the list and from every video. */
  onSubjectDeleted?: (subjectId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('subjects');
  const [created, setCreated] = useState<Choice[]>([]);
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const subjects = useMemo(() => [...knownSubjects, ...created.filter(item => !knownSubjects.some(known => known.id === item.id))]
    .filter(item => !deleted.has(item.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [knownSubjects, created, deleted]);
  const usedBy = (subjectId: string) => [...videoSubjects.values()].filter(ids => ids.includes(subjectId)).length;
  const initialSubjects = useMemo(() => marksOf(subjects, videoIds, videoSubjects), [subjects, videoIds, videoSubjects]);
  const initialCompanies = useMemo(() => marksOf(companies, videoIds, videoCompanies), [companies, videoIds, videoCompanies]);
  const [subjectMarks, setSubjectMarks] = useState(initialSubjects);
  const [companyMarks, setCompanyMarks] = useState(initialCompanies);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const diff = (marks: Map<string, Mark>, initial: Map<string, Mark>) => ({
    add: [...marks].filter(([id, mark]) => mark === 'all' && initial.get(id) !== 'all').map(([id]) => id),
    remove: [...marks].filter(([id, mark]) => mark === 'none' && initial.get(id) !== 'none').map(([id]) => id),
  });
  const subjectChange = diff(subjectMarks, initialSubjects);
  const companyChange = diff(companyMarks, initialCompanies);
  const changed = subjectChange.add.length + subjectChange.remove.length + companyChange.add.length + companyChange.remove.length > 0;

  const toggle = (setMarks: typeof setSubjectMarks, id: string) =>
    setMarks(current => new Map(current).set(id, current.get(id) === 'all' ? 'none' : 'all'));

  async function save() {
    setBusy(true); setError('');
    try {
      if (subjectChange.add.length + subjectChange.remove.length > 0) await changeVideosSubjects({ videoIds, ...subjectChange });
      if (companyChange.add.length + companyChange.remove.length > 0) await changeVideosCompanies({ videoIds, ...companyChange });
      await onSaved(`${pluralize(videoIds.length, 'vídeo atualizado', 'vídeos atualizados')}.`);
    } catch (failure) {
      setError(getErrorMessage(failure));
      setBusy(false);
    }
  }

  async function addSubject(name: string) {
    setCreating(true); setError('');
    try {
      const subject = await createSubject(name);
      const choice = { id: subject.id, title: subject.name };
      setCreated(current => current.some(item => item.id === choice.id) ? current : [...current, choice]);
      setSubjectMarks(current => new Map(current).set(choice.id, 'all'));
      setQuery('');
      onSubjectCreated?.(choice);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setCreating(false);
    }
  }

  async function removeSubject(subjectId: string) {
    setDeleting(true); setError('');
    try {
      await deleteSubject(subjectId);
      setDeleted(current => new Set(current).add(subjectId));
      setSubjectMarks(current => { const next = new Map(current); next.delete(subjectId); return next; });
      setConfirming(null);
      onSubjectDeleted?.(subjectId);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setDeleting(false);
    }
  }

  const list = tab === 'subjects' ? subjects : companies;
  const marks = tab === 'subjects' ? subjectMarks : companyMarks;
  const needle = query.trim().replace(/\s+/g, ' ');
  const shown = list.filter(item => item.title.toLocaleLowerCase('pt-BR').includes(needle.toLocaleLowerCase('pt-BR')));
  const canCreate = tab === 'subjects' && needle.length > 0
    && !subjects.some(item => item.title.toLocaleLowerCase('pt-BR') === needle.toLocaleLowerCase('pt-BR'));
  const privateCount = [...companyMarks.values()].filter(mark => mark !== 'none').length;
  const tabButton = (value: Tab, label: string, Icon: typeof Tags) =>
    <button aria-selected={tab === value} className={cn('inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-semibold',
      tab === value ? 'bg-card text-foreground shadow-card' : 'bg-transparent text-muted-foreground hover:text-foreground')}
      onClick={() => { setTab(value); setQuery(''); }} role="tab" type="button"><Icon className="size-4" /> {label}</button>;

  return <Dialog busy={busy} description={`${pluralize(videoIds.length, 'vídeo selecionado', 'vídeos selecionados')}. Só muda o que você marcar ou desmarcar.`} onClose={onClose} title="Associar vídeos">
    <div className="grid gap-3">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
        {tabButton('subjects', 'Assuntos', Tags)}
        {tabButton('companies', 'Empresas', Building2)}
      </div>
      <p className="m-0 text-[0.8125rem] text-muted-foreground">
        {tab === 'subjects'
          ? 'Marque os assuntos em que os vídeos entram. Um vídeo pode ter vários.'
          : privateCount > 0
            ? 'Os vídeos ficam privados: só as empresas marcadas veem e usam nos treinamentos.'
            : 'Sem empresa marcada o vídeo é público. Marque para deixá-lo privado das empresas escolhidas.'}
      </p>
      <Input aria-label={tab === 'subjects' ? 'Buscar ou criar assunto' : 'Buscar empresa'} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && canCreate && shown.length === 0 && !creating) { event.preventDefault(); void addSubject(needle); } }}
        placeholder={tab === 'subjects' ? 'Buscar ou criar assunto' : 'Buscar empresa'} type="search" value={query} />
      <div className="grid max-h-[50vh] content-start overflow-y-auto rounded-md border border-border p-1" role="tabpanel">
        {canCreate && <button
          className="m-0 flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border-0 bg-accent px-2 py-2 text-left text-sm font-semibold text-primary hover:bg-accent/70 disabled:cursor-default disabled:opacity-60"
          disabled={creating || busy} onClick={() => void addSubject(needle)} type="button">
          <CirclePlus aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{creating ? 'Criando...' : <>Criar assunto “{needle}”</>}</span>
        </button>}
        {shown.length === 0
          ? !canCreate && <p className="m-0 p-3 text-sm text-muted-foreground">Nada encontrado.</p>
          : shown.map(item => tab === 'subjects' && confirming === item.id
            ? <ConfirmDelete busy={deleting} key={item.id} label={item.title} onCancel={() => setConfirming(null)}
              onConfirm={() => void removeSubject(item.id)} usedBy={usedBy(item.id)} />
            : <MarkBox key={item.id} label={item.title} mark={marks.get(item.id) ?? 'none'}
              onDelete={tab === 'subjects' && !busy ? () => setConfirming(item.id) : undefined}
              onToggle={() => toggle(tab === 'subjects' ? setSubjectMarks : setCompanyMarks, item.id)} />)}
      </div>
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || !changed} onClick={() => void save()} type="button">{busy ? 'Salvando...' : 'Salvar'}</Button>
      </DialogActions>
    </div>
  </Dialog>;
}
