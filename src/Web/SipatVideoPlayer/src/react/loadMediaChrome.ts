let loading: Promise<unknown> | null = null;

/**
 * Registers only the Media Chrome elements the SIPAT player uses, in a chunk of their own,
 * so screens without video never download them. Safe to call many times.
 */
export function loadMediaChrome() {
  loading ??= Promise.all([
    import('media-chrome/dist/media-controller.js'),
    import('media-chrome/dist/media-control-bar.js'),
    import('media-chrome/dist/media-play-button.js'),
    import('media-chrome/dist/media-seek-backward-button.js'),
    import('media-chrome/dist/media-mute-button.js'),
    import('media-chrome/dist/media-volume-range.js'),
    import('media-chrome/dist/media-time-display.js'),
    import('media-chrome/dist/media-loading-indicator.js'),
  ]).catch(() => { loading = null; });
  return loading;
}
