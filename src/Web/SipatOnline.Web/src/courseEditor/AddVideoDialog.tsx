import { useState } from 'react';
import type { PlatformCourseVideo, PlatformLibraryVideo } from '../api';
import CourseDialog from '../CourseDialog';
import { VideoUploadForm } from './CourseMediaForms';

export default function AddVideoDialog({
  courseId,
  availableVideos,
  busy,
  error,
  onBusyChange,
  onClose,
  onError,
  onLink,
  onUploaded,
}: {
  courseId: string;
  availableVideos: PlatformLibraryVideo[];
  busy: boolean;
  error: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onLink: (videoId: string) => void;
  onUploaded: (video: PlatformCourseVideo) => Promise<void>;
}) {
  const [videoToLink, setVideoToLink] = useState('');

  return (
    <CourseDialog busy={busy} onClose={onClose} title="Adicionar vídeo">
      {error && <p className="form-error" role="alert">{error}</p>}
      {availableVideos.length > 0 && (
        <div className="platform-link-video">
          <div className="field">
            <label htmlFor="link-library-video">Vincular da biblioteca</label>
            <select id="link-library-video" onChange={(event) => setVideoToLink(event.target.value)} value={videoToLink}>
              <option value="">Selecione um vídeo</option>
              {availableVideos.map((item) => (
                <option key={item.video.id} value={item.video.id}>{item.video.title}</option>
              ))}
            </select>
          </div>
          <button
            className="button button-secondary"
            disabled={!videoToLink || busy}
            onClick={() => { const id = videoToLink; setVideoToLink(''); onLink(id); }}
            type="button"
          >
            Vincular vídeo
          </button>
        </div>
      )}
      <h3 className="platform-subheading">Enviar novo vídeo</h3>
      <VideoUploadForm courseId={courseId} onBusyChange={onBusyChange} onError={onError} onUploaded={onUploaded} />
    </CourseDialog>
  );
}
