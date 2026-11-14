import { useState } from 'react';
import { changeCompanyPlan, type CompanyPlan } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import PlanSelect, { PlanBadge } from './PlanSelect';

/** The plan of the company, for the operator: a badge that opens the window where it is changed. */
export default function CompanyPlanButton({ companyId, plan, onChanged }: { companyId: string; plan: CompanyPlan; onChanged: (plan: CompanyPlan) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<CompanyPlan>(plan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true); setError('');
    try {
      await changeCompanyPlan(companyId, chosen);
      onChanged(chosen); setOpen(false);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally { setBusy(false); }
  }

  return <>
    <button aria-label={`Plano da empresa: ${plan}. Alterar`} className="m-0 justify-self-start border-0 bg-transparent p-0" onClick={() => { setChosen(plan); setError(''); setOpen(true); }} type="button">
      <PlanBadge className="cursor-pointer hover:brightness-95" plan={plan} />
    </button>
    {open && <Dialog busy={busy} description="O plano define o que a empresa pode personalizar. Ela não vê o nome do plano; só as opções que ele libera." onClose={() => setOpen(false)} title="Plano da empresa">
      <div className="grid gap-4">
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        <PlanSelect disabled={busy} onChange={setChosen} value={chosen} />
      </div>
      <DialogActions>
        <Button disabled={busy} onClick={() => setOpen(false)} variant="outline">Cancelar</Button>
        <Button disabled={busy || chosen === plan} onClick={() => void save()}>{busy ? 'Salvando...' : 'Salvar plano'}</Button>
      </DialogActions>
    </Dialog>}
  </>;
}
