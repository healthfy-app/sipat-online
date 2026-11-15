/** A moment on the timeline where an activity happens (the video pauses there). */
export interface Checkpoint { id: string; seconds: number; title: string; done: boolean }

export interface CheckpointWatcher {
  /** The first checkpoint that is not done, not fired yet and already reached; only while playing and not seeking. */
  due(checkpoints: Checkpoint[], currentS: number, playing: boolean, seeking: boolean): Checkpoint | null;
  fire(id: string): void;
  /** With reopenOnRewind, forgets the fired checkpoints that are more than a second ahead of `currentS`. */
  rewind(checkpoints: Checkpoint[], currentS: number): void;
  fired(): ReadonlySet<string>;
}

export function createCheckpointWatcher(options: { reopenOnRewind: boolean }): CheckpointWatcher {
  const fired = new Set<string>();
  return {
    due(checkpoints, currentS, playing, seeking) {
      if (!playing || seeking) return null;
      return checkpoints.find(item => !item.done && !fired.has(item.id) && item.seconds <= currentS) ?? null;
    },
    fire(id) { fired.add(id); },
    rewind(checkpoints, currentS) {
      if (!options.reopenOnRewind) return;
      for (const item of checkpoints)
        if (!item.done && fired.has(item.id) && item.seconds > currentS + 1) fired.delete(item.id);
    },
    fired() { return fired; },
  };
}

/** Listens to `timeupdate` and calls `onDue` once per checkpoint reached. Returns the function that stops it. */
export function watchCheckpoints(video: HTMLVideoElement, options: {
  checkpoints: () => Checkpoint[]; reopenOnRewind: boolean; onDue: (checkpoint: Checkpoint) => void;
}, watcher: CheckpointWatcher = createCheckpointWatcher({ reopenOnRewind: options.reopenOnRewind })): () => void {
  const onTimeUpdate = () => {
    const checkpoints = options.checkpoints();
    if (!checkpoints.length) return;
    watcher.rewind(checkpoints, video.currentTime);
    const due = watcher.due(checkpoints, video.currentTime, !video.paused, video.seeking);
    if (!due) return;
    watcher.fire(due.id);
    options.onDue(due);
  };
  video.addEventListener('timeupdate', onTimeUpdate);
  return () => video.removeEventListener('timeupdate', onTimeUpdate);
}
