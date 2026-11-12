import { useState, type FormEvent } from 'react';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { createPlatformCompany, type PlatformCompany, type PlatformCompanyData } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

const emptyForm: PlatformCompanyData = { key: '', name: '', adminLoginIdentifier: '', adminDisplayName: '', adminPassword: '' };

/** Sugere o identificador do portal a partir do nome (sem acentos, minúsculo, com hífens). */
function suggestKey(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);
}

export default function CreateCompanyDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (company: PlatformCompany) => Promise<void>;
}) {
  const [form, setForm] = useState(emptyForm);
  const [keyEdited, setKeyEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field: keyof PlatformCompanyData, value: string) => setForm((current) => ({ ...current, [field]: value }));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const company = await createPlatformCompany({
        ...form,
        key: form.key.trim().toLowerCase(),
        name: form.name.trim(),
        adminLoginIdentifier: form.adminLoginIdentifier.trim(),
        adminDisplayName: form.adminDisplayName.trim(),
      });
      await onCreated(company);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog busy={isSaving} description="A empresa já nasce com o administrador que vai cuidar do SIPAT dela." onClose={onClose} size="lg" title="Nova empresa">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
          <legend className="mb-3 p-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Empresa</legend>
          <Field htmlFor="company-name" label="Nome da empresa">
            <Input autoComplete="organization" data-autofocus id="company-name" maxLength={150} required value={form.name}
              onChange={(event) => {
                update('name', event.target.value);
                if (!keyEdited) update('key', suggestKey(event.target.value));
              }} />
          </Field>
          <Field hint="Vira o endereço do portal: identificador.sipatonline.com.br" htmlFor="company-key" label="Identificador do portal">
            <Input autoCapitalize="none" autoComplete="off" id="company-key" maxLength={63}
              pattern="[A-Za-z0-9]+([A-Za-z0-9-]*[A-Za-z0-9])?" required
              title="Use letras, números e hífen; não comece ou termine com hífen." value={form.key}
              onChange={(event) => { setKeyEdited(true); update('key', event.target.value); }} />
          </Field>
        </fieldset>
        <fieldset className="m-0 grid gap-4 border-0 p-0 sm:grid-cols-2">
          <legend className="mb-3 p-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">Administrador</legend>
          <Field htmlFor="first-admin-name" label="Nome do administrador">
            <Input autoComplete="name" id="first-admin-name" maxLength={150} required value={form.adminDisplayName}
              onChange={(event) => update('adminDisplayName', event.target.value)} />
          </Field>
          <Field htmlFor="first-admin-login" label="Login do administrador">
            <Input autoComplete="username" id="first-admin-login" maxLength={128} required value={form.adminLoginIdentifier}
              onChange={(event) => update('adminLoginIdentifier', event.target.value)} />
          </Field>
          <Field className="sm:col-span-2" hint={`${passwordRulesHint} Entregue por um canal seguro: a senha não será exibida novamente.`}
            htmlFor="first-admin-password" label="Senha inicial temporária">
            <Input autoComplete="new-password" id="first-admin-password" minLength={passwordMinLength} required type="password" value={form.adminPassword}
              onChange={(event) => update('adminPassword', event.target.value)} />
          </Field>
        </fieldset>
        <DialogActions>
          <Button disabled={isSaving} onClick={onClose} variant="outline">Cancelar</Button>
          <Button disabled={isSaving} type="submit">{isSaving ? 'Cadastrando...' : 'Cadastrar empresa'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
