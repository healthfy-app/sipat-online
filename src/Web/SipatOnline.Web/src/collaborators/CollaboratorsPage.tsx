import { Pencil, Search, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TrainingSelect } from '@/trainings/TrainingSelect';
import { filterByTraining, useTrainingFilter } from '@/trainings/useTrainingFilter';
import {
  changePlacement, changeUserStatus, getCompanyRegistry, listAllParticipants, listLearningParticipation, listParticipantProfiles,
  type CompanyRegistry, type LearningParticipantProgress, type ParticipantAccount, type ParticipantProfile,
} from '@/api';
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
import PlacementDialog from './PlacementDialog';
import { filterByPlacement, type PlacementFilter } from './profileFilter';
import ProgressDialog from './ProgressDialog';

const filters: { value: ParticipantProgressFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'in-progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluíram' },
  { value: 'not-started', label: 'Não iniciaram' },
  { value: 'no-tracks', label: 'Sem dias' },
  { value: 'inactive', label: 'Inativos' },
];

const statusText: Record<ParticipantProgressStatus, string> = {
  completed: 'Concluiu', 'in-progress': 'Em andamento', 'not-started': 'Não iniciou', 'no-tracks': 'Sem dias', inactive: 'Inativo',
};

const missingFields = [
  { rule: 'requireRegistration', label: 'matrícula', missing: (profile?: ParticipantProfile) => !profile?.registrationNumber },
  { rule: 'requireEmail', label: 'e-mail', missing: (profile?: ParticipantProfile) => !profile?.email },
  { rule: 'requirePhone', label: 'telefone', missing: (profile?: ParticipantProfile) => !profile?.phone },
  { rule: 'requireUnit', label: 'unidade', missing: (profile?: ParticipantProfile) => !profile?.unitId, filter: 'unit' },
  { rule: 'requireSector', label: 'setor', missing: (profile?: ParticipantProfile) => !profile?.sectorId, filter: 'sector' },
] as const;

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
  const [profiles, setProfiles] = useState<Map<string, ParticipantProfile> | null>(null);
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [unitFilter, setUnitFilter] = useState<PlacementFilter>('all');
  const [sectorFilter, setSectorFilter] = useState<PlacementFilter>('all');
  const [placing, setPlacing] = useState<'unit' | 'sector' | null>(null);

  const load = useCallback(async () => {
    setError('');
    // unit, sector and the rules are extra: if they fail the list stays usable, just without those columns
    const extras = Promise.allSettled([listParticipantProfiles(), getCompanyRegistry()]);
    try {
      const [accounts, participation] = await Promise.all([listAllParticipants(), listLearningParticipation()]);
      setPeople(accounts); setRows(participation);
    } catch (failure) {
      setError(getErrorMessage(failure));
      setPeople(current => current ?? []);
    }
    const [profileResult, registryResult] = await extras;
    setProfiles(profileResult.status === 'fulfilled' ? new Map(profileResult.value.map(profile => [profile.id, profile])) : null);
    setRegistry(registryResult.status === 'fulfilled' ? registryResult.value : null);
    const failure = profileResult.status === 'rejected' ? profileResult.reason : registryResult.status === 'rejected' ? registryResult.reason : null;
    if (failure) setError(current => current || getErrorMessage(failure));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const training = useTrainingFilter(rows);
  const trainingRows = useMemo(() => filterByTraining(rows, training.selectedId), [training.selectedId, rows]);
  const summaries = useMemo(() => summarizeParticipants(people ?? [], trainingRows), [people, trainingRows]);
  const showPlacement = !!profiles && !!registry;
  const placed = useMemo(
    () => (profiles ? new Set(filterByPlacement(people ?? [], profiles, unitFilter, sectorFilter).map(person => person.id)) : null),
    [people, profiles, unitFilter, sectorFilter],
  );
  const visible = useMemo(
    () => filterParticipantProgress(summaries, search, filter)
      .filter(item => !placed || placed.has(item.participant.id))
      .sort((a, b) => a.participant.displayName.localeCompare(b.participant.displayName, 'pt-BR')),
    [summaries, search, filter, placed],
  );
  // only active people count: someone who can no longer enter does not need their registration completed
  const missing = useMemo(() => {
    if (!profiles || !registry) return [];
    const active = (people ?? []).filter(person => person.isActive);
    return missingFields
      .filter(item => registry.rules[item.rule])
      .map(item => ({ ...item, count: active.filter(person => item.missing(profiles.get(person.id))).length }))
      .filter(item => item.count > 0);
  }, [people, profiles, registry]);
  const nameOf = (items: { id: string; name: string }[] | undefined, id: string | null | undefined) => items?.find(item => item.id === id)?.name ?? '—';
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

  async function place(field: 'unit' | 'sector', valueId: string | null) {
    const items = field === 'unit' ? registry?.units : registry?.sectors;
    const result = await changePlacement([...selected], field, valueId);
    const word = field === 'unit' ? 'unidade' : 'setor';
    const count = pluralize(result.changed, 'colaborador', 'colaboradores');
    setPlacing(null); setSelected(new Set()); setError('');
    setNotice(valueId === null
      ? `${count} ${result.changed === 1 ? 'ficou sem' : 'ficaram sem'} ${word}.`
      : `${count} ${result.changed === 1 ? 'passou' : 'passaram'} para ${nameOf(items, valueId)}.`);
    await load();
  }

  const refreshWith = async (message: string) => { setEditing(null); setAdding(false); if (message) setNotice(message); await load(); };

  return <Page>
    <PageHeader
      actions={<>
        <Button disabled={!people?.length} onClick={() => downloadCsv(reportFileName('empresa'), companyReportCsv(people ?? [], trainingRows))} variant="outline">Baixar relatório (CSV)</Button>
        {!readOnly && <Button onClick={() => setAdding(true)}><UserPlus /> Adicionar colaboradores</Button>}
      </>}
      description="Todos os colaboradores da empresa e até onde cada um chegou em cada treinamento."
      eyebrow="Gestão da empresa"
      title="Colaboradores"
    />

    <TrainingSelect onChange={training.setSelectedId} trainings={training.trainings} value={training.selectedId} />
    {readOnly && <p className="m-0 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground" role="note">Modo de consulta: você acompanha o andamento dos colaboradores, mas não altera seus dados.</p>}
    {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

    {people && <section aria-label="Resumo dos colaboradores" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 max-[720px]:grid-cols-2">
      <Stat label="Colaboradores" value={counts.total} />
      <Stat label="Com acesso ativo" value={counts.active} />
      <Stat label="Em andamento" value={counts.running} />
      <Stat label="Concluíram" value={counts.completed} />
    </section>}

    <section aria-label="Filtros" className="flex flex-wrap items-center gap-3">
      <label className="relative flex min-w-0 flex-[1_1_16rem] items-center text-muted-foreground sm:max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4" />
        <Input aria-label="Buscar por nome ou login" className="pl-9" onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome ou login" type="search" value={search} />
      </label>
      <NativeSelect aria-label="Situação" className="w-auto min-w-44" onChange={event => setFilter(event.target.value as ParticipantProgressFilter)} value={filter}>
        {filters.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
      </NativeSelect>
      {showPlacement && registry.units.length > 0 && <NativeSelect aria-label="Filtrar por unidade" className="w-auto min-w-44" onChange={event => setUnitFilter(event.target.value)} value={unitFilter}>
        <option value="all">Todas as unidades</option>
        <option value="none">Sem unidade</option>
        {registry.units.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>}
      {showPlacement && registry.sectors.length > 0 && <NativeSelect aria-label="Filtrar por setor" className="w-auto min-w-44" onChange={event => setSectorFilter(event.target.value)} value={sectorFilter}>
        <option value="all">Todos os setores</option>
        <option value="none">Sem setor</option>
        {registry.sectors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </NativeSelect>}
    </section>
    {missing.length > 0 && <ul aria-label="Cadastros incompletos" className="m-0 grid list-none gap-1.5 p-0">
      {missing.map(item => <li className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm" key={item.rule}>
        <span>{pluralize(item.count, 'pessoa', 'pessoas')} sem {item.label}</span>
        {'filter' in item && registry && (item.filter === 'unit' ? registry.units : registry.sectors).length > 0
          && <Button onClick={() => (item.filter === 'unit' ? setUnitFilter : setSectorFilter)('none')} size="sm" variant="outline">Mostrar quem está sem {item.label}</Button>}
      </li>)}
    </ul>}

    {!readOnly && selected.size > 0 && <div aria-label="Ações para os selecionados" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2" role="group">
      <strong className="text-sm">{selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}</strong>
      {(people ?? []).some(person => selected.has(person.id) && !person.isActive) && <Button disabled={busy} onClick={() => void setStatus(true)} size="sm" variant="outline">Reativar</Button>}
      {(people ?? []).some(person => selected.has(person.id) && person.isActive) && <Button disabled={busy} onClick={() => void setStatus(false)} size="sm" variant="outline">Inativar</Button>}
      {showPlacement && registry.units.length > 0 && <Button disabled={busy} onClick={() => setPlacing('unit')} size="sm" variant="outline">Mudar unidade</Button>}
      {showPlacement && registry.sectors.length > 0 && <Button disabled={busy} onClick={() => setPlacing('sector')} size="sm" variant="outline">Mudar setor</Button>}
      <Button disabled={busy} onClick={() => setSelected(new Set())} size="sm" variant="ghost">Limpar seleção</Button>
    </div>}

    {!people && <LoadingState>Carregando os colaboradores...</LoadingState>}
    {people && people.length === 0 && !error && <EmptyState action={!readOnly && <Button onClick={() => setAdding(true)}>Adicionar colaboradores</Button>} description="Adicione um a um ou importe uma planilha." title="Nenhum colaborador ainda." />}
    {people && people.length > 0 && visible.length === 0 && <EmptyState description="Tente outro nome ou login, ou mude o filtro." title="Nenhum colaborador encontrado." />}
    {visible.length > 0 && <>
      <Table aria-label="Colaboradores da empresa">
        <TableHeader>
          <TableRow>
            {!readOnly && <TableHead className="w-10" scope="col">
              <input aria-label="Selecionar todos os listados" checked={allSelected} className="size-4 accent-[var(--brand-primary)]" onChange={() => setSelected(allSelected ? new Set() : new Set(ids))} type="checkbox" />
            </TableHead>}
            <TableHead scope="col">Colaborador</TableHead>
            {showPlacement && <TableHead className="max-md:hidden" scope="col">Unidade</TableHead>}
            {showPlacement && <TableHead className="max-md:hidden" scope="col">Setor</TableHead>}
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
              {showPlacement && <TableCell className="max-md:hidden text-sm">{nameOf(registry.units, profiles.get(person.id)?.unitId)}</TableCell>}
              {showPlacement && <TableCell className="max-md:hidden text-sm">{nameOf(registry.sectors, profiles.get(person.id)?.sectorId)}</TableCell>}
              <TableCell className="max-sm:hidden"><Badge variant={person.isActive ? (summary.status === 'completed' ? 'success' : 'default') : 'neutral'}>{statusText[summary.status]}</Badge></TableCell>
              <TableCell>
                <div aria-label={`${summary.overallProgressPercentage}% concluído`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={summary.overallProgressPercentage} className="flex min-w-28 items-center gap-2" role="progressbar">
                  <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${summary.overallProgressPercentage}%` }} /></span>
                  <strong className="w-10 text-right text-xs tabular-nums">{summary.overallProgressPercentage}%</strong>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-1.5">
                  <Button aria-label={`Ver andamento de ${person.displayName}`} onClick={() => setViewing(person)} size="sm" variant="ghost">Ver andamento</Button>
                  {!readOnly && <Button aria-label={`Editar ${person.displayName}`} onClick={() => setEditing(person)} size="sm" variant="outline"><Pencil /> Editar</Button>}
                </div>
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table>
    </>}

    {editing && <EditCollaboratorDialog onClose={() => setEditing(null)} onSaved={refreshWith} person={editing} profiles={profiles ? [...profiles.values()] : []} profile={profiles ? (profiles.get(editing.id) ?? { id: editing.id, registrationNumber: null, email: null, phone: null, unitId: null, sectorId: null }) : undefined} registry={registry} />}
    {placing && registry && <PlacementDialog count={selected.size} field={placing} items={placing === 'unit' ? registry.units : registry.sectors}
      onClose={() => setPlacing(null)} onConfirm={valueId => place(placing, valueId)} />}
    {viewing && <ProgressDialog onClose={() => setViewing(null)} person={viewing} trainingId={training.selectedId} />}
    {adding && <AddCollaboratorsDialog onClose={() => setAdding(false)} onCreated={refreshWith} />}
  </Page>;
}
