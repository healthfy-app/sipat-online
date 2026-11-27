import { useState, type ReactNode, type Ref } from 'react';
import type { LearningLessonProgress } from '@/api';
import { ExternalVideoPlayer, SipatVideoPlayer, type PlayerEvent, type SipatVideoPlayerHandle } from '@sipat/video-player';
import type { PreviewSource } from './previewModel';

/**
 * The video on stage of the preview, in the participant's frame: our player with the video's file, or the provider's
 * player for YouTube and Vimeo. Free to watch (no watch-in-order, any speed), and it starts where this preview left it.
 */
export default function PreviewPlayer({ lesson, source, onEvent, ref }: {
  lesson: LearningLessonProgress;
  source: PreviewSource;
  onEvent: (event: PlayerEvent) => void | Promise<boolean>;
  ref?: Ref<SipatVideoPlayerHandle>;
}) {
  // a video that did not load can be tried again: a new key mounts a new player
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const resumeAt = lesson.lastPlaybackPositionMilliseconds / 1000;

  if (source.kind === 'unavailable') {
    return <PlayerState icon="!" text="Este vídeo ainda não pode ser assistido. Ele aparece para o participante quando estiver pronto." title="Vídeo indisponível" />;
  }
  if (failed) {
    return <PlayerState icon="!" text="Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente." title="Vídeo indisponível">
      <button className="button button-secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }} type="button">Tentar novamente</button>
    </PlayerState>;
  }
  if (source.kind === 'external') {
    // an extra is only a frame to watch; one that counts is followed through the provider, like ours
    return lesson.isBonus
      ? <ExternalVideoPlayer externalId={source.externalId} key={lesson.id} provider={source.provider} title={lesson.title} />
      : <ExternalVideoPlayer externalId={source.externalId} key={`${lesson.id}-${attempt}`} onEvent={onEvent} provider={source.provider} ref={ref}
        resumeAt={resumeAt} title={lesson.title} />;
  }
  return <SipatVideoPlayer
    key={`${lesson.id}-${attempt}`}
    onEvent={event => {
      if (event.type === 'error') setFailed(true);
      return onEvent(event);
    }}
    ref={ref}
    resumeAt={resumeAt}
    sources={source.sources}
    title={lesson.title}
  />;
}

/** The participant's message in place of the video. */
export function PlayerState({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return <div aria-live="polite" className="learning-player-state" role={icon === '!' ? 'alert' : 'status'}>
    <span aria-hidden="true" className="learning-player-icon">{icon}</span>
    <h2>{title}</h2>
    <p>{text}</p>
    {children}
  </div>;
}
