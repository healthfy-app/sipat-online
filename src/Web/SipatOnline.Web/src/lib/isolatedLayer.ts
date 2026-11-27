import { useEffect, type KeyboardEvent, type RefObject } from 'react';

const tabbable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

/**
 * A layer over the whole page (a dialog, a game, a preview) portaled into `<body>`: while it is mounted, everything
 * else in `<body>` is inert and the page does not scroll; on unmount each element gets back the inert state it had and
 * the focus returns to where it was. Layers stack: one opened over another saves and restores the other's state.
 *
 * `focus`: selectors tried in order for what takes the focus when the layer opens (the panel itself when none matches).
 * `keepInnerFocus`: leave the focus alone when something inside already has it (an `autoFocus` field, say).
 */
export function useIsolatedLayer(panel: RefObject<HTMLElement | null>, { focus, keepInnerFocus = false }: { focus: string[]; keepInnerFocus?: boolean }) {
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && !element.contains(panel.current),
    );
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    document.body.style.overflow = 'hidden';
    if (!(keepInnerFocus && panel.current?.contains(document.activeElement))) {
      const first = focus.reduce<HTMLElement | null>((found, selector) => found ?? panel.current?.querySelector<HTMLElement>(selector) ?? null, null);
      (first ?? panel.current)?.focus();
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
    // read once, at mount: the layer isolates the page it opened over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Keeps Tab and Shift+Tab going round the controls of `container`, for the `onKeyDown` of a layer's panel. */
export function keepTabInside(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
  if (event.key !== 'Tab') return;
  const elements = Array.from(container?.querySelectorAll<HTMLElement>(tabbable) ?? []).filter(element => element.tabIndex >= 0);
  if (!elements.length) { event.preventDefault(); return; }
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
