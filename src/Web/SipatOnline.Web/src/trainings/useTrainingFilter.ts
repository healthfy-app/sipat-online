import { useEffect, useMemo, useState } from 'react';
import { listSipatEvents, listSipatPlans } from '@/api';
import { orderTrainings, pickDefaultTraining, type TrainingTiming } from './defaultTraining';

export type TrainingOption = TrainingTiming & { title: string };

/** Keeps the rows of one training; `null` keeps every row, including those that belong to no training. */
export function filterByTraining<T extends { sipatEventId?: string | null }>(rows: readonly T[], trainingId: string | null): T[] {
  return trainingId === null ? [...rows] : rows.filter(row => row.sipatEventId === trainingId);
}

/**
 * The trainings of the company that participants can have (drafts left out), and the one the follow-up screens show.
 * It starts on the training the participants' home would open. When the trainings cannot be loaded, nothing is filtered.
 */
export function useTrainingFilter() {
  const [trainings, setTrainings] = useState<TrainingOption[]>([]);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    Promise.all([listSipatEvents(0, 100), listSipatPlans()])
      .then(([page, plans]) => {
        if (!current) return;
        const options = (page?.items ?? [])
          .filter(item => item.status !== 'Draft')
          .map(item => ({ ...item, hasDays: (plans ?? []).some(plan => plan.sipatEventId === item.id && plan.days > 0) }));
        setTrainings(orderTrainings(options));
      })
      .catch(() => { if (current) setTrainings([]); });
    return () => { current = false; };
  }, []);

  // with a single training there is nothing to choose: everything is shown, as before
  const selectedId = trainings.length < 2 ? null : chosen === undefined ? pickDefaultTraining(trainings)?.id ?? null : chosen;
  const selected = useMemo(() => trainings.find(item => item.id === selectedId) ?? null, [trainings, selectedId]);
  return {
    trainings,
    selectedId,
    selected,
    setSelectedId: (id: string | null) => setChosen(id),
    filter: <T extends { sipatEventId?: string | null }>(rows: readonly T[]) => filterByTraining(rows, selectedId),
  };
}
