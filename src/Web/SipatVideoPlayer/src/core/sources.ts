// Which rendition the player starts with, and when it steps down. Pure TypeScript.

export type SourceQuality = '1080p' | '720p' | '480p';

/** Best first: the order the menu lists them in and the steps the player goes down. */
export const QUALITY_ORDER: readonly SourceQuality[] = ['1080p', '720p', '480p'];
export type QualityPreference = 'auto' | SourceQuality;
export interface VideoSource { src: string; quality?: SourceQuality; type?: string }

export const QUALITY_PREFERENCE_KEY = 'sipat-player-quality';

export interface ConnectionInfo { effectiveType?: string; downlink?: number }

const isPreference = (value: unknown): value is QualityPreference =>
  value === 'auto' || (QUALITY_ORDER as readonly unknown[]).includes(value);

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

/** The 1080p needs about 5 Mbps to play without stopping; below that the 720p starts. */
const FHD_MIN_DOWNLINK = 5;

/** The named versions present, best first. */
export function availableQualities(sources: VideoSource[]): SourceQuality[] {
  return QUALITY_ORDER.filter(quality => sources.some(source => source.quality === quality));
}

/** The next version below `current` among the sources, or null at the bottom. */
export function lowerQuality(sources: VideoSource[], current: SourceQuality | undefined): SourceQuality | null {
  if (!current) return null;
  const present = availableQualities(sources);
  return present[present.indexOf(current) + 1] ?? null;
}

/**
 * What plays first. A choice the viewer made wins when the video has it. "Automática" starts at the best
 * version the connection carries: 1080p on a fast or unknown network (the iPhone does not tell; stalls
 * step it down), 720p from 2 to 5 Mbps, and the lowest one on a slow network.
 */
export function chooseSource(sources: VideoSource[], preference: QualityPreference, connection: ConnectionInfo | null): VideoSource {
  if (sources.length === 1) return sources[0];
  const named = (quality: SourceQuality) => sources.find(source => source.quality === quality);
  if (preference !== 'auto') {
    const wanted = named(preference);
    if (wanted) return wanted;
  }
  const present = availableQualities(sources);
  if (present.length === 0) return sources[0];
  const downlink = typeof connection?.downlink === 'number' ? connection.downlink : null;
  const slow = !!connection && ((connection.effectiveType !== undefined && SLOW_TYPES.includes(connection.effectiveType))
    || (downlink !== null && downlink < 2));
  if (slow) return named(present[present.length - 1])!;
  const fast = downlink === null || downlink >= FHD_MIN_DOWNLINK;
  const start = present.find(quality => quality !== '1080p' || fast) ?? present[present.length - 1];
  return named(start)!;
}

export interface DowngradeWatch {
  /** True when the player should step down one version now. */
  recordStall(atMs: number, current: SourceQuality | undefined): boolean;
}

/**
 * Two stalls within a minute ask for one step down. Each version steps down at most once, so the
 * player never goes back and forth; the bottom version (480p, or 720p when there is no 480p) never steps.
 */
export function createDowngradeWatch(options: { stalls?: number; windowMs?: number; bottom?: SourceQuality } = {}): DowngradeWatch {
  const limit = options.stalls ?? 2;
  const windowMs = options.windowMs ?? 60_000;
  const bottom = options.bottom ?? '480p';
  let recent: number[] = [];
  const stepped = new Set<SourceQuality>();
  return {
    recordStall(atMs, current) {
      if (!current || current === bottom || stepped.has(current)) return false;
      recent = [...recent.filter(at => atMs - at <= windowMs), atMs];
      if (recent.length < limit) return false;
      stepped.add(current);
      recent = [];
      return true;
    },
  };
}
