import { ExternalVideoLink, ExternalVideoPlayer } from '@sipat/video-player';
import type { PlatformCourseVideo } from '@/api';

type ExternalVideo = Pick<PlatformCourseVideo, 'provider' | 'externalId'>;

const providerOf = (video: ExternalVideo) => (video.provider === 'Vimeo' ? 'Vimeo' : 'YouTube');

/** The provider frame in the same sized box as the house preview. */
export function ExternalVideoFrame({ video, title }: { video: ExternalVideo; title: string }) {
  return <div className="video-preview">
    <ExternalVideoPlayer externalId={video.externalId ?? ''} provider={providerOf(video)} title={title} />
  </div>;
}

/** The "didn't open?" line that goes right below the frame. */
export function ExternalVideoOutside({ video }: { video: ExternalVideo }) {
  return <ExternalVideoLink externalId={video.externalId ?? ''} provider={providerOf(video)} />;
}

export default function ExternalVideoPreview({ video, title }: { video: ExternalVideo; title: string }) {
  return <>
    <ExternalVideoFrame title={title} video={video} />
    <ExternalVideoOutside video={video} />
  </>;
}
