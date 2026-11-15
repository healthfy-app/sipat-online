// Which rendition the player starts with, and when it steps down. Pure TypeScript.

export type SourceQuality = '720p' | '480p';
export type QualityPreference = 'auto' | SourceQuality;
export interface VideoSource { src: string; quality?: SourceQuality; type?: string }

export const QUALITY_PREFERENCE_KEY = 'sipat-player-quality';

export interface ConnectionInfo { effectiveType?: string; downlink?: number }

const isPreference = (value: unknown): value is QualityPreference => value === 'auto' || value === '720p' || value === '480p';

/** What the viewer chose last time. Storage that throws (Safari private mode) means "Automática". */
export function readQualityPreference(storage?: Pick<Storage, 'getItem'>): QualityPreference {
  try {
    const value = (storage ?? localStorage).getItem(QUALITY_PREFERENCE_KEY);
    return isPreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveQualityPreference(value: QualityPreference, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? localStorage).setItem(QUALITY_PREFERENCE_KEY, value);
  } catch {
    // the choice just does not outlive the page
  }
}

/** `navigator.connection` where the browser has it (not on iPhone), as the plain values the choice needs. */
export function readConnection(): ConnectionInfo | null {
  try {
    const connection = (navigator as unknown as { connection?: ConnectionInfo }).connection;
    return connection ? { effectiveType: connection.effectiveType, downlink: connection.downlink } : null;
  } catch {
    return null;
  }
}

const SLOW_TYPES = ['slow-2g', '2g', '3g'];

export function chooseSource(sources: VideoSource[], preference: QualityPreference, connection: ConnectionInfo | null): VideoSource {
  if (sources.length === 1) return sources[0];
  const named = (quality: SourceQuality) => sources.find(source => source.quality === quality);
  if (preference !== 'auto') {
    const wanted = named(preference);
    if (wanted) return wanted;
  }
  const slow = !!connection && ((connection.effectiveType !== undefined && SLOW_TYPES.includes(connection.effectiveType))
    || (typeof connection.downlink === 'number' && connection.downlink < 2));
  return named(slow ? '480p' : '720p') ?? sources[0];
}

export interface DowngradeWatch {
  /** True when the player should step down now (once). */
  recordStall(atMs: number, current: SourceQuality | undefined): boolean;
}

export function createDowngradeWatch(options: { stalls?: number; windowMs?: number } = {}): DowngradeWatch {
  const limit = options.stalls ?? 2;
  const windowMs = options.windowMs ?? 60_000;
  let recent: number[] = [];
  let fired = false;
  return {
    recordStall(atMs, current) {
      if (fired || current !== '720p') return false;
      recent = [...recent.filter(at => atMs - at <= windowMs), atMs];
      if (recent.length < limit) return false;
      fired = true;
      return true;
    },
  };
}
