import { useState } from 'react';
import InteractiveGame from '../InteractiveGame';
import VideoPreview from '../VideoPreview';
import type { TrackItem } from './courseTrack';

export type PreviewSize = 'phone' | 'desktop';

export default function CoursePreviewCanvas({
  track,
  selectedIndex,
  size,
  onSize,
  onSelectIndex,
}: {
  track: TrackItem[];
  selectedIndex: number;
  size: PreviewSize;
  onSize: (size: PreviewSize) => void;
  onSelectIndex: (index: number) => void;
}) {
  const [replay, setReplay] = useState(0);
  const item = track[selectedIndex];
  const progress = track.length === 0 ? 0 : ((selectedIndex + 1) / track.length) * 100;

  return (
    <section aria-label="Prévia do curso" className={`ce-canvas is-${size}`}>
      <div aria-label="Tamanho da prévia" className="ce-canvas-toolbar" role="group">
        <button aria-label="Celular" aria-pressed={size === 'phone'} className="ce-icon-btn" onClick={() => onSize('phone')}
          title="Celular" type="button"><PhoneIcon /></button>
        <button aria-label="Desktop" aria-pressed={size === 'desktop'} className="ce-icon-btn" onClick={() => onSize('desktop')}
          title="Desktop" type="button"><DesktopIcon /></button>
      </div>

      <div className="ce-device">
        <div aria-hidden="true" className="ce-device-progress"><span style={{ width: `${progress}%` }} /></div>
        <header className="ce-device-header">
          <span className="ce-device-brand">SIPAT Online</span>
          {item && <span className="ce-device-count">{selectedIndex + 1} / {track.length}</span>}
        </header>
        <div className={`ce-device-body${item?.kind === 'activity' ? ' is-activity' : ''}`}>
          {!item && <p className="ce-device-empty">Adicione um vídeo para visualizar o conteúdo.</p>}
          {item?.kind === 'video' && <>
            <h2>{item.video.title}</h2>
            <VideoPreview key={item.video.id} src={item.video.fileUrl} title={`Prévia de ${item.video.title}`} />
          </>}
          {item?.kind === 'activity' && (
            <div className="ce-device-sheet">
              <InteractiveGame key={`${item.key}-${replay}`} module={item.module} onClose={() => setReplay((value) => value + 1)} />
            </div>
          )}
        </div>
      </div>

      <nav aria-label="Navegar na prévia" className="ce-canvas-nav">
        <button aria-label="Item anterior" className="ce-round-btn" disabled={selectedIndex <= 0}
          onClick={() => onSelectIndex(selectedIndex - 1)} type="button">←</button>
        <button aria-label="Próximo item" className="ce-round-btn" disabled={selectedIndex >= track.length - 1}
          onClick={() => onSelectIndex(selectedIndex + 1)} type="button">→</button>
      </nav>
    </section>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="13" rx="2" stroke="currentColor" strokeWidth="1.5" width="8" x="4" y="1.5" />
      <path d="M7 12h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
      <rect height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" width="13" x="1.5" y="2" />
      <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}
