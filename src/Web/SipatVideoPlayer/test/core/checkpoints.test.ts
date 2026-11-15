import { describe, expect, it } from 'vitest';
import { createCheckpointWatcher, type Checkpoint } from '../../src/core/checkpoints';

const cp = (done = false): Checkpoint => ({ id: 'a', seconds: 5, title: 'Quiz', done });

describe('checkpoint watcher', () => {
  it('is due once the video reaches the moment while playing', () => {
    const watcher = createCheckpointWatcher({ reopenOnRewind: true });
    expect(watcher.due([cp()], 4.9, true, false)).toBeNull();
    expect(watcher.due([cp()], 5.1, true, false)?.id).toBe('a');
    expect(watcher.due([cp()], 5.1, true, true)).toBeNull();
    expect(watcher.due([cp()], 5.1, false, false)).toBeNull();
  });

  it('does not fire again while playing on', () => {
    const watcher = createCheckpointWatcher({ reopenOnRewind: true });
    watcher.fire('a');
    expect(watcher.due([cp()], 8, true, false)).toBeNull();
    expect(watcher.fired().has('a')).toBe(true);
  });

  it('fires again after rewinding before it, when asked to', () => {
    const watcher = createCheckpointWatcher({ reopenOnRewind: true });
    watcher.fire('a');
    watcher.rewind([cp()], 3);
    expect(watcher.due([cp()], 5.2, true, false)?.id).toBe('a');

    const strict = createCheckpointWatcher({ reopenOnRewind: false });
    strict.fire('a');
    strict.rewind([cp()], 3);
    expect(strict.due([cp()], 5.2, true, false)).toBeNull();
  });

  it('never reopens a done checkpoint', () => {
    const watcher = createCheckpointWatcher({ reopenOnRewind: true });
    watcher.fire('a');
    watcher.rewind([cp(true)], 3);
    expect(watcher.due([cp(true)], 5.2, true, false)).toBeNull();
  });
});
