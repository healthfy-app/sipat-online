import { useRef, useState } from 'react';
import {
  setPlatformCourseModules,
  setVideoCheckpoints,
  type CourseModulePlacement,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseVideo,
} from './api';
import GamePlayer from './GamePlayer';

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível salvar.';
}

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

  async function savePlacements(items: CourseModulePlacement[], message: string) {
    onError('');
    try {
      await setPlatformCourseModules(course.id, items);
      await onChanged(message);
    } catch (error) {
      onError(errorText(error));
    }
  }

  return (
    <section aria-labelledby="course-games-title" className="form-card">
      <p className="eyebrow">JOGOS E PERGUNTAS</p>
      <h2 id="course-games-title">Módulos na trilha do curso</h2>
      <p className="muted-copy">Opcionais: não valem pontos e nunca bloqueiam o participante.</p>
      {course.modules.length === 0 ? (
        <p className="compact-empty">Nenhum módulo na trilha.</p>
      ) : (
        <ul className="platform-video-order">
          {course.modules.map((placement, index) => (
            <li key={`${placement.moduleId}-${index}`}>
              <span>
                <strong>{moduleById(placement.moduleId)?.title ?? 'Módulo removido'}</strong>
                <small>
                  {placement.afterVideoCount === 0 ? 'Antes do primeiro vídeo' : `Após o vídeo ${placement.afterVideoCount}`}
                </small>
              </span>
              <span className="platform-video-order-actions">
                <button
                  aria-label={`Remover módulo ${moduleById(placement.moduleId)?.title ?? ''} da trilha`}
                  className="button button-danger-quiet"
                  onClick={() => void savePlacements(course.modules.filter((_, i) => i !== index), 'O módulo foi removido da trilha.')}
                  type="button"
                >
                  Remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {modules.length > 0 && (
        <div className="platform-link-video">
          <div className="field">
            <label htmlFor="track-module">Módulo</label>
            <select id="track-module" onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
              <option value="">Selecione um módulo</option>
              {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="track-after">Posição na trilha</label>
            <select id="track-after" onChange={(event) => setAfterCount(Number(event.target.value))} value={afterCount}>
              {Array.from({ length: course.videos.length + 1 }, (_, count) => (
                <option key={count} value={count}>
                  {count === 0 ? 'Antes do primeiro vídeo' : `Após o vídeo ${count}`}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button button-secondary"
            disabled={!moduleId}
            onClick={() => {
              const id = moduleId;
              setModuleId('');
              void savePlacements(
                [...course.modules, { moduleId: id, afterVideoCount: afterCount }],
                'O módulo foi adicionado à trilha.',
              );
            }}
            type="button"
          >
            Adicionar à trilha
          </button>
        </div>
      )}
      {course.modules.length > 0 && (
        <div className="platform-link-video">
          {course.modules.map((placement, index) => {
            const found = moduleById(placement.moduleId);
            return found ? (
              <button className="button button-quiet" key={index} onClick={() => setPreviewing(found)} type="button">
                Pré-visualizar {found.title}
              </button>
            ) : null;
          })}
        </div>
      )}

      <h3 className="platform-subheading">Paradas no vídeo</h3>
      {course.videos.length === 0 ? (
        <p className="compact-empty">Vincule vídeos para configurar paradas.</p>
      ) : (
        course.videos.map((video) => (
          <CheckpointEditor key={video.id} modules={modules} onChanged={onChanged} onError={onError} onPreview={setPreviewing} video={video} />
        ))
      )}
      {previewing && <GamePlayer module={previewing} onClose={() => setPreviewing(null)} />}
    </section>
  );
}

function CheckpointEditor({
  video,
  modules,
  onChanged,
  onError,
  onPreview,
}: {
  video: PlatformCourseVideo;
  modules: GameModule[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
  onPreview: (module: GameModule) => void;
}) {
  const [seconds, setSeconds] = useState('');
  const [moduleId, setModuleId] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const fired = useRef(new Set<number>());

  async function save(items: PlatformCourseVideo['checkpoints'], message: string) {
    onError('');
    try {
      await setVideoCheckpoints(video.id, items);
      await onChanged(message);
    } catch (error) {
      onError(errorText(error));
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
    <div className="platform-checkpoint-editor">
      <h4>{video.title}</h4>
      <video
        controls
        onSeeked={() => fired.current.clear()}
        onTimeUpdate={handleTimeUpdate}
        ref={videoRef}
        src={video.fileUrl}
        style={{ maxWidth: '100%' }}
      />
      {video.checkpoints.length > 0 && (
        <ul className="platform-video-order">
          {video.checkpoints.map((checkpoint) => (
            <li key={`${checkpoint.timeMilliseconds}-${checkpoint.moduleId}`}>
              <span>
                <strong>{Math.floor(checkpoint.timeMilliseconds / 1000)} s</strong>
                <small>{modules.find((item) => item.id === checkpoint.moduleId)?.title ?? 'Módulo removido'}</small>
              </span>
              <button
                aria-label={`Remover parada de ${Math.floor(checkpoint.timeMilliseconds / 1000)} segundos em ${video.title}`}
                className="button button-danger-quiet"
                onClick={() => void save(video.checkpoints.filter((item) => item !== checkpoint), 'A parada foi removida.')}
                type="button"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {modules.length > 0 && (
        <div className="platform-link-video">
          <div className="field">
            <label htmlFor={`cp-seconds-${video.id}`}>Parar em (segundos) — {video.title}</label>
            <input id={`cp-seconds-${video.id}`} min={1} onChange={(event) => setSeconds(event.target.value)} type="number" value={seconds} />
          </div>
          <div className="field">
            <label htmlFor={`cp-module-${video.id}`}>Módulo da parada — {video.title}</label>
            <select id={`cp-module-${video.id}`} onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
              <option value="">Selecione</option>
              {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          <button
            className="button button-secondary"
            disabled={!moduleId || !seconds || Number(seconds) < 1}
            onClick={() => {
              const time = Math.round(Number(seconds) * 1000);
              setSeconds('');
              setModuleId('');
              void save([...video.checkpoints, { timeMilliseconds: time, moduleId }], 'A parada foi adicionada.');
            }}
            type="button"
          >
            Adicionar parada
          </button>
        </div>
      )}
    </div>
  );
}
