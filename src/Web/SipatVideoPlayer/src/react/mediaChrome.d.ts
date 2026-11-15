import type { DetailedHTMLProps, HTMLAttributes } from 'react';

type Tag<Extra = object> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { class?: string; slot?: string } & Extra;

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'media-controller': Tag<{ hotkeys?: string }>;
      'media-control-bar': Tag;
      'media-play-button': Tag;
      'media-seek-backward-button': Tag<{ seekoffset?: string }>;
      'media-mute-button': Tag;
      'media-volume-range': Tag;
      'media-time-display': Tag<{ showduration?: boolean }>;
      'media-loading-indicator': Tag<{ noautohide?: boolean }>;
    }
  }
}
