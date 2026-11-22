import { useCallback, useEffect, useState } from 'react';
import {
  addRegistryItems, getCompanyRegistry, saveProfileRules, updateRegistryItem,
  type CompanyRegistry, type ProfileRules, type RegistryItem, type RegistryKind,
} from '@/api';
import { Switch } from '@/components/ui/field';
import { Page, PageHeader } from '@/components/ui/page';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';
import RegistryList from './RegistryList';

const ruleFields: { key: keyof ProfileRules; label: string }[] = [
  { key: 'requireRegistration', label: 'Matrícula' },
  { key: 'requireEmail', label: 'E-mail' },
  { key: 'requirePhone', label: 'Telefone' },
  { key: 'requireUnit', label: 'Unidade' },
  { key: 'requireSector', label: 'Setor' },
];

/** Where the company administrator keeps the lists of units and sectors and chooses which participant fields are required. */
export default function RegistryPage() {
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [error, setError] = useState('');
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesBusy, setRulesBusy] = useState(false);

  const load = useCallback(async () => {
    try { setRegistry(await getCompanyRegistry()); } catch (failure) { setError(getErrorMessage(failure)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const replaceItem = (kind: RegistryKind, updated: RegistryItem) => setRegistry(current => current && {
    ...current, [kind]: current[kind].map(item => item.id === updated.id ? updated : item),
  });

  async function toggleRule(key: keyof ProfileRules, value: boolean) {
    if (!registry) return;
    setRulesBusy(true); setError(''); setRulesSaved(false);
    try {
      const saved = await saveProfileRules({ ...registry.rules, [key]: value });
      setRegistry(current => current && { ...current, rules: saved });
      setRulesSaved(true);
    } catch (failure) { setError(getErrorMessage(failure)); } finally { setRulesBusy(false); }
  }

  return <Page>
    <PageHeader
      description="As unidades e os setores da empresa e os dados que cada participante precisa ter."
      eyebrow="Gestão da empresa"
      title="Cadastro"
    />
    {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
    {!registry ? (error ? null : <LoadingState>Carregando o cadastro...</LoadingState>) : <>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <RegistryList
          idPrefix="units" items={registry.units} title="Unidades"
          onAdd={async names => setRegistry(await addRegistryItems('units', names))}
          onChange={async (item, change) => replaceItem('units', await updateRegistryItem('units', item.id, change))}
        />
        <RegistryList
          idPrefix="sectors" items={registry.sectors} title="Setores"
          onAdd={async names => setRegistry(await addRegistryItems('sectors', names))}
          onChange={async (item, change) => replaceItem('sectors', await updateRegistryItem('sectors', item.id, change))}
        />
      </div>
      <section aria-label="Campos obrigatórios" className="grid gap-4 rounded-lg bg-card p-5 shadow-card">
        <h2 className="m-0 text-lg font-semibold">Campos obrigatórios</h2>
        <p className="m-0 text-sm text-muted-foreground">Nome e senha são sempre obrigatórios. Ligar um campo vale para quem for cadastrado daqui em diante.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ruleFields.map(field => <Switch
            checked={registry.rules[field.key]} disabled={rulesBusy} id={`rule-${field.key}`} key={field.key} label={field.label}
            onChange={event => void toggleRule(field.key, event.target.checked)}
          />)}
        </div>
        {rulesSaved && <p className="m-0 text-sm font-medium text-success" role="status">Salvo.</p>}
      </section>
    </>}
  </Page>;
}
