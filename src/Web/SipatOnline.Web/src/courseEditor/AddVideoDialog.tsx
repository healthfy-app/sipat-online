import { useRef, useState, type FormEvent } from 'react';
import { createExternalPlatformVideo, type PlatformCourseVideo, type PlatformLibraryVideo } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { SegmentedControl } from '@/courseCatalog/SegmentedControl';
import ExternalVideoPreview from '@/ExternalVideoPreview';
import { getErrorMessage } from './courseFormat';
import { externalIdFromLink } from './externalLink';
import { VideoUploadForm } from './CourseMediaForms';

type Source = 'house' | 'YouTube' | 'Vimeo' | 'Smartplayer';

const sources: { value: Source; label: string }[] = [
  { value: 'house', label: 'Nosso vídeo' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'Vimeo', label: 'Vimeo' },
  { value: 'Smartplayer', label: 'Smartplayer' },
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
  const [source, setSource] = useState<Source>('house');

  return (
    <Dialog busy={busy} onClose={onClose} title="Adicionar vídeo">
      <div className="grid gap-5">
        <SegmentedControl disabled={busy} label="Origem do vídeo" onChange={setSource} options={sources} value={source} />
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        {source === 'house' ? <>
          {availableVideos.length > 0 && (
            <div className="grid gap-3 rounded-lg bg-background p-4">
              <Field htmlFor="link-library-video" label="Vincular da biblioteca">
                <NativeSelect id="link-library-video" onChange={(event) => setVideoToLink(event.target.value)} value={videoToLink}>
                  <option value="">Selecione um vídeo</option>
                  {availableVideos.map((item) => (
                    <option key={item.video.id} value={item.video.id}>{item.video.title}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Button className="justify-self-start" disabled={!videoToLink || busy} variant="outline"
                onClick={() => { const id = videoToLink; setVideoToLink(''); onLink(id); }}>
                Vincular vídeo
              </Button>
            </div>
          )}
          <div className="grid gap-3">
            <h3 className="m-0 text-sm font-semibold">Enviar novo vídeo</h3>
            <VideoUploadForm courseId={courseId} onBusyChange={onBusyChange} onError={onError} onUploaded={onUploaded} />
          </div>
        </> : (
          <ExternalVideoForm busy={busy} key={source} onBusyChange={onBusyChange} onError={onError} onLink={onLink} provider={source} />
        )}
      </div>
    </Dialog>
  );
}

function ExternalVideoForm({ provider, busy, onBusyChange, onError, onLink }: {
  provider: 'YouTube' | 'Vimeo' | 'Smartplayer';
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string) => void;
  onLink: (videoId: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('');
  const [linkError, setLinkError] = useState('');
  const submitting = useRef(false);
  const externalId = externalIdFromLink(provider, url);
  const minutesValid = minutes === '' || /^[1-9]\d*$/.test(minutes);
  const canAdd = !!externalId && title.trim() !== '' && minutesValid && !busy;

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
        durationMilliseconds: minutes === '' ? null : Number(minutes) * 60000,
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
      <Field error={linkError} htmlFor="external-video-url" label={provider === 'Smartplayer' ? 'Link ou código embed (iframe)' : 'Link do vídeo'}>
        <Input aria-invalid={linkError ? true : undefined} id="external-video-url" onChange={(event) => { setUrl(event.target.value); setLinkError(''); }}
          placeholder={provider === 'YouTube' ? 'https://www.youtube.com/watch?v=…' : provider === 'Vimeo' ? 'https://vimeo.com/…' : 'Cole o código embed do Smartplayer'} value={url} />
      </Field>
      {externalId && (
        <ExternalVideoPreview title={`Prévia de ${title.trim() || 'vídeo'}`} video={{ provider, externalId }} />
      )}
      <Field htmlFor="external-video-title" label="Título">
        <Input id="external-video-title" maxLength={160} onChange={(event) => setTitle(event.target.value)} value={title} />
      </Field>
      <Field error={minutesValid ? undefined : 'Informe os minutos em número inteiro.'} htmlFor="external-video-minutes" label="Duração (min)">
        <Input id="external-video-minutes" inputMode="numeric" onChange={(event) => setMinutes(event.target.value)} value={minutes} />
      </Field>
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">Vídeo extra: não conta no progresso nem no certificado.</p>
      <Button className="justify-self-start" disabled={!canAdd} type="submit">Adicionar</Button>
    </form>
  );
}
