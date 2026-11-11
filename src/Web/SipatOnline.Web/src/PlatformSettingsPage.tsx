import type { IdentitySession, TenantBranding } from './api';

export default function PlatformSettingsPage({
  tenant,
  session,
}: {
  tenant: TenantBranding;
  session: IdentitySession;
}) {
  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">OPERAÇÃO DA PLATAFORMA</p>
          <h1>Configurações</h1>
          <p className="muted-copy">Informações gerais da operação e da conta administrativa.</p>
        </div>
      </div>

      <section aria-labelledby="platform-settings-account" className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONTA ADMINISTRATIVA</p>
            <h2 id="platform-settings-account">Super Admin</h2>
          </div>
        </div>
        <dl className="settings-list">
          <div><dt>Nome</dt><dd>{session.displayName}</dd></div>
          <div><dt>Login do Super Admin</dt><dd>sipat.online.admin</dd></div>
          <div><dt>Perfil técnico</dt><dd>PlatformOperator</dd></div>
        </dl>
        <p className="field-hint">
          A senha do operador é mantida na configuração segura do ambiente e nunca é exibida no portal.
        </p>
      </section>

      <section aria-labelledby="platform-settings-app" className="settings-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">APLICAÇÃO</p>
            <h2 id="platform-settings-app">Configurações do ambiente</h2>
          </div>
        </div>
        <dl className="settings-list">
          <div><dt>Produto</dt><dd>{tenant.tenantName}</dd></div>
          <div><dt>Host de operação</dt><dd>{window.location.host}</dd></div>
          <div><dt>Armazenamento de vídeo</dt><dd>Arquivo local do servidor (atual)</dd></div>
          <div><dt>Contas administrativas</dt><dd>Autenticação com senha e proteção contra tentativas repetidas</dd></div>
        </dl>
        <p className="platform-data-note">
          Os valores de implantação são gerenciados por configuração segura do servidor. Não há painel
          para alterar secrets, domínio ou armazenamento em produção.
        </p>
      </section>
    </div>
  );
}
