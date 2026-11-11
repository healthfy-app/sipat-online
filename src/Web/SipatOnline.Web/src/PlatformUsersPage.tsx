import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createPlatformUser,
  listPlatformCompanies,
  listPlatformUsers,
  type PlatformCompany,
  type PlatformUserProvisionData,
  type PlatformUserDirectoryPage,
} from './api';
import { DataTable, Drawer, PageHeader, StatusChip } from './AdminComponents';

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
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

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
    setIsLoading(true);
    setError('');
    try {
      const result = await listPlatformUsers(
        nextOffset,
        pageSize,
        selectedTenantId || undefined,
      );
      setPage(result);
      setOffset(result.offset);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    void loadUsers(offset);
  }, [loadUsers, offset]);

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
  }

  function updateUserField(field: keyof PlatformUserProvisionData, value: string) {
    setUserForm((current) => ({ ...current, [field]: value }));
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
      await loadUsers(offset);
      setIsFormOpen(false);
    } catch (saveError) {
      setFormError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-content platform-users-page">
      <PageHeader
        actions={<button className="button button-primary" onClick={() => {
          setFormError('');
          setIsFormOpen(true);
        }} type="button">+ Novo usuário</button>}
        description={`${(page?.totalCount ?? 0).toLocaleString('pt-BR')} ${(page?.totalCount ?? 0) === 1 ? 'usuário' : 'usuários'} · Dados de autenticação nunca são exibidos.`}
        eyebrow="PLATAFORMA"
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

      <section aria-label="Empresa selecionada" className="platform-company-selector form-card">
        <div className="platform-company-selector-copy">
          <p className="eyebrow">EMPRESA</p>
          <h2>{selectedCompany?.name ?? 'Todas as empresas'}</h2>
          <p className="muted-copy">
            {selectedCompany
              ? `${selectedCompany.key} · ${selectedCompany.isActive ? 'Ativa' : 'Inativa'}`
              : `${directoryCompanies.length.toLocaleString('pt-BR')} ${directoryCompanies.length === 1 ? 'empresa no' : 'empresas no'} diretório global`}
          </p>
        </div>
        <div className="field">
          <label htmlFor="platform-directory-company">Exibir usuários de</label>
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
      </section>

      <section aria-labelledby="platform-users-heading" className="platform-user-directory">
        <div className="section-heading">
          <h2 id="platform-users-heading">Diretório de usuários</h2>
          <span className="count-label">
            {page?.totalCount ?? 0} {page?.totalCount === 1 ? 'usuário' : 'usuários'}
          </span>
        </div>

      {isLoading ? (
        <LoadingState className="list-state">Carregando usuários...</LoadingState>
      ) : error ? null : (
        !page || page.items.length === 0 ? (
          <div className="empty-state">
            <h3>{selectedCompany ? 'Nenhum usuário nesta empresa' : 'Nenhum usuário de empresa cadastrado'}</h3>
            <p>
              {selectedCompany
                ? 'Os usuários desta empresa aparecerão aqui após serem cadastrados.'
                : 'As contas de empresas aparecerão aqui após serem provisionadas.'}
            </p>
          </div>
        ) : (
          <>
            <DataTable label="Diretório de usuários das empresas">
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Matrícula</th>
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
                  disabled={offset === 0}
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
                  disabled={offset + pageSize >= page.totalCount}
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
          onClose={() => setIsFormOpen(false)}
          title="Cadastrar usuário em uma empresa"
        >
          <p className="field-hint">A senha inicial não será exibida novamente. Entregue-a por um canal seguro.</p>
          {isLoadingCompanies ? (
            <LoadingState className="list-state">Carregando empresas...</LoadingState>
          ) : companies.length === 0 ? (
            <div className="empty-state"><p>Cadastre uma empresa antes de criar usuários.</p></div>
          ) : (
            <form className="event-form event-form-single" onSubmit={handleCreateUser}>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="field">
                <label htmlFor="platform-user-company">Empresa</label>
                <select
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
                <label htmlFor="platform-user-login">Matrícula</label>
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
                  minLength={12}
                  onChange={(event) => updateUserField('initialPassword', event.target.value)}
                  required
                  type="password"
                  value={userForm.initialPassword}
                />
                <span className="field-hint">Use uma senha forte e entregue-a por um canal seguro.</span>
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
import LoadingState from './LoadingState';
