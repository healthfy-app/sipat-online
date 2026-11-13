import { useEffect, useState } from 'react';
import {
  applyProgramToCompany, requestCompanyLearning, type CompanyLearningCatalog, type PlatformCompany, type ProgramApplication,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';

export function describeApplication(result: ProgramApplication) {
  const parts = [
    result.created > 0 && `${result.created} ${result.created === 1 ? 'dia criado' : 'dias criados'}`,
    result.updated > 0 && `${result.updated} ${result.updated === 1 ? 'dia atualizado' : 'dias atualizados'}`,
    result.kept > 0 && `${result.kept} ${result.kept === 1 ? 'dia já em andamento ficou como estava' : 'dias já em andamento ficaram como estavam'}`,
  ].filter(Boolean);
  return `SIPAT aplicada: ${parts.join(', ') || 'nada mudou'}.`;
}

/** Picks the company and its SIPAT, then applies the saved program to it. */
export default function ApplyDialog({ programId, companies, initialCompanyId, onApplied, onClose }: {
  programId: string; companies: PlatformCompany[]; initialCompanyId: string;
  onApplied: (message: string) => void; onClose: () => void;
}) {
  const [companyId, setCompanyId] = useState(initialCompanyId);
  const [catalog, setCatalog] = useState<CompanyLearningCatalog | null>(null);
  const [sipatId, setSipatId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCatalog(null); setSipatId(''); setError('');
    if (!companyId) return;
    let current = true;
    setBusy(true);
    requestCompanyLearning(companyId)
      .then(result => { if (current) { setCatalog(result); setSipatId(result.events[0]?.id ?? ''); } })
      .catch((failure: unknown) => { if (current) setError(getErrorMessage(failure)); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [companyId]);

  async function apply() {
    setBusy(true); setError('');
    try {
      onApplied(describeApplication(await applyProgramToCompany(companyId, sipatId, programId)));
    } catch (failure) {
      setError(getErrorMessage(failure));
      setBusy(false);
    }
  }

  return <Dialog busy={busy} description="Cada dia vira uma trilha para os participantes da empresa. Se a SIPAT já recebeu esta programação, os dias que ninguém começou são atualizados."
    onClose={onClose} title="Aplicar a uma empresa">
    <div className="grid gap-4">
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <Field htmlFor="apply-company" label="Empresa">
        <NativeSelect disabled={busy} id="apply-company" onChange={event => setCompanyId(event.target.value)} value={companyId}>
          <option value="">Escolha a empresa</option>
          {companies.filter(company => company.isActive).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </NativeSelect>
      </Field>
      {catalog && <Field hint={catalog.events.length === 0 ? 'Esta empresa ainda não tem uma SIPAT publicada. Publique uma no portal da empresa.' : undefined}
        htmlFor="apply-sipat" label="SIPAT publicada">
        <NativeSelect disabled={busy || catalog.events.length === 0} id="apply-sipat" onChange={event => setSipatId(event.target.value)} value={sipatId}>
          {catalog.events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
        </NativeSelect>
      </Field>}
    </div>
    <DialogActions>
      <Button disabled={busy} onClick={onClose} variant="outline">Cancelar</Button>
      <Button disabled={busy || !companyId || !sipatId} onClick={() => void apply()}>{busy ? 'Aguarde...' : 'Aplicar à SIPAT'}</Button>
    </DialogActions>
  </Dialog>;
}
