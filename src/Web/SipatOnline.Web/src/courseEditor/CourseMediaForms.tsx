import { useRef, useState, type DragEvent } from 'react';
import { CloudUpload, FileVideo, X } from 'lucide-react';
import {
  removePlatformCourseCover,
  setPlatformCourseCover,
  type PlatformCourse,
} from '@/api';
import { Button } from '@/components/ui/button';
import FilePicker from '@/components/ui/file-picker';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { checkVideoFile, enqueueUploads, fileKey, titleFromFileName } from '@/videoUploads/uploadQueue';
import { formatBytes, getErrorMessage, maxCoverBytes } from './courseFormat';

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
    void run(() => setPlatformCourseCover(course.id, file), 'A foto do treinamento foi atualizada.');
  }

  return (
    <div className="grid gap-3">
      {course.coverUrl ? (
        <img alt="Foto atual do treinamento" className="aspect-video w-full rounded-md object-cover" src={course.coverUrl} />
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
            onClick={() => void run(() => removePlatformCourseCover(course.id), 'A foto do treinamento foi removida.')}>
            Remover foto
          </Button>
        )}
      </div>
      <p className="m-0 text-xs text-muted-foreground">PNG, JPEG ou WebP; até 2 MB. Formato 16:9 recomendado.</p>
    </div>
  );
}

type PickedVideo = { key: string; file: File; title: string; problem: string | null };

function toPicked(files: File[], known: Set<string>): PickedVideo[] {
  const picked: PickedVideo[] = [];
  for (const file of files) {
    const key = fileKey(file);
    if (known.has(key)) continue;
    known.add(key);
    picked.push({ key, file, title: titleFromFileName(file.name), problem: checkVideoFile(file) });
  }
  return picked;
}

/**
 * Picks one or many videos (button or drag and drop), lets the operator fix the titles, and hands them
 * to the upload queue. The queue sends them in the background: the dialog closes right away.
 */
export function VideoUploadForm({
  courseId,
  initialFiles,
  onQueued,
}: {
  courseId?: string;
  /** Files dropped on the page before the form opened. */
  initialFiles?: File[];
  onQueued: (count: number) => void;
}) {
  const [picked, setPicked] = useState<PickedVideo[]>(() => toPicked(initialFiles ?? [], new Set()));
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputId = `platform-video-files-${courseId ?? 'library'}`;
  const ready = picked.filter((item) => !item.problem);
  const readyBytes = ready.reduce((total, item) => total + item.file.size, 0);

  function add(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setPicked((current) => [...current, ...toPicked(Array.from(files), new Set(current.map((item) => item.key)))]);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    add(event.dataTransfer.files);
  }

  function submit() {
    const entries = ready.map((item) => ({ file: item.file, title: item.title.trim() || titleFromFileName(item.file.name) }));
    if (entries.length === 0) return;
    enqueueUploads(entries, courseId);
    setPicked([]);
    onQueued(entries.length);
  }

  return (
    <div className="grid gap-4">
      <label
        className={cn(
          'group grid cursor-pointer justify-items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-[border-color,background-color] duration-150',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
          isDragging ? 'border-primary bg-accent' : 'border-input bg-background hover:border-primary/50',
          picked.length > 0 && 'py-5',
          'max-[640px]:px-4 max-[640px]:py-6',
        )}
        htmlFor={inputId}
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDragging(true); }}
        onDragLeave={() => { dragDepth.current -= 1; if (dragDepth.current <= 0) setIsDragging(false); }}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
        onDrop={handleDrop}
      >
        <span className={cn(
          'grid size-11 place-items-center rounded-full bg-card text-primary shadow-sm transition-transform duration-150',
          isDragging && 'scale-110',
        )}>
          <CloudUpload aria-hidden="true" className="size-5" />
        </span>
        <strong className="text-[0.9375rem] max-[640px]:hidden">{isDragging ? 'Solte os vídeos aqui' : 'Arraste os vídeos para cá'}</strong>
        <strong className="hidden text-[0.9375rem] max-[640px]:block">Toque para escolher os vídeos</strong>
        <span className="text-sm text-muted-foreground max-[640px]:hidden">
          ou <span className="font-semibold text-primary underline-offset-4 group-hover:underline">escolha no computador</span>
        </span>
        <small className="text-xs text-muted-foreground">MP4 ou WebM, até 2 GB cada. Dá para selecionar vários de uma vez.</small>
        <input
          accept="video/mp4,video/webm,.mp4,.webm"
          className="sr-only"
          id={inputId}
          multiple
          onChange={(event) => { add(event.target.files); event.target.value = ''; }}
          type="file"
        />
      </label>

      {picked.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {ready.length === 1 ? '1 vídeo' : `${ready.length} vídeos`} · {formatBytes(readyBytes)}
              {picked.length > ready.length && <span className="text-destructive"> · {picked.length - ready.length} com problema</span>}
            </span>
            <Button onClick={() => setPicked([])} size="sm" variant="ghost">Limpar lista</Button>
          </div>
          <ul aria-label="Vídeos escolhidos" className="m-0 grid max-h-72 list-none overscroll-contain max-[640px]:max-h-[40vh] gap-1.5 overflow-y-auto p-0 pr-1">
            {picked.map((item) => (
              <li className={cn(
                'flex items-center gap-3 rounded-lg border bg-card px-3 py-2',
                item.problem ? 'border-destructive/30' : 'border-border',
              )} key={item.key}>
                <FileVideo aria-hidden="true" className={cn('size-5 shrink-0', item.problem ? 'text-destructive' : 'text-muted-foreground')} />
                <div className="grid min-w-0 flex-1 gap-1">
                  <Input
                    aria-label={`Título de ${item.file.name}`}
                    className="h-8"
                    disabled={!!item.problem}
                    maxLength={200}
                    onChange={(event) => {
                      const title = event.target.value;
                      setPicked((current) => current.map((entry) => (entry.key === item.key ? { ...entry, title } : entry)));
                    }}
                    value={item.title}
                  />
                  <span className="truncate text-xs text-muted-foreground">
                    {item.file.name} · {formatBytes(item.file.size)}
                  </span>
                  {item.problem && <span className="text-xs font-medium text-destructive">{item.problem}</span>}
                </div>
                <Button aria-label={`Tirar ${item.file.name} da lista`} className="max-[640px]:size-10" size="icon-sm" variant="ghost"
                  onClick={() => setPicked((current) => current.filter((entry) => entry.key !== item.key))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[26rem] text-xs leading-relaxed text-muted-foreground">
          Os vídeos sobem em segundo plano: pode fechar esta janela e continuar usando o sistema. Só não feche a aba do navegador até terminar.
        </p>
        <Button className="ml-auto max-[640px]:h-11 max-[640px]:w-full" disabled={ready.length === 0} onClick={submit}>
          <CloudUpload /> {ready.length > 1 ? `Enviar ${ready.length} vídeos` : 'Enviar vídeo'}
        </Button>
      </div>
    </div>
  );
}
