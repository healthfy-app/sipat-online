import { ChevronRight, Clapperboard, Eye, Plus, Puzzle, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  setPlatformCourseModules,
  setVideoCheckpoints,
  type CourseModulePlacement,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseVideo,
} from './api';
import GamePlayer from '@/games/LazyGamePlayer';
import GameStage from '@/games/GameStage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect } from '@/components/ui/input';
import { gameTypeLabel } from '@/courseEditor/courseTrack';
import { cn } from '@/lib/utils';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível salvar.';
}

function checkpointLabel(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Configura as atividades (jogos e perguntas) de um curso: entre os vídeos e durante um vídeo. */
export default function CourseGamesSection({
  course,
  modules,
  onChanged,
  onError,
}: {
  course: PlatformCourse;
  modules: GameModule[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [moduleId, setModuleId] = useState('');
  const [afterCount, setAfterCount] = useState(course.videos.length);
  const [previewing, setPreviewing] = useState<GameModule | null>(null);
  const moduleById = (id: string) => modules.find((item) => item.id === id);

  async function savePlacements(items: CourseModulePlacement[], message: string): Promise<boolean> {
    onError('');
    try {
      await setPlatformCourseModules(course.id, items);
      await onChanged(message);
      return true;
    } catch (error) {
      onError(errorText(error));
      return false;
    }
  }

  return (
    <section aria-labelledby="course-games-title" className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">INTERATIVIDADE OPCIONAL</p>
          <h2 className="m-0 text-lg font-semibold leading-snug" id="course-games-title">Como usar atividades no curso</h2>
          <p className="m-0 max-w-xl text-sm text-muted-foreground">
            Adicione uma atividade entre vídeos ou faça uma pergunta aparecer durante a reprodução.
          </p>
        </div>
        <Badge variant="default">Sem pontos · nunca bloqueia o progresso</Badge>
      </header>

      <Step
        description="Ela aparece na trilha do participante na posição escolhida."
        icon={<Puzzle />}
        id="course-games-track-title"
        number={1}
        title="Atividade entre vídeos"
      >
        {course.modules.length === 0 && modules.length > 0 && (
          <p className="m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Nenhuma atividade foi adicionada a este curso ainda.
          </p>
        )}

        {course.modules.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0">
            {course.modules.map((placement, index) => {
              const found = moduleById(placement.moduleId);
              const videoTitle = course.videos[placement.afterVideoCount - 1]?.title;
              const position = placement.afterVideoCount === 0
                ? 'Antes do primeiro vídeo'
                : `Depois de ${videoTitle ? `“${videoTitle}”` : `vídeo ${placement.afterVideoCount}`}`;
              return (
                <li className="flex flex-wrap items-center gap-3 rounded-md bg-background px-3 py-2.5" key={`${placement.moduleId}-${index}`}>
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground [&_svg]:size-4"><Puzzle /></span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <strong className="truncate text-sm font-semibold">{found?.title ?? 'Atividade removida'}</strong>
                    <span className="text-[0.8125rem] text-muted-foreground">
                      {found && `${gameTypeLabel(found)} · `}{position}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {found && (
                      <Button aria-label={`Pré-visualizar atividade ${found.title}`} onClick={() => setPreviewing(found)} size="sm" variant="ghost">
                        <Eye /> Pré-visualizar
                      </Button>
                    )}
                    <Button
                      aria-label={`Remover atividade ${found?.title ?? ''} do curso`}
                      onClick={() => void savePlacements(
                        course.modules.filter((_, itemIndex) => itemIndex !== index),
                        'A atividade foi removida da trilha.',
                      )}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 /> Remover
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {modules.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Não há atividades cadastradas na biblioteca. Cadastre uma para poder adicioná-la aqui.
          </p>
        ) : (
          <div className="grid items-end gap-3 rounded-lg bg-background p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field htmlFor="track-module" label="Atividade">
              <NativeSelect id="track-module" onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
                <option value="">Selecione uma atividade</option>
                {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </NativeSelect>
            </Field>
            <Field htmlFor="track-after" label="Quando exibir">
              <NativeSelect id="track-after" onChange={(event) => setAfterCount(Number(event.target.value))} value={afterCount}>
                <option value={0}>Antes do primeiro vídeo</option>
                {course.videos.map((video, index) => (
                  <option key={video.id} value={index + 1}>Depois do vídeo {index + 1} · {video.title}</option>
                ))}
              </NativeSelect>
            </Field>
            <Button
              disabled={!moduleId}
              onClick={() => {
                const id = moduleId;
                void savePlacements(
                  [...course.modules, { moduleId: id, afterVideoCount: afterCount }],
                  'A atividade foi adicionada à trilha.',
                ).then((saved) => { if (saved) setModuleId(''); });
              }}
              variant="outline"
            >
              <Plus /> Adicionar à trilha
            </Button>
          </div>
        )}
      </Step>

      <Step
        description="Escolha o momento e a atividade. O vídeo pausa para exibi-la, sem bloquear a conclusão do curso."
        icon={<Clapperboard />}
        id="course-games-checkpoints-title"
        number={2}
        title="Atividade durante o vídeo"
      >
        {course.videos.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Adicione um vídeo ao curso antes de configurar uma pergunta durante a reprodução.
          </p>
        ) : modules.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Cadastre uma atividade na biblioteca para vinculá-la a um momento do vídeo.
          </p>
        ) : (
          <div className="grid gap-2">
            {course.videos.map((video, index) => (
              <CheckpointEditor
                key={video.id}
                modules={modules}
                onChanged={onChanged}
                onError={onError}
                onPreview={setPreviewing}
                video={video}
                videoNumber={index + 1}
              />
            ))}
          </div>
        )}
      </Step>
      {previewing && <GameStage label={previewing.title} onClose={() => setPreviewing(null)}>
        <GamePlayer module={previewing} onClose={() => setPreviewing(null)} />
      </GameStage>}
    </section>
  );
}

function Step({ id, number, title, description, icon, children }: {
  id: string; number: number; title: string; description: string; icon: ReactNode; children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{number}</span>
        <div className="grid min-w-0 gap-0.5">
          <h3 className="m-0 flex items-center gap-2 text-[0.9375rem] font-semibold leading-snug" id={id}>
            {title} <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          </h3>
          <p className="m-0 text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CheckpointEditor({
  video,
  videoNumber,
  modules,
  onChanged,
  onError,
  onPreview,
}: {
  video: PlatformCourseVideo;
  videoNumber: number;
  modules: GameModule[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onPreview: (module: GameModule) => void;
}) {
  const [seconds, setSeconds] = useState('');
  const [moduleId, setModuleId] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fired = useRef(new Set<number>());
  const count = video.checkpoints.length;

  async function save(items: PlatformCourseVideo['checkpoints'], message: string): Promise<boolean> {
    onError('');
    try {
      await setVideoCheckpoints(video.id, items);
      await onChanged(message);
      return true;
    } catch (error) {
      onError(errorText(error));
      return false;
    }
  }

  function handleTimeUpdate() {
    const element = videoRef.current;
    if (!element) return;
    const nowMs = element.currentTime * 1000;
    for (const checkpoint of video.checkpoints) {
      if (nowMs >= checkpoint.timeMilliseconds && !fired.current.has(checkpoint.timeMilliseconds)) {
        fired.current.add(checkpoint.timeMilliseconds);
        const found = modules.find((item) => item.id === checkpoint.moduleId);
        if (found) {
          element.pause();
          onPreview(found);
        }
      }
    }
  }

  return (
    <details className="group overflow-hidden rounded-lg bg-background open:bg-card open:shadow-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 gap-0.5">
          <strong className="truncate text-sm font-semibold">Vídeo {videoNumber} · {video.title}</strong>
          <small className="text-[0.8125rem] text-muted-foreground">
            {count === 0 ? 'Nenhuma pergunta configurada' : `${count} ${count === 1 ? 'pergunta configurada' : 'perguntas configuradas'}`}
          </small>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-primary">
          Configurar vídeo <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
        </span>
      </summary>
      <div className="grid gap-4 border-t border-border px-3.5 py-4">
        <video
          aria-label={`Prévia de ${video.title}`}
          className="aspect-video max-h-72 w-full rounded-md bg-black"
          controls
          onSeeked={() => fired.current.clear()}
          onTimeUpdate={handleTimeUpdate}
          ref={videoRef}
          src={video.fileUrl}
        />
        {count > 0 && (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {video.checkpoints.map((checkpoint) => (
              <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-background px-3 py-2 text-sm" key={`${checkpoint.timeMilliseconds}-${checkpoint.moduleId}`}>
                <span className={cn('rounded bg-accent px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-accent-foreground')}>
                  {checkpointLabel(checkpoint.timeMilliseconds)}
                </span>
                <span className="truncate">{modules.find((item) => item.id === checkpoint.moduleId)?.title ?? 'Atividade removida'}</span>
                <Button
                  aria-label={`Remover pergunta de ${checkpointLabel(checkpoint.timeMilliseconds)} em ${video.title}`}
                  onClick={() => void save(video.checkpoints.filter((item) => item !== checkpoint), 'A atividade foi removida do vídeo.')}
                  size="sm"
                  variant="destructive"
                >
                  <Trash2 /> Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid items-end gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <Field htmlFor={`cp-seconds-${video.id}`} label="Momento do vídeo (segundos)">
            <Input id={`cp-seconds-${video.id}`} min={1} onChange={(event) => setSeconds(event.target.value)} placeholder="Ex.: 45" type="number" value={seconds} />
          </Field>
          <Field htmlFor={`cp-module-${video.id}`} label="Atividade a exibir">
            <NativeSelect id={`cp-module-${video.id}`} onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
              <option value="">Selecione uma atividade</option>
              {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </NativeSelect>
          </Field>
          <Button
            aria-label={`Adicionar parada no vídeo ${video.title}`}
            disabled={!moduleId || !seconds || Number(seconds) < 1}
            onClick={() => {
              const time = Math.round(Number(seconds) * 1000);
              void save([...video.checkpoints, { timeMilliseconds: time, moduleId }], 'A atividade foi adicionada ao vídeo.')
                .then((saved) => { if (saved) { setSeconds(''); setModuleId(''); } });
            }}
            variant="outline"
          >
            <Plus /> Adicionar parada
          </Button>
        </div>
      </div>
    </details>
  );
}
