import { FileSpreadsheet } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { getCompanyRegistry, importParticipants, type CompanyRegistry, type ImportResult, type ImportRow } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import { serializeCredentialCsv } from '@/participantCsv';
import { cn } from '@/lib/utils';
import { downloadCsv } from './csvFile';
import { downloadTemplate, IMPORT_SAVE_CHUNK, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, missingInRow, readSheet } from './importSheet';

const emptyForm = { name: '', registrationNumber: '', login: '', email: '', phone: '', unit: '', sector: '', password: '' };
type Mode = 'single' | 'sheet';
/** `rows` are the lines sent to the server; `result.rejected` also lists the lines refused here (a required cell empty). */
type Preview = { rows: ImportRow[]; columns: (keyof ImportRow)[]; result: ImportResult };

const columnLabels: Partial<Record<keyof ImportRow, string>> = {
  login: 'Login', password: 'Senha', name: 'Nome completo', registrationNumber: 'Matrícula', email: 'E-mail', phone: 'Telefone',
  unit: 'Unidade empresarial', sector: 'Setor',
};

const chunksOf = (rows: ImportRow[]) =>
  Array.from({ length: Math.ceil(rows.length / IMPORT_SAVE_CHUNK) }, (_, index) => rows.slice(index * IMPORT_SAVE_CHUNK, (index + 1) * IMPORT_SAVE_CHUNK));

const stopMessage = (row: number) =>
  `A carga parou na linha ${row}. As pessoas já gravadas estão no arquivo de acessos. Tente de novo para gravar o restante.`;

const sum = (total: ImportResult | null, part: ImportResult): ImportResult => total === null ? part : {
  created: total.created + part.created, updated: total.updated + part.updated, unchanged: total.unchanged + part.unchanged,
  rejected: [...total.rejected, ...part.rejected], credentials: [...total.credentials, ...part.credentials],
};

/**
 * Adds collaborators: one at a time, or many from the HR sheet (CSV or Excel) with a preview before saving.
 * `companyId` is set when the platform operator adds them to a company from the operation portal.
 */
export default function AddCollaboratorsDialog({ onClose, onCreated, companyId, initialMode = 'single' }: {
  onClose: () => void; onCreated: (message: string) => Promise<void>; companyId?: string; initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  // one person: the outcome; the sheet: what the chunks confirmed so far (all of it once `savedChunks` reaches the end)
  const [result, setResult] = useState<ImportResult | null>(null);
  const [savedChunks, setSavedChunks] = useState(0);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState<{ saved: number; total: number } | null>(null);
  const [passwords, setPasswords] = useState<Map<number, string>>(new Map());
  const [singleMessage, setSingleMessage] = useState('');
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => { void getCompanyRegistry(companyId).then(setRegistry, () => undefined); }, [companyId]);

  const field = (key: keyof typeof emptyForm) => ({
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value })),
    value: form[key],
  });
  const activeUnits = registry?.units.filter(unit => unit.isActive) ?? [];
  const activeSectors = registry?.sectors.filter(sector => sector.isActive) ?? [];

  async function createOne(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    const row: ImportRow = { row: 1, password: form.password };
    (['name', 'login', 'registrationNumber', 'email', 'phone', 'unit', 'sector'] as const).forEach(key => {
      const value = form[key].trim();
      if (value) row[key] = value;
    });
    try {
      // the form creates: someone who already exists is refused, never overwritten
      const outcome = await importParticipants(false, [row], { createOnly: true, companyId });
      if (outcome.rejected.length) { setError(outcome.rejected[0].message); return; }
      const created = outcome.credentials[0];
      if (!created) { setError('Não foi possível adicionar o colaborador. Tente de novo.'); return; }
      setSingleMessage(`${created.name} foi adicionada. Login: ${created.login}.`);
      setResult(outcome);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setFileName(file.name); setPreview(null); setFileError(''); setError('');
    if (file.size > MAX_IMPORT_BYTES) { setFileError('O arquivo excede o limite de 5 MiB.'); return; }
    setBusy(true);
    try {
      const sheet = await readSheet(file);
      if (sheet.fatalError) { setFileError(sheet.fatalError); return; }
      // login, password and full name are required on every line: one left empty is refused here, with the reason
      const refused = sheet.rows.flatMap(row => {
        const message = missingInRow(row);
        return message ? [{ row: row.row, login: row.login ?? null, message }] : [];
      });
      const rows = sheet.rows.filter(row => !missingInRow(row));
      setPasswords(new Map(rows.map(row => [row.row, row.password ?? ''] as const)));
      const checked = rows.length > 0
        ? await importParticipants(true, rows, { companyId })
        : { created: 0, updated: 0, unchanged: 0, rejected: [], credentials: [] };
      const rejected = [...refused, ...checked.rejected].sort((a, b) => a.row - b.row);
      setPreview({ rows, columns: sheet.columns, result: { ...checked, rejected } });
    } catch (failure) {
      setFileError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  /**
   * Saves the sheet in chunks, one after the other, so each call fits the server's timeout. A chunk that fails stops the
   * load: what was saved stays (and its accesses can be downloaded), and trying again sends only the chunks not confirmed.
   */
  async function save() {
    if (!preview) return;
    const chunks = chunksOf(preview.rows);
    setBusy(true); setError(''); setStoppedAt(null);
    let total = result;
    let index = savedChunks;
    try {
      for (; index < chunks.length; index++) {
        setSaving({ saved: index * IMPORT_SAVE_CHUNK, total: preview.rows.length });
        const part = await importParticipants(false, chunks[index], { companyId });
        total = sum(total, part);
        setResult(total);
        setSavedChunks(index + 1);
        // a file downloaded before these people were saved does not have their passwords
        if (part.credentials.length > 0) setDownloaded(false);
      }
    } catch (failure) {
      // nothing saved yet: the same as a single call failing, and "Confirmar carga" tries again
      if (index === 0) setError(getErrorMessage(failure));
      else {
        const row = chunks[index][0].row;
        setStoppedAt(row);
        setError(stopMessage(row));
      }
    } finally { setBusy(false); setSaving(null); }
  }

  function downloadCredentials() {
    if (!result) return;
    const entries = result.credentials.map(credential => ({
      displayName: credential.name, loginIdentifier: credential.login, initialPassword: passwords.get(credential.row) ?? '',
    }));
    downloadCsv(`acessos-colaboradores-${new Date().toISOString().slice(0, 10)}.csv`, serializeCredentialCsv(entries, `${window.location.origin}/login`));
    setDownloaded(true); setError(stoppedAt === null ? '' : stopMessage(stoppedAt));
  }

  async function finish() {
    // the passwords came from the sheet itself: the file of accesses is a convenience, not the only copy
    await onCreated(mode === 'single' ? singleMessage : `${result?.created ?? 0} colaboradores adicionados, ${result?.updated ?? 0} atualizados.`);
  }

  const tab = (value: Mode, label: string) => <button aria-pressed={mode === value}
    className={cn('min-h-9 rounded-md border-0 px-3 text-sm font-semibold', mode === value ? 'bg-card shadow-sm' : 'bg-transparent text-muted-foreground')}
    disabled={busy || result !== null} onClick={() => { setMode(value); setError(''); }} type="button">{label}</button>;

  const counts = preview?.result;
  const rejected = counts?.rejected ?? [];
  const complete = mode === 'single' || (preview !== null && savedChunks === chunksOf(preview.rows).length);

  return <Dialog busy={busy} description="Cada colaborador entra com o login e a senha que você definir aqui." onClose={result ? () => void finish() : onClose} size="lg" title="Adicionar colaboradores">
    <div className="grid gap-4">
      <div className="inline-flex gap-1 justify-self-start rounded-lg bg-muted p-1" role="group">{tab('single', 'Um colaborador')}{tab('sheet', 'Importar planilha')}</div>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

      {mode === 'single'
        ? (result
          ? <div className="grid gap-4">
            <p className="m-0 text-sm font-medium text-success" role="status">{singleMessage}</p>
            <DialogActions><Button onClick={() => void finish()}>Concluir</Button></DialogActions>
          </div>
          : <form className="grid gap-4" onSubmit={createOne}>
            <Field htmlFor="add-name" label="Nome">
              <Input autoComplete="off" data-autofocus id="add-name" maxLength={200} required {...field('name')} />
            </Field>
            <Field htmlFor="add-registration" label="Matrícula (opcional)">
              <Input autoComplete="off" id="add-registration" maxLength={64} {...field('registrationNumber')} />
            </Field>
            <Field hint="Se ficar em branco, usamos a matrícula ou criamos um login." htmlFor="add-login" label="Login (opcional)">
              <Input autoCapitalize="none" autoComplete="off" id="add-login" maxLength={128} {...field('login')} />
            </Field>
            <Field htmlFor="add-email" label="E-mail">
              <Input autoComplete="off" id="add-email" maxLength={200} type="email" {...field('email')} />
            </Field>
            <Field htmlFor="add-phone" label="Telefone">
              <Input autoComplete="off" id="add-phone" inputMode="tel" maxLength={30} {...field('phone')} />
            </Field>
            {activeUnits.length > 0 && <Field htmlFor="add-unit" label="Unidade">
              <NativeSelect id="add-unit" {...field('unit')}>
                <option value="">Sem unidade</option>
                {activeUnits.map(unit => <option key={unit.id} value={unit.name}>{unit.name}</option>)}
              </NativeSelect>
            </Field>}
            {activeSectors.length > 0 && <Field htmlFor="add-sector" label="Setor">
              <NativeSelect id="add-sector" {...field('sector')}>
                <option value="">Sem setor</option>
                {activeSectors.map(sector => <option key={sector.id} value={sector.name}>{sector.name}</option>)}
              </NativeSelect>
            </Field>}
            <Field hint={passwordRulesHint} htmlFor="add-password" label="Senha inicial">
              <Input autoComplete="new-password" id="add-password" minLength={passwordMinLength} required type="password" {...field('password')} />
            </Field>
            <DialogActions>
              <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
              <Button disabled={busy} type="submit">{busy ? 'Criando...' : 'Adicionar colaborador'}</Button>
            </DialogActions>
          </form>)
        : <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="m-0 max-w-prose">
              Use uma planilha Excel (.xlsx) ou CSV. <strong>Login, Senha e Nome completo</strong> são obrigatórios;
              e-mail, matrícula, setor e unidade empresarial são opcionais. Até {MAX_IMPORT_ROWS} linhas.
              Antes de gravar, mostramos o que vai acontecer.
            </p>
            <Button disabled={!registry} onClick={() => registry && void downloadTemplate(registry)} size="sm" variant="outline"><FileSpreadsheet /> Baixar modelo</Button>
          </div>
          {!result && <Field hint="Célula vazia não apaga o que já está cadastrado." htmlFor="add-sheet" label="Planilha">
            <input accept=".csv,.xlsx" disabled={busy} id="add-sheet" onChange={event => void chooseFile(event)} type="file" />
          </Field>}
          {fileName && !result && <p className="m-0 text-sm text-muted-foreground">{fileName}</p>}
          {fileError && <p className="m-0 text-sm font-medium text-destructive" role="alert">{fileError}</p>}
          {counts && !result && <div aria-live="polite" className="grid gap-2">
            {/* a column the sheet has but we did not recognize (a header saved in another encoding, a new name) shows by its absence */}
            <p className="m-0 text-xs text-muted-foreground">Colunas reconhecidas: {preview.columns.map(column => columnLabels[column]).join(', ')}</p>
            <p className="m-0 text-sm">
              <strong>{counts.created}</strong> serão criados · <strong>{counts.updated}</strong> atualizados · <strong>{counts.unchanged}</strong> sem mudança · <strong>{rejected.length}</strong> recusados
            </p>
            {rejected.length > 0 && <ul className="m-0 grid max-h-32 list-none gap-0.5 overflow-auto p-0 text-xs text-warning">
              {rejected.slice(0, 8).map(item => <li key={item.row}>Linha {item.row}{item.login ? ` · ${item.login}` : ''}: {item.message}</li>)}
              {rejected.length > 8 && <li>e mais {rejected.length - 8}</li>}
            </ul>}
          </div>}
          {saving && <p aria-live="polite" className="m-0 text-sm font-medium">Gravando… {saving.saved} de {saving.total}</p>}
          {result && <div className="grid gap-3" role="status">
            <p className={cn('m-0 text-sm font-medium', complete ? 'text-success' : 'text-foreground')}>
              {complete ? '' : 'Gravados até agora: '}{result.created} criados · {result.updated} atualizados · {result.unchanged} sem mudança · {result.rejected.length} recusados.
            </p>
            {result.credentials.length > 0 && <div className="grid gap-2 rounded-lg bg-warning-soft p-3 text-sm">
              <p className="m-0">Se quiser, baixe a lista de acessos (nome, login, senha e endereço) para entregar aos colaboradores.</p>
              <Button className="justify-self-start" disabled={busy} onClick={downloadCredentials}>{downloaded ? 'Baixar o arquivo de acessos novamente' : 'Baixar o arquivo de acessos'}</Button>
            </div>}
          </div>}
          <DialogActions>
            <Button disabled={busy} onClick={result ? () => void finish() : onClose} variant="outline">{result ? 'Concluir' : 'Cancelar'}</Button>
            {!result && <Button disabled={busy || !counts || counts.created + counts.updated === 0} onClick={() => void save()}>
              {busy ? 'Aguarde...' : 'Confirmar carga'}
            </Button>}
            {stoppedAt !== null && <Button disabled={busy} onClick={() => void save()}>Tentar de novo</Button>}
          </DialogActions>
        </div>}
    </div>
  </Dialog>;
}
