import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { useSearchParams } from 'react-router-dom';
import {
  createPlatformUser,
  listPlatformCompanies,
  listPlatformUsers,
  type PlatformCompany,
  type PlatformUserProvisionData,
  type PlatformUserDirectoryPage,
  type PlatformUserRoleFilter,
} from './api';
import { DataTable, Drawer, FilterBar, PageHeader, StatusChip } from './AdminComponents';
import LoadingState from './LoadingState';

const pageSize = 50;
const emptyUserForm: PlatformUserProvisionData = {
  tenantId: '',
  loginIdentifier: '',
  displayName: '',
  initialPassword: '',
  role: 'Participant',
};

export default function PlatformUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTenantId = searchParams.get('tenant') ?? '';
  const [page, setPage] = useState<PlatformUserDirectoryPage | null>(null);
  const [companies, setCompanies] = useState<PlatformCompany[]>([]);
  const [directoryCompanies, setDirectoryCompanies] = useState<PlatformCompany[]>([]);
  const [userForm, setUserForm] = useState({ ...emptyUserForm, tenantId: selectedTenantId });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<PlatformUserRoleFilter | ''>(() => getRoleFilter(searchParams.get('role')));
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const createUserButton = useRef<HTMLButtonElement>(null);
  const usersRequestSequence = useRef(0);

  const loadCompanies = useCallback(async () => {
    setIsLoadingCompanies(true);
    setError('');
    try {
      const allCompanies = await listPlatformCompanies();
      const activeCompanies = allCompanies.filter((company) => company.isActive);
      setDirectoryCompanies(allCompanies);
      setCompanies(activeCompanies);
      setUserForm((current) => ({
        ...current,
        tenantId: activeCompanies.some((company) => company.id === current.tenantId)
          ? current.tenantId
          : activeCompanies[0]?.id ?? '',
      }));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingCompanies(false);
    }
  }, []);

  const loadUsers = useCallback(async (nextOffset: number) => {
    const requestSequence = ++usersRequestSequence.current;
    setIsLoading(true);
    setError('');
    try {
      const result = await listPlatformUsers(
        nextOffset,
        pageSize,
        selectedTenantId || undefined,
        search,
        roleFilter || undefined,
      );
      if (requestSequence === usersRequestSequence.current) {
        setPage(result);
        setOffset(result.offset);
      }
    } catch (loadError) {
      if (requestSequence === usersRequestSequence.current) setError(getErrorMessage(loadError));
    } finally {
      if (requestSequence === usersRequestSequence.current) setIsLoading(false);
    }
  }, [roleFilter, search, selectedTenantId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    const requestSequence = ++usersRequestSequence.current;
    setIsLoading(true);
    const timer = window.setTimeout(() => void loadUsers(offset), search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      if (requestSequence === usersRequestSequence.current) usersRequestSequence.current += 1;
    };
  }, [loadUsers, offset, search]);

  useEffect(() => {
    if (selectedTenantId && !isLoadingCompanies &&
        !directoryCompanies.some((company) => company.id === selectedTenantId)) {
      setSearchParams((current) => {
        const updated = new URLSearchParams(current);
        updated.delete('tenant');
        return updated;
      }, { replace: true });
    }
  }, [directoryCompanies, isLoadingCompanies, selectedTenantId, setSearchParams]);

  useEffect(() => {
    if (companies.some((company) => company.id === selectedTenantId)) {
      setUserForm((current) => ({ ...current, tenantId: selectedTenantId }));
    }
  }, [companies, selectedTenantId]);

  const selectedCompany = directoryCompanies.find((company) => company.id === selectedTenantId);

  function selectDirectoryCompany(tenantId: string) {
    setError('');
    setOffset(0);
    setSearchParams((current) => {
      const updated = new URLSearchParams(current);
      if (tenantId) {
        updated.set('tenant', tenantId);
      } else {
        updated.delete('tenant');
      }
      return updated;
    });
    if (companies.some((company) => company.id === tenantId)) {
      setUserForm((current) => ({ ...current, tenantId }));
    } else if (!tenantId && companies.length > 0) {
      setUserForm((current) => ({ ...current, tenantId: companies[0].id }));
    }
  }

  function updateUserField(field: keyof PlatformUserProvisionData, value: string) {
    setUserForm((current) => ({ ...current, [field]: value }));
  }

  function openCreateUser() {
    setFormError('');
    setUserForm((current) => ({
      ...emptyUserForm,
      tenantId: current.tenantId || companies[0]?.id || '',
      role: roleFilter === 'ClientAdmin' || roleFilter === 'Supervisor' ? roleFilter : 'Participant',
    }));
    setIsFormOpen(true);
  }

  function handleGeneratePassword() {
    try {
      updateUserField('initialPassword', createStrongPassword());
      setFormError('');
    } catch (generationError) {
      setFormError(getErrorMessage(generationError));
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setFormError('');
    setNotice('');
    setIsSaving(true);

    try {
      const user = await createPlatformUser({
        ...userForm,
        loginIdentifier: userForm.loginIdentifier.trim(),
        displayName: userForm.displayName.trim(),
      });
      setUserForm((current) => ({
        ...emptyUserForm,
        tenantId: current.tenantId,
        role: current.role,
      }));
      setNotice(`${user.displayName} foi cadastrado em ${user.tenantName}.`);
      setIsFormOpen(false);
      await loadUsers(offset);
    } catch (saveError) {
      setFormError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-content platform-users-page">
      <PageHeader
        actions={(
          <button
            className="button button-primary"
            disabled={companies.length === 0 || isLoadingCompanies}
            onClick={openCreateUser}
            ref={createUserButton}
            type="button"
          >
            + Novo usuário
          </button>
        )}
        description={isLoading
          ? 'Carregando usuários...'
          : `${(page?.totalCount ?? 0).toLocaleString('pt-BR')} ${(page?.totalCount ?? 0) === 1 ? 'usuário' : 'usuários'} · Dados de autenticação nunca são exibidos.`}
        eyebrow="SIPAT.ONLINE.ADMIN"
        title="Usuários"
      />

      {error && (
        <div className="page-error" role="alert">
          <p className="form-error">{error}</p>
          <button
            className="button button-quiet"
            onClick={() => {
              void loadCompanies();
              void loadUsers(offset);
            }}
            type="button"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {notice && <p className="success-message" role="status">{notice}</p>}

      <FilterBar className="platform-user-filters" label="Filtros de usuários">
        <div className="field">
          <label htmlFor="platform-user-search">Buscar usuário</label>
          <input
            id="platform-user-search"
            onChange={(event) => {
              setOffset(0);
              setSearch(event.target.value);
            }}
            placeholder="Nome, login ou empresa"
            type="search"
            value={search}
          />
        </div>
        <div className="field">
          <label htmlFor="platform-directory-company">Empresa</label>
          <select
            id="platform-directory-company"
            onChange={(event) => selectDirectoryCompany(event.target.value)}
            value={selectedCompany ? selectedTenantId : ''}
          >
            <option value="">Todas as empresas</option>
            {directoryCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} · {company.key}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="platform-user-profile">Perfil</label>
          <select
            id="platform-user-profile"
            onChange={(event) => {
              setOffset(0);
              setRoleFilter(event.target.value as PlatformUserRoleFilter | '');
            }}
            value={roleFilter}
          >
            <option value="">Todos os perfis</option>
            <option value="Participant">Participante</option>
            <option value="ClientAdmin">Administrador da empresa</option>
            <option value="SuperAdmin">Superadministrador da empresa</option>
            <option value="Supervisor">Supervisor</option>
          </select>
        </div>
      </FilterBar>

      <section aria-labelledby="platform-users-heading" className="platform-user-directory">
        <div className="section-heading">
          <h2 id="platform-users-heading">Diretório de usuários</h2>
        </div>

        {isLoading ? (
          <LoadingState className="list-state">Carregando usuários...</LoadingState>
        ) : error ? null : (
          !page || page.items.length === 0 ? (
            <div className="empty-state">
              <h3>{search || roleFilter || selectedCompany
                ? 'Nenhum usuário corresponde aos filtros'
                : 'Nenhum usuário de empresa cadastrado'}</h3>
              <p>
                {search || roleFilter || selectedCompany
                  ? 'Ajuste a busca, a empresa ou o perfil para ver outros resultados.'
                  : 'As contas de empresas aparecerão aqui após serem provisionadas.'}
              </p>
            </div>
          ) : (
            <>
              <DataTable className="platform-user-table" label="Diretório de usuários das empresas">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Login</th>
                    <th scope="col">Empresa</th>
                    <th scope="col">Perfil</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.displayName}</strong></td>
                      <td>{user.loginIdentifier}</td>
                      <td>
                        {user.tenantName}
                        <small className="admin-table-secondary">{user.tenantKey}</small>
                      </td>
                      <td>{user.roles.length > 0
                        ? user.roles.map(getRoleLabel).join(', ')
                        : 'Sem perfil atribuído'}</td>
                      <td>
                        <StatusChip variant={user.isActive ? 'success' : 'neutral'}>
                          {user.isActive ? 'Ativo' : 'Inativo'}
                        </StatusChip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>

              {page.totalCount > pageSize && (
                <nav aria-label="Paginação de usuários" className="pagination">
                  <button
                    className="button button-quiet"
                    disabled={offset === 0 || isLoading}
                    onClick={() => setOffset(Math.max(0, offset - pageSize))}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span>
                    Página {Math.floor(offset / pageSize) + 1} de {Math.ceil(page.totalCount / pageSize)}
                    {' · '}{offset + 1}–{Math.min(offset + page.items.length, page.totalCount)}
                  </span>
                  <button
                    className="button button-quiet"
                    disabled={offset + pageSize >= page.totalCount || isLoading}
                    onClick={() => setOffset(offset + pageSize)}
                    type="button"
                  >
                    Próxima
                  </button>
                </nav>
              )}
            </>
          )
        )}
      </section>
      {isFormOpen && (
        <Drawer
          busy={isSaving}
          onClose={() => {
            if (!isSaving) setIsFormOpen(false);
          }}
          title="Novo usuário"
        >
          <p className="field-hint">A senha inicial não será exibida novamente. Entregue-a por um canal seguro.</p>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          {isLoadingCompanies ? (
            <LoadingState className="loading-state-compact">Carregando empresas...</LoadingState>
          ) : companies.length === 0 ? (
            <div className="empty-state">
              <p>Cadastre uma empresa antes de criar usuários.</p>
            </div>
          ) : (
            <form className="event-form event-form-single platform-user-form" onSubmit={handleCreateUser}>
              <div className="field">
                <label htmlFor="platform-user-company">Empresa</label>
                <select
                  data-autofocus
                  id="platform-user-company"
                  onChange={(event) => updateUserField('tenantId', event.target.value)}
                  required
                  value={userForm.tenantId}
                >
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name} · {company.key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="platform-user-role">Perfil</label>
                <select
                  id="platform-user-role"
                  onChange={(event) => updateUserField(
                    'role',
                    event.target.value as PlatformUserProvisionData['role'],
                  )}
                  value={userForm.role}
                >
                  <option value="Participant">Participante</option>
                  <option value="ClientAdmin">Administrador da empresa</option>
                  <option value="Supervisor">Supervisor (relatórios da empresa)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="platform-user-name">Nome completo</label>
                <input
                  autoComplete="name"
                  id="platform-user-name"
                  maxLength={150}
                  onChange={(event) => updateUserField('displayName', event.target.value)}
                  required
                  value={userForm.displayName}
                />
              </div>
              <div className="field">
                <label htmlFor="platform-user-login">Login</label>
                <input
                  autoComplete="off"
                  id="platform-user-login"
                  maxLength={128}
                  onChange={(event) => updateUserField('loginIdentifier', event.target.value)}
                  required
                  value={userForm.loginIdentifier}
                />
              </div>
              <div className="field">
                <label htmlFor="platform-user-password">Senha inicial temporária</label>
                <input
                  autoComplete="new-password"
                  id="platform-user-password"
                  minLength={passwordMinLength}
                  onChange={(event) => updateUserField('initialPassword', event.target.value)}
                  required
                  type="password"
                  value={userForm.initialPassword}
                />
                <button className="admin-link-button" onClick={handleGeneratePassword} type="button">
                  Gerar senha
                </button>
                <span className="field-hint">
                  {passwordRulesHint} Entregue-a por um canal seguro.
                </span>
              </div>
              <div className="form-actions">
                <button className="button button-primary" disabled={isSaving} type="submit">
                  {isSaving ? 'Cadastrando...' : 'Cadastrar usuário'}
                </button>
              </div>
            </form>
          )}
        </Drawer>
      )}
    </div>
  );
}

function getRoleLabel(role: string): string {
  switch (role) {
    case 'ClientAdmin':
      return 'Administrador da empresa';
    case 'SuperAdmin':
      return 'Superadministrador da empresa';
    case 'Participant':
      return 'Participante';
    case 'Supervisor':
      return 'Supervisor';
    default:
      return role;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}

function getRoleFilter(value: string | null): PlatformUserRoleFilter | '' {
  switch (value) {
    case 'Participant':
    case 'ClientAdmin':
    case 'SuperAdmin':
    case 'Supervisor':
      return value;
    default:
      return '';
  }
}

function createStrongPassword(): string {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Este navegador não permite gerar uma senha segura.');
  }

  const characterSets = [
    'abcdefghjkmnpqrstuvwxyz',
    'ABCDEFGHJKMNPQRSTUVWXYZ',
    '23456789',
    '!@#$%&*+-_=',
  ];
  const allCharacters = characterSets.join('');
  const randomValues = new Uint32Array(1);
  const randomIndex = (length: number) => {
    const range = 0x1_0000_0000;
    const limit = Math.floor(range / length) * length;
    let value = limit;
    while (value >= limit) {
      globalThis.crypto.getRandomValues(randomValues);
      value = randomValues[0] ?? 0;
    }
    return value % length;
  };
  const characters = characterSets.map((set) => set.charAt(randomIndex(set.length)));
  while (characters.length < 16) {
    characters.push(allCharacters.charAt(randomIndex(allCharacters.length)));
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const otherIndex = randomIndex(index + 1);
    [characters[index], characters[otherIndex]] = [characters[otherIndex], characters[index]];
  }
  return characters.join('');
}
