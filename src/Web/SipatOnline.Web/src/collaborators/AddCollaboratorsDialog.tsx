import { FileSpreadsheet } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { createParticipant, type CreateParticipantData } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { passwordMinLength, passwordRulesHint } from '@/lib/passwordRules';
import {
  createParticipantsFromCsv, MAX_PARTICIPANT_CSV_BYTES, MAX_PARTICIPANT_CSV_ROWS, parseParticipantCsv, serializeCredentialCsv,
  type ParticipantCsvImportResult, type ParticipantCsvParseResult,
} from '@/participantCsv';
import { cn } from '@/lib/utils';
import { downloadCsv, readCsvFile } from './csvFile';

const empty: CreateParticipantData = { loginIdentifier: '', displayName: '', initialPassword: '', role: 'Participant' };

/** Adds collaborators: one at a time, or many from a spreadsheet saved as CSV. */
export default function AddCollaboratorsDialog({ existingLogins, onClose, onCreated }: {
  existingLogins: string[]; onClose: () => void; onCreated: (message: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'single' | 'csv'>('single');
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParticipantCsvParseResult | null>(null);
  const [result, setResult] = useState<ParticipantCsvImportResult | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  async function createOne(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const person = await createParticipant({ ...form, loginIdentifier: form.loginIdentifier.trim(), displayName: form.displayName.trim() });
      await onCreated(`${person.displayName} foi adicionado(a) aos colaboradores.`);
    } catch (failure) {
      setError(getErrorMessage(failure));
      setBusy(false);
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setFileName(file.name); setResult(null); setError('');
    if (file.size > MAX_PARTICIPANT_CSV_BYTES) { setParsed({ rows: [], issues: [], fatalError: 'O arquivo excede o limite de 2 MiB.' }); return; }
    setBusy(true);
    try {
      setParsed(parseParticipantCsv(await readCsvFile(file), existingLogins));
    } catch (failure) {
      setParsed({ rows: [], issues: [], fatalError: getErrorMessage(failure) });
    } finally { setBusy(false); }
  }

  async function importRows() {
    if (!parsed?.rows.length) return;
    setBusy(true); setError('');
    try {
      setResult(await createParticipantsFromCsv(parsed.rows, createParticipant));
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  function downloadCredentials() {
    if (!result?.created.length) return;
    downloadCsv(`acessos-colaboradores-${new Date().toISOString().slice(0, 10)}.csv`, serializeCredentialCsv(result.created));
    setDownloaded(true); setError('');
  }

  async function finish() {
    if (result?.created.length && !downloaded) { setError('Baixe o arquivo de acessos antes de fechar. As senhas não ficam salvas no portal.'); return; }
    await onCreated(result ? `${result.created.length} colaboradores adicionados.` : '');
  }

  const tab = (value: 'single' | 'csv', label: string) => <button aria-pressed={mode === value}
    className={cn('min-h-9 rounded-md border-0 px-3 text-sm font-semibold', mode === value ? 'bg-card shadow-sm' : 'bg-transparent text-muted-foreground')}
    disabled={busy || result !== null} onClick={() => { setMode(value); setError(''); }} type="button">{label}</button>;

  return <Dialog busy={busy} description="Cada colaborador entra com a matrícula e a senha que você definir aqui." onClose={result ? () => void finish() : onClose} size="lg" title="Adicionar colaboradores">
    <div className="grid gap-4">
      <div className="inline-flex gap-1 justify-self-start rounded-lg bg-muted p-1" role="group">{tab('single', 'Um colaborador')}{tab('csv', 'Importar de um CSV')}</div>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

      {mode === 'single'
        ? <form className="grid gap-4" onSubmit={createOne}>
          <Field htmlFor="add-name" label="Nome">
            <Input autoComplete="off" data-autofocus id="add-name" maxLength={200} onChange={event => setForm(current => ({ ...current, displayName: event.target.value }))} required value={form.displayName} />
          </Field>
          <Field hint="É o que o colaborador digita para entrar." htmlFor="add-login" label="Matrícula (login)">
            <Input autoCapitalize="none" autoComplete="off" id="add-login" maxLength={128} onChange={event => setForm(current => ({ ...current, loginIdentifier: event.target.value }))} required value={form.loginIdentifier} />
          </Field>
          <Field hint={passwordRulesHint} htmlFor="add-password" label="Senha inicial">
            <Input autoComplete="new-password" id="add-password" minLength={passwordMinLength} onChange={event => setForm(current => ({ ...current, initialPassword: event.target.value }))} required type="password" value={form.initialPassword} />
          </Field>
          <DialogActions>
            <Button disabled={busy} onClick={onClose} type="button" variant="outline">Cancelar</Button>
            <Button disabled={busy} type="submit">{busy ? 'Criando...' : 'Adicionar colaborador'}</Button>
          </DialogActions>
        </form>
        : <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="m-0 max-w-prose">
              O CSV precisa das colunas <strong>nome</strong> e <strong>login</strong> (vírgula ou ponto e vírgula). Até {MAX_PARTICIPANT_CSV_ROWS} pessoas por arquivo.
              As senhas iniciais são geradas e entregues em um arquivo para baixar depois da importação.
            </p>
            <Button onClick={() => downloadCsv('modelo-importacao-colaboradores.csv', '﻿nome;login\r\nMaria Silva;maria.silva\r\n')} size="sm" variant="outline"><FileSpreadsheet /> Baixar modelo</Button>
          </div>
          {!result && <Field hint="Matrículas que já existem, ou repetidas no arquivo, são ignoradas." htmlFor="add-csv" label="Arquivo CSV">
            <input accept=".csv,text/csv" disabled={busy} id="add-csv" onChange={event => void readFile(event)} type="file" />
          </Field>}
          {fileName && !result && <p className="m-0 text-sm text-muted-foreground">{fileName}</p>}
          {parsed?.fatalError && <p className="m-0 text-sm font-medium text-destructive" role="alert">{parsed.fatalError}</p>}
          {parsed && !parsed.fatalError && !result && <div aria-live="polite" className="grid gap-2">
            <p className="m-0 text-sm"><strong>{parsed.rows.length}</strong> prontos para criar{parsed.issues.length > 0 && <> · <strong>{parsed.issues.length}</strong> precisam de correção</>}</p>
            {parsed.issues.length > 0 && <ul className="m-0 grid max-h-32 list-none gap-0.5 overflow-auto p-0 text-xs text-warning">
              {parsed.issues.slice(0, 8).map(issue => <li key={`${issue.recordNumber}-${issue.loginIdentifier}`}>Registro {issue.recordNumber}{issue.loginIdentifier ? ` · ${issue.loginIdentifier}` : ''}: {issue.message}</li>)}
              {parsed.issues.length > 8 && <li>e mais {parsed.issues.length - 8} registros.</li>}
            </ul>}
          </div>}
          {result && <div className="grid gap-3" role="status">
            <p className={cn('m-0 text-sm font-medium', result.failed.length ? 'text-destructive' : 'text-success')}>
              {result.created.length} criados · {result.failed.length + (parsed?.issues.length ?? 0)} não importados.
            </p>
            {result.created.length > 0 && <div className="grid gap-2 rounded-lg bg-warning-soft p-3 text-sm">
              <p className="m-0">Baixe agora as senhas iniciais. Elas não ficam salvas no portal e não dá para recuperar depois que você fechar esta janela.</p>
              <Button className="justify-self-start" onClick={downloadCredentials}>{downloaded ? 'Baixar o arquivo de acessos novamente' : 'Baixar o arquivo de acessos'}</Button>
            </div>}
            {result.failed.length > 0 && <ul aria-label="Falhas de importação" className="m-0 grid max-h-32 list-none gap-0.5 overflow-auto p-0 text-xs text-destructive">
              {result.failed.slice(0, 8).map(failure => <li key={`${failure.recordNumber}-${failure.loginIdentifier}`}>Registro {failure.recordNumber} · {failure.loginIdentifier}: {failure.message}</li>)}
            </ul>}
          </div>}
          <DialogActions>
            <Button disabled={busy} onClick={result ? () => void finish() : onClose} variant="outline">{result ? 'Concluir' : 'Cancelar'}</Button>
            {!result && <Button disabled={busy || !parsed || parsed.rows.length === 0 || !!parsed.fatalError} onClick={() => void importRows()}>
              {busy ? 'Aguarde...' : `Importar ${parsed?.rows.length ?? 0} colaboradores`}
            </Button>}
          </DialogActions>
        </div>}
    </div>
  </Dialog>;
}
