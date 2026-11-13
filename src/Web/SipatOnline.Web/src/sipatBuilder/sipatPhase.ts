import type { SipatEvent } from '@/api';

/** Where a SIPAT is in its life: built, published, running or over. */
export type SipatPhase = 'draft' | 'created' | 'published' | 'running' | 'finished' | 'cancelled';

export const phaseLabel: Record<SipatPhase, { text: string; variant: 'default' | 'success' | 'warning' | 'neutral' | 'outline' }> = {
  draft: { text: 'Rascunho', variant: 'warning' },
  created: { text: 'Criada', variant: 'outline' },
  published: { text: 'Publicada', variant: 'success' },
  running: { text: 'Em andamento', variant: 'default' },
  finished: { text: 'Concluída', variant: 'neutral' },
  cancelled: { text: 'Cancelada', variant: 'neutral' },
};

/**
 * - Rascunho: just started, no days yet.
 * - Criada: the days are built, waiting to be published.
 * - Publicada: out for the participants, the week has not begun.
 * - Em andamento: the week is happening.
 * - Concluída: the week is over.
 */
export function sipatPhase(event: Pick<SipatEvent, 'status' | 'startsAt' | 'endsAt'>, days: number, now: Date = new Date()): SipatPhase {
  if (event.status === 'Cancelled') return 'cancelled';
  if (event.status === 'Draft') return days > 0 ? 'created' : 'draft';
  if (now >= new Date(event.endsAt)) return 'finished';
  return now >= new Date(event.startsAt) ? 'running' : 'published';
}
