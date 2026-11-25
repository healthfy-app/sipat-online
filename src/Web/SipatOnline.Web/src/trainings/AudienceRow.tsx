import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  getCompanyRegistry, getTrainingAudience, listParticipantProfiles,
  type CompanyRegistry, type ParticipantProfile, type TrainingAudience,
} from '@/api';
import { Button } from '@/components/ui/button';
import AudienceDialog from './AudienceDialog';
import { audienceLabel } from './audienceLabel';

/**
 * Who the training is for, in one line on its page, with the way to change it. It reads what it needs by itself and
 * shows nothing if that cannot be read, so the page it sits on never depends on it.
 */
export default function AudienceRow({ sipatId, canEdit, openAtStart = false, onChanged }: {
  sipatId: string; canEdit: boolean;
  /** Opens the dialog as soon as it can (a training just duplicated for another unit). */
  openAtStart?: boolean;
  onChanged?: (audience: TrainingAudience) => void;
}) {
  const [audience, setAudience] = useState<TrainingAudience | null>(null);
  const [registry, setRegistry] = useState<CompanyRegistry | null>(null);
  const [profiles, setProfiles] = useState<ParticipantProfile[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([getTrainingAudience(sipatId), getCompanyRegistry()]).then(([loaded, company]) => {
      if (!current) return;
      setAudience(loaded); setRegistry(company);
      if (openAtStart && canEdit) setEditing(true);
    }, () => undefined);
    // only for the counts beside each sector: without them the dialog still works
    listParticipantProfiles().then(list => { if (current) setProfiles(list); }, () => undefined);
    return () => { current = false; };
  }, [sipatId, openAtStart, canEdit]);

  if (!audience || !registry) return null;
  return <>
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Users aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">Para quem:</span>
      <strong className="font-semibold">{audienceLabel(audience.targets, registry)}</strong>
      {canEdit && <Button aria-label="Mudar para quem é o treinamento" onClick={() => setEditing(true)} size="sm" variant="outline">Mudar</Button>}
    </p>
    {editing && <AudienceDialog audience={audience} onClose={() => setEditing(false)} onRegistryChanged={setRegistry} profiles={profiles} registry={registry} sipatId={sipatId}
      onSaved={saved => { setAudience(saved); setEditing(false); onChanged?.(saved); }} />}
  </>;
}
