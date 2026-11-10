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
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
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
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUPER ADMIN SIPAT ONLINE</p>
          <h1>Usuários das empresas</h1>
          <p className="muted-copy">
            Consulte os acessos das empresas cadastradas. Dados de autenticação nunca são exibidos.
          </p>
        </div>
        <span className="count-label">
          {page?.totalCount ?? 0} {page?.totalCount === 1 ? 'usuário' : 'usuários'}
        </span>
      </div>

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

      <section aria-labelledby="platform-user-form-title" className="form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NOVO ACESSO</p>
            <h2 id="platform-user-form-title">Cadastrar usuário em uma empresa</h2>
          </div>
          <span className="draft-note">A senha não será exibida novamente</span>
        </div>
        {isLoadingCompanies ? (
          <p className="list-state" aria-live="polite">Carregando empresas...</p>
        ) : companies.length === 0 ? (
          <div className="empty-state">
            <p>Cadastre uma empresa antes de criar usuários.</p>
          </div>
        ) : (
          <form className="event-form" onSubmit={handleCreateUser}>
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
            <div className="field full-width">
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
              <span className="field-hint">
                Use uma senha forte e entregue-a por um canal seguro.
              </span>
            </div>
            <div className="form-actions full-width">
              <button className="button button-primary" disabled={isSaving} type="submit">
                {isSaving ? 'Cadastrando...' : 'Cadastrar usuário'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section aria-label="Empresa selecionada" className="platform-company-selector form-card">
        <div className="platform-company-selector-copy">
          <p className="eyebrow">EMPRESA</p>
          <h2>{selectedCompany?.name ?? 'Todas as empresas'}</h2>
          <p className="muted-copy">
            {selectedCompany
              ? `${selectedCompany.key} · ${selectedCompany.isActive ? 'Ativa' : 'Inativa'}`
              : `${directoryCompanies.length} empresas no diretório global`}
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
          <div>
            <p className="eyebrow">DIRETÓRIO</p>
            <h2 id="platform-users-heading">Usuários</h2>
          </div>
          <span className="count-label">
            {page?.totalCount ?? 0} {page?.totalCount === 1 ? 'usuário' : 'usuários'}
          </span>
        </div>

      {isLoading ? (
        <p className="list-state" aria-live="polite">Carregando usuários...</p>
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
            <div aria-label="Diretório de usuários das empresas" className="platform-user-grid">
              {page.items.map((user) => (
                <article className="platform-user-card" key={user.id}>
                  <div className="platform-user-card-heading">
                    <span className={`status-pill${user.isActive ? ' status-active' : ''}`}>
                      {user.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="platform-user-role">
                      {user.roles.length > 0
                        ? user.roles.map(getRoleLabel).join(', ')
                        : 'Sem perfil atribuído'}
                    </span>
                  </div>
                  <div className="platform-user-card-copy">
                    <p className="platform-user-company">{user.tenantName} · {user.tenantKey}</p>
                    <h3>{user.displayName}</h3>
                    <p className="muted-copy">Matrícula: {user.loginIdentifier}</p>
                  </div>
                </article>
              ))}
            </div>

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
