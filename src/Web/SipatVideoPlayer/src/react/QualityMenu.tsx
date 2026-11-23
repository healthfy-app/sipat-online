import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { QUALITY_ORDER, type QualityPreference, type SourceQuality } from '../core/sources';
import { texts } from './texts';

/** The quality button of the control bar and its menu: Automática, then the versions this video has, best first. */
export default function QualityMenu({ preference, current, available = ['720p', '480p'], onChoose }: {
  preference: QualityPreference;
  /** The rendition playing now. */
  current: SourceQuality | undefined;
  /** The versions this video has. */
  available?: readonly SourceQuality[];
  onChoose: (value: QualityPreference) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const options: Array<{ value: QualityPreference; label: string }> = [
    { value: 'auto', label: texts.qualityAuto },
    ...QUALITY_ORDER.filter(quality => available.includes(quality)).map(quality => ({ value: quality, label: quality })),
  ];
  const label = preference === 'auto'
    ? `${texts.quality}: ${texts.qualityAuto}${current ? ` (${current})` : ''}`
    : `${texts.quality}: ${preference}`;

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); };
  }, [open]);

  return <span className="sipat-player-quality" ref={root}>
    <button aria-expanded={open} aria-haspopup="menu" aria-label={label} className="sipat-player-button" onClick={() => setOpen(value => !value)} type="button">
      <Settings aria-hidden="true" />
    </button>
    {open && <div aria-label={texts.quality} className="sipat-player-menu" role="menu">
      {options.map(option => <button
        aria-checked={preference === option.value} className="sipat-player-menuitem" key={option.value}
        onClick={() => { setOpen(false); onChoose(option.value); }} role="menuitemradio" type="button">
        {option.label}
      </button>)}
    </div>}
  </span>;
}
