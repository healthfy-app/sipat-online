import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  createPlatformCompany,
  type PlatformCompanyData,
} from './api';
import { PageHeader } from './AdminComponents';

const emptyForm: PlatformCompanyData = {
  key: '',
  name: '',
  adminLoginIdentifier: '',
  adminDisplayName: '',
  adminPassword: '',
};

export default function PlatformCompaniesPage() {
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function updateField(field: keyof PlatformCompanyData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsSaving(true);

    try {
      const company = await createPlatformCompany({
        ...form,
        key: form.key.trim().toLowerCase(),
        name: form.name.trim(),
        adminLoginIdentifier: form.adminLoginIdentifier.trim(),
        adminDisplayName: form.adminDisplayName.trim(),
      });
      setForm(emptyForm);
      setNotice(`${company.name} foi cadastrada e o administrador inicial foi criado.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-content platform-admin-page">
      <PageHeader
        actions={<Link className="button button-secondary" to="/platform">← Empresas</Link>}
        description="Cadastre a empresa e entregue o acesso inicial ao administrador."
        eyebrow="NOVA EMPRESA"
        title="Cadastrar empresa"
      />

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-labelledby="company-form-title" className="form-card">
        <div className="section-heading">
          <div>
            <h2 id="company-form-title">Dados da empresa e do primeiro administrador</h2>
          </div>
          <span className="draft-note">O identificador define o subdomínio.</span>
        </div>
        <form className="event-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="company-name">Nome da empresa</label>
            <input
              autoComplete="organization"
              id="company-name"
              maxLength={150}
              onChange={(event) => updateField('name', event.target.value)}
              required
              value={form.name}
            />
          </div>
          <div className="field">
            <label htmlFor="company-key">Identificador do portal</label>
            <input
              autoCapitalize="none"
              autoComplete="off"
              id="company-key"
              maxLength={63}
              onChange={(event) => updateField('key', event.target.value)}
              pattern="[A-Za-z0-9]+([A-Za-z0-9-]*[A-Za-z0-9])?"
              required
              title="Use letras, números e hífen; não comece ou termine com hífen."
              value={form.key}
            />
            <span className="field-hint">Use um identificador único, sem espaços.</span>
          </div>
          <div className="field">
            <label htmlFor="first-admin-name">Nome do administrador</label>
            <input
              autoComplete="name"
              id="first-admin-name"
              maxLength={150}
              onChange={(event) => updateField('adminDisplayName', event.target.value)}
              required
              value={form.adminDisplayName}
            />
          </div>
          <div className="field">
            <label htmlFor="first-admin-login">Matrícula do administrador</label>
            <input
              autoComplete="username"
              id="first-admin-login"
              maxLength={128}
              onChange={(event) => updateField('adminLoginIdentifier', event.target.value)}
              required
              value={form.adminLoginIdentifier}
            />
          </div>
          <div className="field full-width">
            <label htmlFor="first-admin-password">Senha inicial temporária</label>
            <input
              autoComplete="new-password"
              id="first-admin-password"
              minLength={12}
              onChange={(event) => updateField('adminPassword', event.target.value)}
              required
              type="password"
              value={form.adminPassword}
            />
            <span className="field-hint">
              Entregue por um canal seguro. A senha não será exibida novamente.
            </span>
          </div>
          <div className="form-actions full-width">
            <button className="button button-primary" disabled={isSaving} type="submit">
              {isSaving ? 'Cadastrando...' : 'Cadastrar empresa e administrador'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
