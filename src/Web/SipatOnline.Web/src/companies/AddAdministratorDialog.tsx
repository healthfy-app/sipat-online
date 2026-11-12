import { useState, type FormEvent } from 'react';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { createPlatformUser, type PlatformUserSummary } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

/** Cria um administrador para a empresa, sem sair da tela onde a pessoa está. */
export default function AddAdministratorDialog({
  companyId,
  companyName,
  onClose,
  onCreated,
}: {
  companyId: string;
  companyName: string;
  onClose: () => void;
  onCreated: (administrator: PlatformUserSummary) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState('');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const administrator = await createPlatformUser({
        tenantId: companyId,
        displayName: displayName.trim(),
        loginIdentifier: loginIdentifier.trim(),
        initialPassword,
        role: 'ClientAdmin',
      });
      await onCreated(administrator);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog busy={isSaving} description={`Quem vai administrar o SIPAT da ${companyName}.`} onClose={onClose} title="Adicionar administrador">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        <Field htmlFor="admin-name" label="Nome">
          <Input autoComplete="name" data-autofocus id="admin-name" maxLength={150} required value={displayName}
            onChange={(event) => setDisplayName(event.target.value)} />
        </Field>
        <Field htmlFor="admin-login" label="Login">
          <Input autoComplete="username" id="admin-login" maxLength={128} required value={loginIdentifier}
            onChange={(event) => setLoginIdentifier(event.target.value)} />
        </Field>
        <Field hint={`${passwordRulesHint} Entregue por um canal seguro.`} htmlFor="admin-password" label="Senha inicial temporária">
          <Input autoComplete="new-password" id="admin-password" minLength={passwordMinLength} required type="password" value={initialPassword}
            onChange={(event) => setInitialPassword(event.target.value)} />
        </Field>
        <DialogActions>
          <Button disabled={isSaving} onClick={onClose} variant="outline">Cancelar</Button>
          <Button disabled={isSaving} type="submit">{isSaving ? 'Adicionando...' : 'Adicionar administrador'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
