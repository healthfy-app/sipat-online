import { useState, type FormEvent } from 'react';
import {
  removePlatformCourseCover,
  setPlatformCourseCover,
  uploadPlatformVideo,
  type PlatformCourse,
  type PlatformCourseVideo,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import FilePicker from '@/components/ui/file-picker';
import { Input } from '@/components/ui/input';
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
    <div className="grid gap-3">
      {course.coverUrl ? (
        <img alt="Foto atual do curso" className="aspect-video w-full rounded-md object-cover" src={course.coverUrl} />
      ) : (
        <div
          aria-label={`Prévia da capa de ${course.title}`}
          className="grid aspect-video w-full content-center justify-items-center gap-1.5 overflow-hidden rounded-md border border-dashed border-input bg-[radial-gradient(ellipse_at_80%_10%,rgb(255_209_102/0.35),transparent_55%),linear-gradient(145deg,var(--green-soft),var(--canvas))] p-4 text-center"
        >
          <span className="text-[0.625rem] font-bold tracking-[0.1em] text-primary">PRÉVIA DA CAPA</span>
          <strong className="max-w-full text-lg leading-tight [overflow-wrap:anywhere] [text-wrap:balance]">{course.title}</strong>
          <small className="text-xs text-muted-foreground">Imagem opcional · formato 16:9</small>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <FilePicker
          accept="image/png,image/jpeg,image/webp"
          buttonLabel={course.coverUrl ? 'Trocar foto' : 'Escolher foto'}
          disabled={isBusy}
          id="platform-course-cover-file"
          onChange={handlePick}
        />
        {course.coverUrl && (
          <Button disabled={isBusy} variant="ghost"
            onClick={() => void run(() => removePlatformCourseCover(course.id), 'A foto do curso foi removida.')}>
            Remover foto
          </Button>
        )}
      </div>
      <p className="m-0 text-xs text-muted-foreground">PNG, JPEG ou WebP; até 2 MB. Formato 16:9 recomendado.</p>
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
    <form className="grid gap-4" onSubmit={handleUpload}>
      <Field hint="MP4 ou WebM, até 250 MB. O título e a duração são preenchidos a partir do arquivo."
        htmlFor={`platform-video-file-${idSuffix}`} label="Arquivo de vídeo">
        <FilePicker accept="video/mp4,video/webm,.mp4,.webm" buttonLabel="Escolher vídeo" file={file}
          id={`platform-video-file-${idSuffix}`} onChange={chooseFile} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <Field htmlFor={`platform-video-title-${idSuffix}`} label="Título do vídeo">
          <Input id={`platform-video-title-${idSuffix}`} maxLength={200} required value={title}
            onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field htmlFor={`platform-video-duration-${idSuffix}`} label="Duração (segundos)">
          <Input id={`platform-video-duration-${idSuffix}`} max={86400} min={0.001} required step="any" type="number"
            value={duration} onChange={(event) => setDuration(event.target.value)} />
        </Field>
      </div>
      {tooLarge && (
        <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
          O arquivo excede o limite de 250 MB.
        </p>
      )}
      <Button className="justify-self-end" disabled={isUploading || !file || tooLarge} type="submit">
        {isUploading ? 'Enviando vídeo...' : 'Enviar vídeo'}
      </Button>
    </form>
  );
}
