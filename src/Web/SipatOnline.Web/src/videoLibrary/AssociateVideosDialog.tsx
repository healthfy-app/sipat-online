import { Building2, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { changeVideosCompanies, changeVideosSubjects, createSubject, deleteSubject } from '@/api';
import { Button } from '@/components/ui/button';
import { ChoiceList, type Choice, type Mark } from '@/components/ui/choice-list';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import { cn } from '@/lib/utils';

export type { Choice } from '@/components/ui/choice-list';
type Tab = 'subjects' | 'companies';

function marksOf(choices: Choice[], videoIds: string[], current: Map<string, string[]>) {
  return new Map(choices.map(choice => {
    const count = videoIds.filter(id => (current.get(id) ?? []).includes(choice.id)).length;
    return [choice.id, (count === 0 ? 'none' : count === videoIds.length ? 'all' : 'some') as Mark];
  }));
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
  const subjects = useMemo(() => [...knownSubjects, ...created.filter(item => !knownSubjects.some(known => known.id === item.id))]
    .filter(item => !deleted.has(item.id))
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')), [knownSubjects, created, deleted]);
  const usedBy = (subjectId: string) => [...videoSubjects.values()].filter(ids => ids.includes(subjectId)).length;
  const initialSubjects = useMemo(() => marksOf(subjects, videoIds, videoSubjects), [subjects, videoIds, videoSubjects]);
  const initialCompanies = useMemo(() => marksOf(companies, videoIds, videoCompanies), [companies, videoIds, videoCompanies]);
  const [subjectMarks, setSubjectMarks] = useState(initialSubjects);
  const [companyMarks, setCompanyMarks] = useState(initialCompanies);
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
    setError('');
    try {
      const subject = await createSubject(name);
      const choice = { id: subject.id, title: subject.name };
      setCreated(current => current.some(item => item.id === choice.id) ? current : [...current, choice]);
      setSubjectMarks(current => new Map(current).set(choice.id, 'all'));
      onSubjectCreated?.(choice);
    } catch (failure) {
      setError(getErrorMessage(failure));
      throw failure;
    }
  }

  async function removeSubject(subjectId: string) {
    setError('');
    try {
      await deleteSubject(subjectId);
      setDeleted(current => new Set(current).add(subjectId));
      setSubjectMarks(current => { const next = new Map(current); next.delete(subjectId); return next; });
      onSubjectDeleted?.(subjectId);
    } catch (failure) {
      setError(getErrorMessage(failure));
      throw failure;
    }
  }

  const privateCount = [...companyMarks.values()].filter(mark => mark !== 'none').length;
  const tabButton = (value: Tab, label: string, Icon: typeof Tags) =>
    <button aria-selected={tab === value} className={cn('inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border-0 px-3 text-sm font-semibold',
      tab === value ? 'bg-card text-foreground shadow-card' : 'bg-transparent text-muted-foreground hover:text-foreground')}
      onClick={() => setTab(value)} role="tab" type="button"><Icon className="size-4" /> {label}</button>;

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
      {tab === 'subjects'
        ? <ChoiceList choices={subjects} disabled={busy} key="subjects" marks={subjectMarks} noun="assunto" onCreate={addSubject} onRemove={removeSubject}
          onToggle={id => toggle(setSubjectMarks, id)} removeLabel={choice => `Apagar o assunto ${choice.title}`}
          removeNote={choice => usedBy(choice.id) > 0 ? `Sai de ${pluralize(usedBy(choice.id), 'vídeo', 'vídeos')}; os vídeos continuam na biblioteca.` : 'Nenhum vídeo usa este assunto.'} />
        : <ChoiceList choices={companies} disabled={busy} key="companies" marks={companyMarks} noun="empresa" onToggle={id => toggle(setCompanyMarks, id)} />}
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || !changed} onClick={() => void save()} type="button">{busy ? 'Salvando...' : 'Salvar'}</Button>
      </DialogActions>
    </div>
  </Dialog>;
}
