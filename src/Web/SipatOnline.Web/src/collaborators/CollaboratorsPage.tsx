import { Pencil, Search, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { changeUserStatus, listAllParticipants, listLearningParticipation, type LearningParticipantProgress, type ParticipantAccount } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Page, PageHeader, Stat } from '@/components/ui/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage, pluralize } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import {
  filterParticipantProgress, summarizeParticipants, type ParticipantProgressFilter, type ParticipantProgressStatus, type ParticipantProgressSummary,
} from '@/participantProgress';
import { companyReportCsv, reportFileName } from '@/participantReports';
import AddCollaboratorsDialog from './AddCollaboratorsDialog';
import { downloadCsv } from './csvFile';
import EditCollaboratorDialog from './EditCollaboratorDialog';
import ProgressDialog from './ProgressDialog';

const filters: { value: ParticipantProgressFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'in-progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluíram' },
  { value: 'not-started', label: 'Não iniciaram' },
  { value: 'no-tracks', label: 'Sem dias da SIPAT' },
  { value: 'inactive', label: 'Inativos' },
];

const statusText: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluiu', 'in-progress': 'Em andamento', 'not-started': 'Não iniciou', 'no-tracks': 'Sem dias', inactive: 'Inativo',
};

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('') || '?';

/**
 * The collaborators of the company in one list: who they are, how far each one got in the SIPAT, and what the administrator
 * can do about them — correct their data and password, give or take away access, download the report.
 */
export default function CollaboratorsPage({ readOnly = false }: { readOnly?: boolean }) {
  const [params] = useSearchParams();
  const [people, setPeople] = useState<ParticipantAccount[] | null>(null);
  const [rows, setRows] = useState<LearningParticipantProgress[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ParticipantProgressFilter>(() => filters.find(item => item.value === params.get('status'))?.value ?? 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ParticipantAccount | null>(null);
  const [viewing, setViewing] = useState<ParticipantAccount | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [accounts, participation] = await Promise.all([listAllParticipants(), listLearningParticipation()]);
      setPeople(accounts); setRows(participation);
    } catch (failure) {
      setError(getErrorMessage(failure));
      setPeople(current => current ?? []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const summaries = useMemo(() => summarizeParticipants(people ?? [], rows), [people, rows]);
  const visible = useMemo(
    () => filterParticipantProgress(summaries, search, filter).sort((a, b) => a.participant.displayName.localeCompare(b.participant.displayName, 'pt-BR')),
    [summaries, search, filter],
  );
  const counts = useMemo(() => ({
    total: summaries.length,
    active: summaries.filter(item => item.participant.isActive).length,
    completed: summaries.filter(item => item.status === 'completed').length,
    running: summaries.filter(item => item.status === 'in-progress').length,
  }), [summaries]);

  const ids = visible.map(item => item.participant.id);
  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
  const toggle = (id: string) => setSelected(current => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });

  async function setStatus(active: boolean) {
    const targets = (people ?? []).filter(person => selected.has(person.id) && person.isActive !== active);
    if (targets.length === 0) { setNotice(active ? 'As pessoas escolhidas já estão ativas.' : 'As pessoas escolhidas já estão inativas.'); return; }
    if (!active && !window.confirm(`Inativar ${pluralize(targets.length, 'colaborador', 'colaboradores')}? Eles deixam de entrar na plataforma, mas o histórico é mantido.`)) return;
    setBusy(true); setError(''); setNotice('');
    const failed: string[] = [];
    for (const person of targets) {
      try { await changeUserStatus(person.id, active); } catch { failed.push(person.displayName); }
    }
    setBusy(false); setSelected(new Set());
    const done = targets.length - failed.length;
    setNotice(`${pluralize(done, 'colaborador', 'colaboradores')} ${active ? (done === 1 ? 'reativado' : 'reativados') : (done === 1 ? 'inativado' : 'inativados')}.`);
    if (failed.length > 0) setError(`Não foi possível alterar: ${failed.join(', ')}.`);
    await load();
  }

  const refreshWith = async (message: string) => { setEditing(null); setAdding(false); if (message) setNotice(message); await load(); };

  return <Page>
    <PageHeader
      actions={<>
        <Button disabled={!people?.length} onClick={() => downloadCsv(reportFileName('empresa'), companyReportCsv(people ?? [], rows))} variant="outline">Baixar relatório (CSV)</Button>
        {!readOnly && <Button onClick={() => setAdding(true)}><UserPlus /> Adicionar colaboradores</Button>}
      </>}
      description="Todos os colaboradores da empresa e até onde cada um chegou na SIPAT."
      eyebrow="Gestão da empresa"
      title="Colaboradores"
    />

    {readOnly && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="note">Modo de consulta: você acompanha o andamento dos colaboradores, mas não altera seus dados.</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {people && <section aria-label="Resumo dos colaboradores" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3">
      <Stat label="Colaboradores" value={counts.total} />
      <Stat label="Com acesso ativo" value={counts.active} />
      <Stat label="Em andamento" value={counts.running} />
      <Stat label="Concluíram" value={counts.completed} />
    </section>}

    <section aria-label="Filtros" className="flex flex-wrap items-center gap-3">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar por nome ou matrícula" className="pl-9" onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou matrícula" type="search" value={search} />
      </label>
      <NativeSelect aria-label="Situação" className="w-auto min-w-44" onChange={event => setFilter(event.target.value as ParticipantProgressFilter)} value={filter}>
        {filters.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </NativeSelect>
    </section>

    {!readOnly && selected.size > 0 && <div aria-label="Ações para os selecionados" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2" role="group">
      <strong className="text-sm">{selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}</strong>
      <Button disabled={busy} onClick={() => void setStatus(true)} size="sm" variant="outline">Reativar</Button>
      <Button disabled={busy} onClick={() => void setStatus(false)} size="sm" variant="outline">Inativar</Button>
      <Button disabled={busy} onClick={() => setSelected(new Set())} size="sm" variant="ghost">Limpar seleção</Button>
    </div>}

    {!people && <LoadingState>Carregando os colaboradores...</LoadingState>}
    {people && people.length === 0 && !error && <EmptyState action={!readOnly && <Button onClick={() => setAdding(true)}>Adicionar colaboradores</Button>} description="Adicione um a um ou importe uma planilha." title="Nenhum colaborador ainda." />}
    {people && people.length > 0 && visible.length === 0 && <EmptyState description="Tente outro nome ou matrícula, ou mude o filtro." title="Nenhum colaborador encontrado." />}
    {visible.length > 0 && <>
      <Table aria-label="Colaboradores da empresa">
        <TableHeader>
          <TableRow>
            {!readOnly && <TableHead className="w-10" scope="col">
              <input aria-label="Selecionar todos os listados" checked={allSelected} className="size-4 accent-[var(--brand-primary)]" onChange={() => setSelected(allSelected ? new Set() : new Set(ids))} type="checkbox" />
            </TableHead>}
            <TableHead scope="col">Colaborador</TableHead>
            <TableHead className="max-sm:hidden" scope="col">Situação</TableHead>
            <TableHead scope="col">Andamento</TableHead>
            <TableHead className="text-right" scope="col"><span className="sr-only">Ações</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((summary: ParticipantProgressSummary) => {
            const person = summary.participant;
            return <TableRow data-state={selected.has(person.id) ? 'selected' : undefined} key={person.id}>
              {!readOnly && <TableCell>
                <input aria-label={`Selecionar ${person.displayName}`} checked={selected.has(person.id)} className="size-4 accent-[var(--brand-primary)]" onChange={() => toggle(person.id)} type="checkbox" />
              </TableCell>}
              <TableCell>
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{initials(person.displayName)}</span>
                  <div className="grid min-w-0"><strong className="truncate text-sm">{person.displayName}</strong><span className="truncate text-xs text-muted-foreground">{person.loginIdentifier}</span></div>
                </div>
              </TableCell>
              <TableCell className="max-sm:hidden"><Badge variant={person.isActive ? (summary.status === 'completed' ? 'success' : 'default') : 'neutral'}>{statusText[summary.status]}</Badge></TableCell>
              <TableCell>
                <div aria-label={`${summary.overallProgressPercentage}% concluído`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={summary.overallProgressPercentage} className="flex min-w-28 items-center gap-2" role="progressbar">
                  <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${summary.overallProgressPercentage}%` }} /></span>
                  <strong className="w-10 text-right text-xs tabular-nums">{summary.overallProgressPercentage}%</strong>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1.5">
                  <Button aria-label={`Ver andamento de ${person.displayName}`} onClick={() => setViewing(person)} size="sm" variant="ghost">Andamento</Button>
                  {!readOnly && <Button aria-label={`Editar ${person.displayName}`} onClick={() => setEditing(person)} size="sm" variant="outline"><Pencil /> Editar</Button>}
                </div>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </>}

    {editing && <EditCollaboratorDialog onClose={() => setEditing(null)} onSaved={refreshWith} person={editing} />}
    {viewing && <ProgressDialog onClose={() => setViewing(null)} person={viewing} />}
    {adding && <AddCollaboratorsDialog existingLogins={(people ?? []).map(person => person.loginIdentifier)} onClose={() => setAdding(false)} onCreated={refreshWith} />}
  </Page>;
}
