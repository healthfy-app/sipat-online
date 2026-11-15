import type { FlushReason, PlayerQualitySummary } from './quality';

export type SaveReason = 'interval' | 'pause' | 'hidden' | 'leave' | 'seeked' | 'ended';
export interface WatchedRange { startMs: number; endMs: number }
export type PlayerErrorKind = 'network' | 'decode' | 'source';
export type PlayerEvent =
  | { type: 'range'; range: WatchedRange }
  | { type: 'save'; reason: SaveReason; positionMs: number; range: WatchedRange | null }
  | { type: 'seekBlocked' }
  | { type: 'checkpoint'; id: string }
  | { type: 'playing' } | { type: 'paused' } | { type: 'ended' }
  | { type: 'error'; kind: PlayerErrorKind }
  | { type: 'quality'; summary: PlayerQualitySummary; reason: FlushReason };
/** Para 'save', a tela devolve uma Promise: true = salvo (o core avança o início da faixa). */
export type PlayerEventHandler = (event: PlayerEvent) => void | Promise<boolean>;
