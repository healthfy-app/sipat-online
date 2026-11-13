import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { changeEmployeeLogin, changeUserStatus, renameUser, resetEmployeePassword, type ParticipantAccount } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { generateInitialPassword } from '@/participantCsv';

/**
 * Everything the administrator can correct about a collaborator in one place: name, registration (login), a new
 * password and whether the access is active. Only what changed is sent.
 */
export default function EditCollaboratorDialog({ person, onClose, onSaved }: {
  person: ParticipantAccount; onClose: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(person.displayName);
  const [login, setLogin] = useState(person.loginIdentifier);
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(person.isActive);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameChanged = name.trim() !== person.displayName;
  const loginChanged = login.trim() !== person.loginIdentifier;
  const statusChanged = active !== person.isActive;
  const changed = nameChanged || loginChanged || statusChanged || password !== '';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !login.trim()) { setError('Informe o nome e a matrícula do colaborador.'); return; }
    setBusy(true); setError('');
    const done: string[] = [];
    try {
      if (nameChanged) { await renameUser(person.id, name.trim()); done.push('nome'); }
      if (loginChanged) { await changeEmployeeLogin(person.id, login.trim()); done.push('matrícula'); }
      if (password !== '') { await resetEmployeePassword(person.id, password); done.push('senha'); }
      if (statusChanged) { await changeUserStatus(person.id, active); done.push(active ? 'acesso reativado' : 'acesso inativado'); }
      await onSaved(`Dados de ${name.trim()} atualizados (${done.join(', ')}).`);
    } catch (failure) {
      // what was saved before the failure stays saved: say so, so the administrator does not repeat it
      setError(`${getErrorMessage(failure)}${done.length > 0 ? ` Já foi salvo: ${done.join(', ')}.` : ''}`);
      setBusy(false);
    }
  }

  return <Dialog busy={busy} description="Corrija os dados do colaborador. A senha só muda se você preencher o campo." onClose={onClose} title="Editar colaborador">
    <form className="grid gap-4" onSubmit={save}>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <Field htmlFor="edit-name" label="Nome">
        <Input autoComplete="off" data-autofocus id="edit-name" maxLength={200} onChange={event => setName(event.target.value)} value={name} />
      </Field>
      <Field hint="É o que o colaborador digita para entrar." htmlFor="edit-login" label="Matrícula (login)">
        <Input autoCapitalize="none" autoComplete="off" id="edit-login" maxLength={128} onChange={event => setLogin(event.target.value)} value={login} />
      </Field>
      <Field hint={`${passwordRulesHint} Entregue a nova senha por um canal seguro: ela não aparece de novo.`} htmlFor="edit-password" label="Nova senha (opcional)">
        <div className="flex gap-2">
          <Input autoComplete="new-password" className="flex-1" id="edit-password" minLength={passwordMinLength} onChange={event => setPassword(event.target.value)}
            placeholder="Deixe em branco para manter" type={showPassword ? 'text' : 'password'} value={password} />
          <Button onClick={() => { setPassword(generateInitialPassword()); setShowPassword(true); }} type="button" variant="outline"><KeyRound /> Gerar</Button>
        </div>
      </Field>
      <label className="m-0 flex cursor-pointer items-center gap-2.5 text-sm font-medium">
        <input checked={active} className="size-4 accent-[var(--brand-primary)]" onChange={event => setActive(event.target.checked)} type="checkbox" />
        Acesso ativo
        <span className="font-normal text-muted-foreground">· desmarque para impedir a entrada, mantendo o histórico</span>
      </label>
      <DialogActions>
        <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
        <Button disabled={busy || !changed} type="submit">{busy ? 'Salvando...' : 'Salvar alterações'}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}
