import type { PlatformLibraryVideo } from '../api';
import VideoPreview from '../VideoPreview';
import { formatBytes, formatDuration, pluralize } from '../courseEditor/courseFormat';

export default function VideoLibraryPanel({
  library,
  onUpload,
}: {
  library: PlatformLibraryVideo[];
  onUpload: () => void;
}) {
  return (
    <section aria-label="Vídeos cadastrados" className="cat-panel">
      <div className="cat-toolbar">
        <p className="cat-toolbar-text">Vídeos reutilizáveis em qualquer curso do catálogo.</p>
        <span className="cat-result-count">{pluralize(library.length, 'vídeo', 'vídeos')}</span>
      </div>

      {library.length === 0 ? (
        <div className="cat-empty">
          <p>A biblioteca ainda não tem vídeos.</p>
          <button className="cat-btn cat-btn-primary" onClick={onUpload} type="button">Enviar o primeiro vídeo</button>
        </div>
      ) : (
        <div className="cat-grid cat-grid-videos">
          {library.map(({ video, courseCount }) => (
            <article className="cat-video" key={video.id}>
              <div className="cat-video-media">
                <VideoPreview preload="metadata" src={video.fileUrl} title={`Prévia de ${video.title}`} />
              </div>
              <div className="cat-card-body">
                <h3 className="cat-card-title" title={video.title}>{video.title}</h3>
                <p className="cat-card-meta">
                  {formatDuration(video.durationMilliseconds)} · {formatBytes(video.sizeBytes)}
                </p>
                <span className={`cat-usage${courseCount === 0 ? ' is-unused' : ''}`}>
                  {courseCount === 0 ? 'Ainda não usado em cursos' : `Usado em ${pluralize(courseCount, 'curso', 'cursos')}`}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
