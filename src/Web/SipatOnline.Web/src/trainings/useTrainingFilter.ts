import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { orderTrainings, pickDefaultTraining, type TrainingTiming } from './defaultTraining';

export type TrainingOption = TrainingTiming & { title: string };

/** What a progress row says about its training (the participation report carries it). */
export interface TrainingRow {
  sipatEventId?: string | null;
  sipatTitle?: string | null;
  sipatStartsAt?: string | null;
  sipatEndsAt?: string | null;
  sipatStatus?: string | null;
}

/** Keeps the rows of one training; `null` keeps every row, including those that belong to no training. */
export function filterByTraining<T extends { sipatEventId?: string | null }>(rows: readonly T[], trainingId: string | null): T[] {
  return trainingId === null ? [...rows] : rows.filter(row => row.sipatEventId === trainingId);
}

/** The trainings that have progress rows, one option each: the follow-up screens choose among what people actually have. */
export function trainingsOfRows(rows: readonly TrainingRow[]): TrainingOption[] {
  const byId = new Map<string, TrainingOption>();
  for (const row of rows) {
    if (!row.sipatEventId || byId.has(row.sipatEventId)) continue;
    const status = row.sipatStatus === 'Draft' || row.sipatStatus === 'Cancelled' ? row.sipatStatus : 'Published';
    byId.set(row.sipatEventId, {
      id: row.sipatEventId, title: row.sipatTitle || 'Treinamento', status, hasDays: true,
      startsAt: row.sipatStartsAt ?? '', endsAt: row.sipatEndsAt ?? row.sipatStartsAt ?? '',
    });
  }
  return orderTrainings([...byId.values()]);
}

/**
 * The training the follow-up screens (dashboard, participants, Excel) show. The options come from the progress rows, so
 * anyone who can see the progress — a Supervisor included — can pick one. It starts on `?treinamento=` when given, else on
 * the training the participants' home would open. With a single training there is nothing to choose and nothing is filtered.
 */
export function useTrainingFilter(rows: readonly TrainingRow[]) {
  const [params] = useSearchParams();
  const [chosen, setChosen] = useState<string | null | undefined>(() => params.get('treinamento') ?? undefined);
  const trainings = useMemo(() => trainingsOfRows(rows), [rows]);
  const known = (id: string | null | undefined) => id === null || trainings.some(item => item.id === id);
  const selectedId = trainings.length < 2 ? null
    : chosen !== undefined && known(chosen) ? chosen : pickDefaultTraining(trainings)?.id ?? null;
  const selected = trainings.find(item => item.id === selectedId) ?? null;
  return { trainings, selectedId, selected, setSelectedId: (id: string | null) => setChosen(id) };
}
