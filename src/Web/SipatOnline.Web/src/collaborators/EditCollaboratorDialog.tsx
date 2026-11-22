import { KeyRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  changeEmployeeLogin, changeUserStatus, renameUser, resetEmployeePassword, saveParticipantProfile,
  type CompanyRegistry, type ParticipantAccount, type ParticipantProfile, type RegistryItem,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { generateInitialPassword } from '@/participantCsv';

const requiredMark = ' (obrigatório nesta empresa)';
const mark = (required?: boolean) => (required ? requiredMark : '');

/** The active items plus the current one, even deactivated: whoever is in it stays in it until moved. */
const choices = (items: RegistryItem[], current: string) => items.filter(item => item.isActive || item.id === current);

function PlacementSelect({ id, label, empty, items, value, onChange }: {
  id: string; label: string; empty: string; items: RegistryItem[]; value: string; onChange: (value: string) => void;
}) {
  return <Field htmlFor={id} label={label}>
    <NativeSelect id={id} onChange={event => onChange(event.target.value)} value={value}>
      <option value="">{empty}</option>
      {choices(items, value).map(item => <option key={item.id} value={item.id}>{item.name}{item.isActive ? '' : ' (desativado)'}</option>)}
    </NativeSelect>
  </Field>;
}

/**
 * Everything the administrator can correct about a collaborator in one place: name, login, a new password, whether the
 * access is active and, when the profile is known, registration number, e-mail, phone, unit and sector. Only what changed
 * is sent. The fields the company made required are flagged but do not block saving: the rule applies on creation.
 */
export default function EditCollaboratorDialog({ person, profile, registry, onClose, onSaved }: {
  person: ParticipantAccount; profile?: ParticipantProfile; registry?: CompanyRegistry | null;
  onClose: () => void; onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState(person.displayName);
  const [login, setLogin] = useState(person.loginIdentifier);
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(person.isActive);
  const [registration, setRegistration] = useState(profile?.registrationNumber ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [unitId, setUnitId] = useState(profile?.unitId ?? '');
  const [sectorId, setSectorId] = useState(profile?.sectorId ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameChanged = name.trim() !== person.displayName;
  const loginChanged = login.trim() !== person.loginIdentifier;
  const statusChanged = active !== person.isActive;
  const profileChanged = !!profile && (
    registration.trim() !== (profile.registrationNumber ?? '') || email.trim() !== (profile.email ?? '') || phone.trim() !== (profile.phone ?? '')
    || unitId !== (profile.unitId ?? '') || sectorId !== (profile.sectorId ?? ''));
  const changed = nameChanged || loginChanged || statusChanged || password !== '' || profileChanged;
  const rules = registry?.rules;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !login.trim()) { setError('Informe o nome e o login do colaborador.'); return; }
    setBusy(true); setError('');
    const done: string[] = [];
    try {
      if (nameChanged) { await renameUser(person.id, name.trim()); done.push('nome'); }
      if (loginChanged) { await changeEmployeeLogin(person.id, login.trim()); done.push('login'); }
      if (password !== '') { await resetEmployeePassword(person.id, password); done.push('senha'); }
      if (statusChanged) { await changeUserStatus(person.id, active); done.push(active ? 'acesso reativado' : 'acesso inativado'); }
      if (profileChanged) {
        await saveParticipantProfile(person.id, {
          registrationNumber: registration.trim() || null, email: email.trim() || null, phone: phone.trim() || null,
          unitId: unitId || null, sectorId: sectorId || null,
        });
        done.push('cadastro');
      }
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
      <Field hint="É o que o colaborador digita para entrar." htmlFor="edit-login" label="Login">
        <Input autoCapitalize="none" autoComplete="off" id="edit-login" maxLength={128} onChange={event => setLogin(event.target.value)} value={login} />
      </Field>
      {profile && <>
        <Field htmlFor="edit-registration" label={`Matrícula${mark(rules?.requireRegistration)}`}>
          <Input autoCapitalize="characters" autoComplete="off" id="edit-registration" maxLength={64} onChange={event => setRegistration(event.target.value)} value={registration} />
        </Field>
        <Field htmlFor="edit-email" label={`E-mail${mark(rules?.requireEmail)}`}>
          <Input autoCapitalize="none" autoComplete="off" id="edit-email" maxLength={200} onChange={event => setEmail(event.target.value)} type="email" value={email} />
        </Field>
        <Field htmlFor="edit-phone" label={`Telefone${mark(rules?.requirePhone)}`}>
          <Input autoComplete="off" id="edit-phone" inputMode="tel" maxLength={32} onChange={event => setPhone(event.target.value)} type="tel" value={phone} />
        </Field>
        {registry && registry.units.length > 0
          && <PlacementSelect empty="Sem unidade" id="edit-unit" items={registry.units} label={`Unidade${mark(rules?.requireUnit)}`} onChange={setUnitId} value={unitId} />}
        {registry && registry.sectors.length > 0
          && <PlacementSelect empty="Sem setor" id="edit-sector" items={registry.sectors} label={`Setor${mark(rules?.requireSector)}`} onChange={setSectorId} value={sectorId} />}
      </>}
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
