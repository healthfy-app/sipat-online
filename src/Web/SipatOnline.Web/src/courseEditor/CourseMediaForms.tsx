import { useState, type FormEvent } from 'react';
import {
  removePlatformCourseCover,
  setPlatformCourseCover,
  uploadPlatformVideo,
  type PlatformCourse,
  type PlatformCourseVideo,
} from '../api';
import FilePicker from '../FilePicker';
import { getErrorMessage, maxCoverBytes, maxVideoBytes } from './courseFormat';

export function CourseCoverEditor({
  course,
  onBusyChange,
  onChanged,
  onError,
}: {
  course: PlatformCourse;
  onBusyChange: (busy: boolean) => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function run(action: () => Promise<unknown>, message: string) {
    onError('');
    setIsBusy(true);
    onBusyChange(true);
    try {
      await action();
      await onChanged(message);
    } catch (coverError) {
      onError(getErrorMessage(coverError));
    } finally {
      setIsBusy(false);
      onBusyChange(false);
    }
  }

  function handlePick(file: File | null) {
    if (!file) return;
    if (file.size > maxCoverBytes) {
      onError('A foto excede o limite de 2 MB.');
      return;
    }
    void run(() => setPlatformCourseCover(course.id, file), 'A foto do curso foi atualizada.');
  }

  return (
    <div className="platform-cover-editor">
      {course.coverUrl ? (
        <img alt="Foto atual do curso" className="platform-cover-preview" src={course.coverUrl} />
      ) : (
        <div aria-label={`Prévia da capa de ${course.title}`} className="platform-cover-placeholder">
          <span>PRÉVIA DA CAPA</span>
          <strong>{course.title}</strong>
          <small>Imagem opcional · formato 16:9</small>
        </div>
      )}
      <div className="platform-course-card-actions">
        <FilePicker
          accept="image/png,image/jpeg,image/webp"
          buttonLabel={course.coverUrl ? 'Trocar foto' : 'Escolher foto'}
          disabled={isBusy}
          id="platform-course-cover-file"
          onChange={handlePick}
        />
        {course.coverUrl && (
          <button
            className="button button-quiet"
            disabled={isBusy}
            onClick={() => void run(() => removePlatformCourseCover(course.id), 'A foto do curso foi removida.')}
            type="button"
          >
            Remover foto
          </button>
        )}
      </div>
      <span className="field-hint">PNG, JPEG ou WebP; até 2 MB. Formato 16:9 recomendado.</span>
    </div>
  );
}

function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base ? base.charAt(0).toLocaleUpperCase('pt-BR') + base.slice(1) : '';
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof URL.createObjectURL !== 'function') { resolve(null); return; }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null);
    video.onerror = () => done(null);
    window.setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

export function VideoUploadForm({
  courseId,
  onBusyChange,
  onError,
  onUploaded,
}: {
  courseId?: string;
  onBusyChange?: (busy: boolean) => void;
  onError: (message: string) => void;
  onUploaded: (video: PlatformCourseVideo) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const idSuffix = courseId ?? 'library';
  const tooLarge = file !== null && file.size > maxVideoBytes;

  function chooseFile(picked: File | null) {
    setFile(picked);
    if (!picked) return;
    // sugere um título a partir do nome do arquivo e lê a duração do próprio vídeo
    setTitle((current) => current || titleFromFileName(picked.name));
    readVideoDuration(picked).then((seconds) => {
      if (seconds) setDuration((current) => current || String(Math.round(seconds * 10) / 10));
    });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!file) return;

    onError('');
    setIsUploading(true);
    onBusyChange?.(true);
    try {
      const video = await uploadPlatformVideo(title.trim(), Math.round(Number(duration) * 1000), file, courseId);
      setTitle('');
      setDuration('');
      setFile(null);
      form.reset();
      await onUploaded(video);
    } catch (uploadError) {
      onError(getErrorMessage(uploadError));
    } finally {
      setIsUploading(false);
      onBusyChange?.(false);
    }
  }

  return (
    <form className="event-form event-form-single" onSubmit={handleUpload}>
      <div className="field">
        <label htmlFor={`platform-video-file-${idSuffix}`}>Arquivo de vídeo</label>
        <FilePicker
          accept="video/mp4,video/webm,.mp4,.webm"
          buttonLabel="Escolher vídeo"
          file={file}
          id={`platform-video-file-${idSuffix}`}
          onChange={chooseFile}
          required
        />
        <span className="field-hint">MP4 ou WebM, até 250 MB. O título e a duração são preenchidos a partir do arquivo.</span>
      </div>
      <div className="field">
        <label htmlFor={`platform-video-title-${idSuffix}`}>Título do vídeo</label>
        <input
          id={`platform-video-title-${idSuffix}`}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </div>
      <div className="field">
        <label htmlFor={`platform-video-duration-${idSuffix}`}>Duração (segundos)</label>
        <input
          id={`platform-video-duration-${idSuffix}`}
          max={86400}
          min={0.001}
          onChange={(event) => setDuration(event.target.value)}
          required
          step="any"
          type="number"
          value={duration}
        />
      </div>
      <button className="button button-primary" disabled={isUploading || !file || tooLarge} type="submit">
        {isUploading ? 'Enviando vídeo...' : 'Enviar vídeo'}
      </button>
      {tooLarge && <p className="form-error" role="alert">O arquivo excede o limite de 250 MB.</p>}
    </form>
  );
}
