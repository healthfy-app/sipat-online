import { useState } from 'react';
import type { PlatformCourseVideo, PlatformLibraryVideo } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { NativeSelect } from '@/components/ui/input';
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
    <Dialog busy={busy} onClose={onClose} title="Adicionar vídeo">
      <div className="grid gap-5">
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
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
      </div>
    </Dialog>
  );
}
