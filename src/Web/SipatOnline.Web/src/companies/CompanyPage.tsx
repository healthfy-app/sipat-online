import { Award, FileSpreadsheet, LogIn, MoreHorizontal, Search, TriangleAlert, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  changePlatformCompanyEmployeesStatus,
  getPlatformCompanyEmployees,
  getPlatformDashboard,
  listPlatformUsers,
  type PlatformCompanyEmployeePage,
  type PlatformCompanyOverview,
  type PlatformUserSummary,
} from '@/api';
import CompanyCertificateLogoPanel from '@/CompanyCertificateLogoPanel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, Page, PageHeader } from '@/components/ui/page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadingState from '@/LoadingState';
import ParticipantOutcomesPanel from '@/ParticipantOutcomesPanel';
import AddCollaboratorsDialog from '@/collaborators/AddCollaboratorsDialog';
import AddAdministratorDialog from './AddAdministratorDialog';
import CompanyAvatar from './CompanyAvatar';

const pageSize = 50;
const searchDelay = 300;

/** Active is the normal case and stays quiet; only an inactive person stands out. */
function ActiveStatus({ isActive }: { isActive: boolean }) {
  return isActive
    ? <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Ativo</span>
    : <Badge variant="warning">Inativo</Badge>;
}

/**
 * One company, seen by the operator. The sidebar (CompanyNav) is the navigation of every company page and already
 * names the company and its plan; this page shows the company once, its main actions, and the section the sidebar
 * chose: participants (default) or administrators.
 */
export default function CompanyPage() {
  const { companyId = '', section } = useParams<{ companyId: string; section?: string }>();
  const initialSearch = useSearchParams()[0].get('busca')?.trim() ?? '';
  const showingAdministrators = section === 'administradores';
  const [page, setPage] = useState<PlatformCompanyEmployeePage | null>(null);
  const [overview, setOverview] = useState<PlatformCompanyOverview | null>(null);
  const [administrators, setAdministrators] = useState<PlatformUserSummary[] | null>(null);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [notice, setNotice] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [importing, setImporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [certificateLogoRequest, setCertificateLogoRequest] = useState(0);

  useEffect(() => {
    let current = true;
    setSummaryError('');
    getPlatformDashboard()
      .then((companies) => { if (current) setOverview(companies.find((company) => company.id === companyId) ?? null); })
      .catch((loadError) => {
        if (!current) return;
        setOverview(null);
        setSummaryError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os dados da empresa.');
      });
    // administração da empresa = administrador principal (SuperAdmin) + administradores (ClientAdmin)
    Promise.all([
      listPlatformUsers(0, 50, companyId, undefined, 'SuperAdmin'),
      listPlatformUsers(0, 50, companyId, undefined, 'ClientAdmin'),
    ])
      .then(([owners, admins]) => {
        if (!current) return;
        const seen = new Set<string>();
        setAdministrators([...owners.items, ...admins.items].filter((user) => !seen.has(user.id) && seen.add(user.id)));
      })
      .catch(() => { if (current) setAdministrators([]); });
    return () => { current = false; };
  }, [companyId, refreshKey]);

  // the list filters as the operator types, like the list of companies
  useEffect(() => {
    const term = searchInput.trim();
    if (term === search) return;
    const timer = window.setTimeout(() => { setOffset(0); setSearch(term); }, searchDelay);
    return () => window.clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setError('');
    getPlatformCompanyEmployees(companyId, { offset, limit: pageSize, search, includeInactive })
      .then((result) => { if (current) setPage(result); })
      .catch((loadError) => {
        if (!current) return;
        setPage(null);
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os participantes.');
      })
      .finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [companyId, includeInactive, offset, search, reload]);

  const pageIds = page?.items.map((employee) => employee.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Whether the selection has someone active (true) or inactive (false); people chosen on another page count as both. */
  function selectionHas(isActive: boolean) {
    const chosen = page?.items.filter((employee) => selected.has(employee.id)) ?? [];
    return chosen.length < selected.size || chosen.some((employee) => employee.isActive === isActive);
  }

  async function changeStatus(isActive: boolean) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const verb = isActive ? 'reativar' : 'inativar';
    const target = ids.length === 1 ? 'o participante escolhido' : `os ${ids.length} participantes escolhidos`;
    if (!window.confirm(`Deseja ${verb} ${target}? ${isActive ? 'Eles voltam a acessar a plataforma.' : 'Eles deixam de acessar a plataforma, mas o histórico é mantido.'}`)) return;
    setIsChangingStatus(true);
    setError('');
    try {
      const result = await changePlatformCompanyEmployeesStatus(companyId, ids, isActive);
      setNotice(result.changed === 0
        ? 'Nada mudou: os participantes escolhidos já estavam nesse estado.'
        : `${result.changed} ${result.changed === 1 ? 'participante' : 'participantes'} ${isActive ? 'reativado' : 'inativado'}${result.changed === 1 ? '' : 's'}.`);
      setSelected(new Set());
      setReload((value) => value + 1);
      setRefreshKey((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível alterar os participantes.');
    } finally {
      setIsChangingStatus(false);
    }
  }

  const companyName = page?.companyName ?? overview?.name ?? '';
  const currentPage = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil((page?.totalCount ?? 0) / pageSize));
  const canSetCertificateLogo = overview?.plan === undefined || overview.plan === 'Ouro' || overview.plan === 'Diamante';
  const missingAdministrator = administrators !== null && administrators.length === 0;
  const participantCount = page?.totalCount ?? overview?.employeeCount ?? 0;

  return (
    <div className="page-content">
      <Page>
        <div className="flex flex-wrap items-center gap-4">
          {companyName && <CompanyAvatar className="size-12 text-base" logo={overview?.logoReference} name={companyName} />}
          <PageHeader
            actions={(
              <>
                <a className={buttonVariants({ variant: 'default' })} href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}><LogIn /> Entrar como administrador</a>
                {canSetCertificateLogo && <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal /> Mais</Button></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setCertificateLogoRequest((value) => value + 1)}><Award /> Logo do certificado</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>}
              </>
            )}
            badge={overview && (overview.isActive
              ? <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Ativa</span>
              : <Badge variant="warning">Inativa</Badge>)}
            className="flex-1 items-center"
            description={page ? `Identificador · ${page.companyKey}` : 'Carregando dados da empresa...'}
            title={companyName || (isLoading ? 'Carregando empresa...' : 'Empresa')}
          />
        </div>
        {canSetCertificateLogo && <CompanyCertificateLogoPanel companyId={companyId} openRequest={certificateLogoRequest} />}

        {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
        {summaryError && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{summaryError}</p>}

        {/* without an administrator nobody in the company can run its SIPAT: the most urgent thing on the page */}
        {missingAdministrator && !showingAdministrators && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-warning" role="status">
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
            <p className="m-0 min-w-0 flex-1 text-sm font-medium">Esta empresa ainda não tem administrador. Sem ele, ninguém da empresa consegue cuidar dos treinamentos.</p>
            <Button onClick={() => setAddingAdmin(true)} size="sm"><UserPlus /> Adicionar administrador</Button>
          </div>
        )}

        {!showingAdministrators ? (
          <section aria-labelledby="company-participants-title" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 text-lg font-semibold tracking-tight" id="company-participants-title">
                Participantes <span className="font-normal text-muted-foreground tabular-nums">· {participantCount.toLocaleString('pt-BR')}</span>
              </h2>
              <Button onClick={() => setImporting(true)} size="sm" variant="outline"><FileSpreadsheet /> Importar participantes</Button>
            </div>
            {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <div aria-label="Filtros de participantes" className="flex flex-wrap items-center justify-between gap-3" role="group">
              <label className="relative flex min-w-0 flex-[1_1_20rem] items-center text-muted-foreground sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 size-4" />
                <Input aria-label="Buscar por nome ou login" className="pl-9" placeholder="Buscar por nome ou login" type="search"
                  value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
              </label>
              <label className="m-0 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input checked={includeInactive} className="size-4 accent-[var(--brand-primary)]" type="checkbox"
                  onChange={(event) => { setOffset(0); setIncludeInactive(event.target.checked); }} />
                Incluir participantes inativos
              </label>
            </div>

            {selected.size > 0 && <div aria-label="Ações para os selecionados" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2" role="group">
              <strong className="text-sm">{selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}</strong>
              {selectionHas(true) && <Button disabled={isChangingStatus} onClick={() => void changeStatus(false)} size="sm" variant="outline">Inativar</Button>}
              {selectionHas(false) && <Button disabled={isChangingStatus} onClick={() => void changeStatus(true)} size="sm" variant="outline">Reativar</Button>}
              <Button disabled={isChangingStatus} onClick={() => setSelected(new Set())} size="sm" variant="ghost">Limpar seleção</Button>
            </div>}

            {isLoading ? (
              <LoadingState className="list-state">Carregando participantes...</LoadingState>
            ) : page && page.items.length > 0 ? (
              <>
                <Table aria-label="Participantes da empresa">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" scope="col">
                        <input aria-label="Selecionar todos desta página" checked={allSelected} className="size-4 accent-[var(--brand-primary)]" type="checkbox"
                          onChange={() => setSelected(allSelected ? new Set() : new Set(pageIds))} />
                      </TableHead>
                      <TableHead scope="col">Nome</TableHead>
                      <TableHead className="max-sm:hidden" scope="col">Login</TableHead>
                      <TableHead scope="col">Conclusão</TableHead>
                      <TableHead className="max-md:hidden" scope="col">Status</TableHead>
                      <TableHead className="w-28" scope="col"><span className="sr-only">Histórico</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((employee) => (
                      <TableRow
                        className="cursor-pointer"
                        data-state={selected.has(employee.id) ? 'selected' : undefined}
                        key={employee.id}
                        // the whole row opens the history; checkboxes, buttons and the history dialog itself keep their own clicks
                        onClick={(event) => {
                          const target = event.target as HTMLElement;
                          if (!event.currentTarget.contains(target) || target.closest('input, button, a, label')) return;
                          event.currentTarget.querySelector<HTMLButtonElement>('.participant-outcomes-trigger')?.click();
                        }}
                      >
                        <TableCell>
                          <input aria-label={`Selecionar ${employee.displayName}`} checked={selected.has(employee.id)} className="size-4 accent-[var(--brand-primary)]" type="checkbox"
                            onChange={() => toggleOne(employee.id)} />
                        </TableCell>
                        <TableCell className="font-semibold">{employee.displayName}</TableCell>
                        <TableCell className="text-muted-foreground max-sm:hidden">{employee.loginIdentifier}</TableCell>
                        <TableCell>
                          <div
                            aria-label={`${employee.progressPercentage}% concluído; ${employee.completedLessonCount} de ${employee.lessonCount} aulas`}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={employee.progressPercentage}
                            className="flex items-center gap-2"
                            role="progressbar"
                          >
                            <span aria-hidden="true" className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${employee.progressPercentage}%` }} />
                            </span>
                            <strong className="text-sm tabular-nums">{employee.progressPercentage}%</strong>
                          </div>
                        </TableCell>
                        <TableCell className="max-md:hidden"><ActiveStatus isActive={employee.isActive} /></TableCell>
                        <TableCell className="py-2 pr-2 text-right"><ParticipantOutcomesPanel companyId={companyId} participantId={employee.id} participantName={employee.displayName} quiet /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {pageCount > 1 && <div aria-label="Paginação de participantes" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" role="group">
                  <span>Página {currentPage} de {pageCount} · {page.totalCount.toLocaleString('pt-BR')} resultados</span>
                  <div className="flex gap-2">
                    <Button disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(0, offset - pageSize))} size="sm" variant="outline">Anterior</Button>
                    <Button disabled={offset + pageSize >= page.totalCount || isLoading} onClick={() => setOffset(offset + pageSize)} size="sm" variant="outline">Próxima</Button>
                  </div>
                </div>}
              </>
            ) : (
              <EmptyState title={search ? 'Nenhum participante encontrado. Tente outro nome ou identificador.' : 'Nenhum participante para exibir.'} />
            )}
          </section>
        ) : (
          <section aria-labelledby="company-administrators-title" className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="m-0 text-lg font-semibold tracking-tight" id="company-administrators-title">
                  Administradores <span className="font-normal text-muted-foreground tabular-nums">· {administrators?.length ?? overview?.administratorCount ?? 0}</span>
                </h2>
                <p className="m-0 text-sm text-muted-foreground">Quem administra os treinamentos desta empresa: participantes, treinamentos e certificados.</p>
              </div>
              {!missingAdministrator && <Button onClick={() => setAddingAdmin(true)} variant="outline"><UserPlus /> Adicionar administrador</Button>}
            </div>
            {administrators === null ? (
              <LoadingState className="list-state">Carregando administradores...</LoadingState>
            ) : administrators.length === 0 ? (
              <EmptyState
                action={<Button onClick={() => setAddingAdmin(true)}><UserPlus /> Adicionar administrador</Button>}
                description="Sem um administrador, ninguém da empresa consegue gerenciar os treinamentos dela."
                title="Esta empresa ainda não tem administrador."
              />
            ) : (
              <Table aria-label="Administradores da empresa">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Nome</TableHead>
                    <TableHead scope="col">Login</TableHead>
                    <TableHead className="max-sm:hidden" scope="col">Papel</TableHead>
                    <TableHead scope="col">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {administrators.map((administrator) => (
                    <TableRow key={administrator.id}>
                      <TableCell className="font-semibold">{administrator.displayName}</TableCell>
                      <TableCell className="text-muted-foreground">{administrator.loginIdentifier}</TableCell>
                      <TableCell className="text-sm max-sm:hidden">
                        {administrator.roles.includes('SuperAdmin') ? 'Administrador principal' : 'Administrador'}
                      </TableCell>
                      <TableCell><ActiveStatus isActive={administrator.isActive} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        )}
      </Page>

      {importing && (
        <AddCollaboratorsDialog
          companyId={companyId}
          initialMode="sheet"
          onClose={() => setImporting(false)}
          onCreated={async (message) => {
            setImporting(false);
            setNotice(message);
            setOffset(0);
            setReload((value) => value + 1);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
      {addingAdmin && (
        <AddAdministratorDialog
          companyId={companyId}
          companyName={companyName || 'empresa'}
          onClose={() => setAddingAdmin(false)}
          onCreated={async (administrator) => {
            setAddingAdmin(false);
            setNotice(`${administrator.displayName} agora administra a ${companyName}.`);
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
