import { ChevronRight, LogIn, Search, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import CompanyLearningPanel from '@/CompanyLearningPanel';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Page, PageHeader, Stat } from '@/components/ui/page';
import CompanySipatTab from './CompanySipatTab';
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import LoadingState from '@/LoadingState';
import ParticipantOutcomesPanel from '@/ParticipantOutcomesPanel';
import AddAdministratorDialog from './AddAdministratorDialog';
import CompanyAvatar from './CompanyAvatar';

const pageSize = 50;

export default function CompanyPage() {
  const { companyId = '', section } = useParams<{ companyId: string; section?: string }>();
  const navigate = useNavigate();
  const tab = section === 'participantes' ? 'participants' : section === 'administradores' ? 'administrators' : 'sipat';
  const [page, setPage] = useState<PlatformCompanyEmployeePage | null>(null);
  const [overview, setOverview] = useState<PlatformCompanyOverview | null>(null);
  const [administrators, setAdministrators] = useState<PlatformUserSummary[] | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [notice, setNotice] = useState('');
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  useEffect(() => {
    let current = true;
    setSummaryError('');
    getPlatformDashboard()
      .then((companies) => { if (current) setOverview(companies.find((company) => company.id === companyId) ?? null); })
      .catch((loadError) => {
        if (!current) return;
        setOverview(null);
        setSummaryError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os indicadores da empresa.');
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

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setSearch(searchInput.trim());
  }

  const companyName = page?.companyName ?? overview?.name ?? '';
  const currentPage = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil((page?.totalCount ?? 0) / pageSize));

  return (
    <div className="page-content">
      <Page>
        <nav aria-label="Breadcrumb">
          <ol className="m-0 flex list-none items-center gap-1.5 p-0 text-sm text-muted-foreground">
            <li><Link className="text-muted-foreground no-underline hover:text-foreground" to="/platform">Empresas</Link></li>
            <li aria-hidden="true"><ChevronRight className="size-3.5" /></li>
            <li aria-current="page" className="font-medium text-foreground">{companyName || 'Empresa'}</li>
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-4">
          {companyName && <CompanyAvatar className="size-12 text-base" name={companyName} />}
          <PageHeader
            actions={(
              <>
                <a className={buttonVariants({ variant: 'default' })} href={`/admin/dashboard?companyId=${encodeURIComponent(companyId)}`}><LogIn /> Entrar como administrador</a>
                <CompanyLearningPanel companyId={companyId} />
                <CompanyCertificateLogoPanel companyId={companyId} />
              </>
            )}
            badge={overview && <Badge variant={overview.isActive ? 'success' : 'neutral'}>{overview.isActive ? 'Ativa' : 'Inativa'}</Badge>}
            className="flex-1"
            description={page ? `Identificador · ${page.companyKey}` : 'Carregando dados da empresa...'}
            title={companyName || (isLoading ? 'Carregando empresa...' : 'Participantes')}
          />
        </div>

        {notice && <p className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success" role="status">{notice}</p>}
        {summaryError && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{summaryError}</p>}

        {(page || overview) && (
          <section aria-label="Resumo da empresa" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
            <Stat hint={overview ? 'Ativos' : 'Na listagem atual'} label="Participantes"
              value={(overview?.employeeCount ?? page?.totalCount ?? 0).toLocaleString('pt-BR')} />
            {overview && (
              <Stat hint={overview.administratorCount === 0 ? 'Adicione quem vai cuidar do SIPAT' : 'Com acesso de administração'}
                label="Administradores" value={overview.administratorCount.toLocaleString('pt-BR')} />
            )}
          </section>
        )}

        <Tabs onValueChange={value => navigate(`/platform/companies/${companyId}${value === 'participants' ? '/participantes' : value === 'administrators' ? '/administradores' : ''}`)} value={tab}>
          <TabsList aria-label="Seções da empresa">
            <TabsTrigger value="sipat">Construção SIPAT</TabsTrigger>
            <TabsTrigger value="participants">Participantes <TabCount>{page?.totalCount ?? 0}</TabCount></TabsTrigger>
            <TabsTrigger value="administrators">Administradores <TabCount>{administrators?.length ?? overview?.administratorCount ?? 0}</TabCount></TabsTrigger>
          </TabsList>

          <TabsContent value="sipat">
            <CompanySipatTab companyId={companyId} />
          </TabsContent>

          <TabsContent value="participants">
            {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <section aria-label="Filtros de participantes" className="flex flex-wrap items-center justify-between gap-3">
              <form className="flex min-w-0 flex-[1_1_20rem] gap-2" onSubmit={handleSearch}>
                <label className="relative flex min-w-0 flex-1 items-center text-muted-foreground sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 size-4" />
                  <Input aria-label="Buscar por nome ou login" className="pl-9" placeholder="Buscar por nome ou login" type="search"
                    value={searchInput} onChange={(event) => setSearchInput(event.target.value)} />
                </label>
                <Button type="submit" variant="outline">Buscar</Button>
              </form>
              <label className="m-0 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input checked={includeInactive} className="size-4 accent-[var(--brand-primary)]" type="checkbox"
                  onChange={(event) => { setOffset(0); setIncludeInactive(event.target.checked); }} />
                Incluir participantes inativos
              </label>
            </section>

            {selected.size > 0 && <div aria-label="Ações para os selecionados" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2" role="group">
              <strong className="text-sm">{selected.size} {selected.size === 1 ? 'selecionado' : 'selecionados'}</strong>
              <Button disabled={isChangingStatus} onClick={() => void changeStatus(false)} size="sm" variant="outline">Inativar</Button>
              <Button disabled={isChangingStatus} onClick={() => void changeStatus(true)} size="sm" variant="outline">Reativar</Button>
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
                      <TableHead scope="col">Atividades e certificados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((employee) => (
                      <TableRow data-state={selected.has(employee.id) ? 'selected' : undefined} key={employee.id}>
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
                            className="flex min-w-32 items-center gap-2.5"
                            role="progressbar"
                          >
                            <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${employee.progressPercentage}%` }} />
                            </span>
                            <strong className="w-10 text-right text-sm tabular-nums">{employee.progressPercentage}%</strong>
                          </div>
                        </TableCell>
                        <TableCell className="max-md:hidden">
                          <Badge variant={employee.isActive ? 'success' : 'neutral'}>{employee.isActive ? 'Ativo' : 'Inativo'}</Badge>
                        </TableCell>
                        <TableCell><ParticipantOutcomesPanel companyId={companyId} participantId={employee.id} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div aria-label="Paginação de participantes" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground" role="group">
                  <span>Página {currentPage} de {pageCount} · {page.totalCount.toLocaleString('pt-BR')} resultados</span>
                  <div className="flex gap-2">
                    <Button disabled={offset === 0 || isLoading} onClick={() => setOffset(Math.max(0, offset - pageSize))} size="sm" variant="outline">Anterior</Button>
                    <Button disabled={offset + pageSize >= page.totalCount || isLoading} onClick={() => setOffset(offset + pageSize)} size="sm" variant="outline">Próxima</Button>
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title={search ? 'Nenhum participante encontrado. Tente outro nome ou identificador.' : 'Nenhum participante para exibir.'} />
            )}
          </TabsContent>

          <TabsContent value="administrators">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-sm text-muted-foreground">Quem administra o SIPAT desta empresa: participantes, cursos e certificados.</p>
              <Button onClick={() => setAddingAdmin(true)} variant="outline"><UserPlus /> Adicionar administrador</Button>
            </div>
            {administrators === null ? (
              <LoadingState className="list-state">Carregando administradores...</LoadingState>
            ) : administrators.length === 0 ? (
              <EmptyState
                action={<Button onClick={() => setAddingAdmin(true)}><UserPlus /> Adicionar administrador</Button>}
                description="Sem um administrador, ninguém da empresa consegue gerenciar o SIPAT dela."
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
                      <TableCell><Badge variant={administrator.isActive ? 'success' : 'neutral'}>{administrator.isActive ? 'Ativo' : 'Inativo'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </Page>

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
