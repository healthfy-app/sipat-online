import { useState } from 'react';
import type { PreviewCheckpoint } from '@/courseEditor/courseTrack';
import GameStage from '@/games/GameStage';
import GamePlayer from '@/games/LazyGamePlayer';
import { SipatVideoPlayer, type PlayerEvent } from '@sipat/video-player';

/**
 * Free playback (no rules) of a library video, on the same SIPAT player participants use.
 * When the video has games at given moments, they open here too, so creators see what
 * participants will see. Seeking back before a game makes it open again.
 */
export default function VideoPreview({ src, title, preload = 'metadata', checkpoints = [] }: {
  src: string;
  title: string;
  preload?: 'none' | 'metadata';
  checkpoints?: PreviewCheckpoint[];
}) {
  const [active, setActive] = useState<PreviewCheckpoint | null>(null);

  function onEvent(event: PlayerEvent) {
    if (event.type !== 'checkpoint') return;
    setActive(checkpoints.find(item => item.id === event.id) ?? null);
  }

  // Closing the game drops the activity; the player then plays on by itself.
  const closeGame = () => setActive(null);
  return <div className="video-preview">
    <SipatVideoPlayer
      activity={active && <GameStage label={active.module.title} onClose={closeGame}>
        <GamePlayer key={active.id} module={active.module} onClose={closeGame} />
      </GameStage>}
      checkpoints={checkpoints.map(item => ({ id: item.id, seconds: item.timeMilliseconds / 1000, title: item.module.title, done: false }))}
      key={src} onEvent={onEvent} preload={preload} sources={[{ src }]} title={title} />
  </div>;
}
