import type { VideoSource } from '@sipat/video-player';

/** Which versions of a library video were made, as the library tells them. */
export interface MadeVersions { hasFhd1080?: boolean; hasSd480?: boolean }

/**
 * The versions of a library video for the player, best first, as the server lists them for a participant's lesson:
 * the 1080p and the 480p when they were made, the 720p (the file itself) always. The player starts on the one the
 * connection carries and offers the others in its menu, so a preview shows the video as the participant gets it.
 */
export function videoVersions(fileUrl: string, made: MadeVersions = {}): VideoSource[] {
  const at = (quality: string) => `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}quality=${quality}`;
  const several = !!made.hasFhd1080 || !!made.hasSd480;
  return [
    ...(made.hasFhd1080 ? [{ src: at('1080p'), quality: '1080p' as const }] : []),
    { src: fileUrl, quality: several ? '720p' as const : undefined },
    ...(made.hasSd480 ? [{ src: at('480p'), quality: '480p' as const }] : []),
  ];
}
