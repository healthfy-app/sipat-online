import { useRef, useState, type FormEvent } from 'react';
import { createExternalPlatformVideo, type PlatformCourseVideo, type PlatformLibraryVideo } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/courseCatalog/SegmentedControl';
import ExternalVideoPreview from '@/ExternalVideoPreview';
import { formatDuration, getErrorMessage } from './courseFormat';
import { externalIdFromLink } from './externalLink';
import { VideoUploadForm } from './CourseMediaForms';
import LibraryVideoPicker from './LibraryVideoPicker';

type Source = 'house' | 'YouTube' | 'Vimeo';

const sources: { value: Source; label: string }[] = [
  { value: 'house', label: 'Nosso vídeo' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'Vimeo', label: 'Vimeo' },
];

export default function AddVideoDialog({
  courseId,
  availableVideos,
  busy,
  error,
  onBusyChange,
  onClose,
  onError,
  onLink,
  onQueued,
  libraryOnly = false,
}: {
  courseId: string;
  availableVideos: PlatformLibraryVideo[];
  busy: boolean;
  error: string;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onError: (message: string) => void;
  onLink: (videoId: string) => void;
  onQueued: (count: number) => void;
  /** A company's training: the videos come from what the company can use; sending new ones has its own place. */
  libraryOnly?: boolean;
}) {
  const [videoToLink, setVideoToLink] = useState('');
  const [source, setSource] = useState<Source>('house');

  return (
    <Dialog busy={busy} onClose={onClose} size="lg" title="Adicionar vídeo">
      <div className="grid gap-5">
        {!libraryOnly && <SegmentedControl disabled={busy} label="Origem do vídeo" onChange={setSource} options={sources} value={source} />}
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        {source === 'house' ? <>
          {availableVideos.length > 0 && (
            <div className="grid gap-3 rounded-lg bg-background p-4">
              <h3 className="m-0 text-sm font-semibold">Vincular da biblioteca</h3>
              <LibraryVideoPicker onChange={setVideoToLink} value={videoToLink} videos={availableVideos} />
              <Button className="justify-self-start" disabled={!videoToLink || busy} variant="outline"
                onClick={() => { const id = videoToLink; setVideoToLink(''); onLink(id); }}>
                Vincular vídeo
              </Button>
            </div>
          )}
          {libraryOnly && availableVideos.length === 0 && <p className="m-0 text-sm text-muted-foreground">Todos os vídeos disponíveis para a sua empresa já estão neste treinamento.</p>}
          {!libraryOnly && <div className="grid gap-3">
            <h3 className="m-0 text-sm font-semibold">Enviar novos vídeos</h3>
            <VideoUploadForm courseId={courseId} onQueued={onQueued} />
          </div>}
        </> : (
          <ExternalVideoForm busy={busy} key={source} onBusyChange={onBusyChange} onError={onError} onLink={onLink} provider={source} />
        )}
      </div>
    </Dialog>
  );
}

function ExternalVideoForm({ provider, busy, onBusyChange, onError, onLink }: {
  provider: 'YouTube' | 'Vimeo';
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onLink: (videoId: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  // the real length, read from the provider's player in the preview; the minutes are only a fallback
  const [readMs, setReadMs] = useState<number | null>(null);
  const [linkError, setLinkError] = useState('');
  const submitting = useRef(false);
  const externalId = externalIdFromLink(provider, url);
  const minutesValid = /^[1-9]\d*$/.test(minutes);
  const durationMs = readMs ?? (minutesValid ? Number(minutes) * 60000 : null);
  const canAdd = !!externalId && title.trim() !== '' && durationMs !== null && !busy;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || submitting.current) return;
    submitting.current = true;
    setLinkError('');
    onError('');
    onBusyChange(true);
    let created: PlatformCourseVideo;
    try {
      created = await createExternalPlatformVideo({
        provider,
        url: url.trim(),
        title: title.trim(),
        durationMilliseconds: durationMs,
      });
    } catch (failure) {
      submitting.current = false;
      setLinkError(getErrorMessage(failure));
      return;
    } finally {
      onBusyChange(false);
    }
    onLink(created.id);
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
      <Field error={linkError} htmlFor="external-video-url" label="Link do vídeo">
        <Input aria-invalid={linkError ? true : undefined} id="external-video-url" onChange={(event) => { setUrl(event.target.value); setLinkError(''); setReadMs(null); }}
          placeholder={provider === 'YouTube' ? 'https://www.youtube.com/watch?v=…' : 'https://vimeo.com/…'} value={url} />
      </Field>
      {externalId && (
        <ExternalVideoPreview key={externalId} onDuration={(seconds) => setReadMs(Math.round(seconds * 1000))}
          title={`Prévia de ${title.trim() || 'vídeo'}`} video={{ provider, externalId }} />
      )}
      <Field htmlFor="external-video-title" label="Título">
        <Input id="external-video-title" maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} />
      </Field>
      {readMs !== null
        ? <p className="m-0 text-sm">Duração: <strong>{formatDuration(readMs)}</strong> <span className="text-muted-foreground">(lida do vídeo)</span></p>
        : (
          <Field error={minutes === '' || minutesValid ? undefined : 'Informe os minutos em número inteiro.'} htmlFor="external-video-minutes" label="Duração (min)">
            <Input id="external-video-minutes" inputMode="numeric" onChange={(event) => setMinutes(event.target.value)} value={minutes} />
          </Field>
        )}
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">Conta no progresso e no certificado: o participante assiste em sequência, sem pular.</p>
      <Button className="justify-self-start" disabled={!canAdd} type="submit">Adicionar</Button>
    </form>
  );
}
