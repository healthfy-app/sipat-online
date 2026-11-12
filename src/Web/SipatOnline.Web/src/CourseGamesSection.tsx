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

function checkpointLabel(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
    <section aria-labelledby="course-games-title" className="course-games-config">
      <header className="course-games-intro">
        <div>
          <p className="eyebrow">INTERATIVIDADE OPCIONAL</p>
          <h2 id="course-games-title">Como usar atividades no curso</h2>
          <p className="muted-copy">
            Adicione uma atividade entre vídeos ou faça uma pergunta aparecer durante a reprodução.
          </p>
        </div>
        <span className="course-games-guarantee">Sem pontos · nunca bloqueia o progresso</span>
      </header>

      <div className="course-games-workflow">
        <section aria-labelledby="course-games-track-title" className="course-games-step">
          <div className="course-games-step-heading">
            <span aria-hidden="true" className="course-games-step-number">1</span>
            <div>
              <h3 id="course-games-track-title">Atividade entre vídeos</h3>
              <p>Ela aparece na trilha do participante na posição escolhida.</p>
            </div>
          </div>

          {course.modules.length === 0 && modules.length > 0 ? (
            <p className="course-games-empty">
              Nenhuma atividade foi adicionada a este curso ainda.
            </p>
          ) : course.modules.length > 0 ? (
            <ul className="course-games-placement-list">
              {course.modules.map((placement, index) => {
                const found = moduleById(placement.moduleId);
                const videoTitle = course.videos[placement.afterVideoCount - 1]?.title;
                const position = placement.afterVideoCount === 0
                  ? 'Antes do primeiro vídeo'
                  : `Depois de ${videoTitle ? `“${videoTitle}”` : `vídeo ${placement.afterVideoCount}`}`;
                return (
                  <li className="course-games-placement" key={`${placement.moduleId}-${index}`}>
                    <div className="course-games-placement-copy">
                      <strong>{found?.title ?? 'Atividade removida'}</strong>
                      <span>{position}</span>
                    </div>
                    <div className="course-games-placement-actions">
                      {found && (
                        <button
                          aria-label={`Pré-visualizar atividade ${found.title}`}
                          className="button button-quiet"
                          onClick={() => setPreviewing(found)}
                          type="button"
                        >
                          Pré-visualizar
                        </button>
                      )}
                      <button
                        aria-label={`Remover atividade ${found?.title ?? ''} do curso`}
                        className="button button-danger-quiet"
                        onClick={() => void savePlacements(
                          course.modules.filter((_, itemIndex) => itemIndex !== index),
                          'A atividade foi removida da trilha.',
                        )}
                        type="button"
                      >
                        Remover
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {modules.length === 0 ? (
            <p className="course-games-empty">
              Não há atividades cadastradas na biblioteca. Cadastre uma para poder adicioná-la aqui.
            </p>
          ) : (
            <div className="course-games-add-form">
              <div className="field">
                <label htmlFor="track-module">Atividade</label>
                <select id="track-module" onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
                  <option value="">Selecione uma atividade</option>
                  {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="track-after">Quando exibir</label>
                <select id="track-after" onChange={(event) => setAfterCount(Number(event.target.value))} value={afterCount}>
                  <option value={0}>Antes do primeiro vídeo</option>
                  {course.videos.map((video, index) => (
                    <option key={video.id} value={index + 1}>Depois do vídeo {index + 1} · {video.title}</option>
                  ))}
                </select>
              </div>
              <button
                className="button button-secondary"
                disabled={!moduleId}
                onClick={() => {
                  const id = moduleId;
                  void savePlacements(
                    [...course.modules, { moduleId: id, afterVideoCount: afterCount }],
                    'A atividade foi adicionada à trilha.',
                  ).then((saved) => {
                    if (saved) setModuleId('');
                  });
                }}
                type="button"
              >
                Adicionar à trilha
              </button>
            </div>
          )}
        </section>

        <section aria-labelledby="course-games-checkpoints-title" className="course-games-step">
          <div className="course-games-step-heading">
            <span aria-hidden="true" className="course-games-step-number">2</span>
            <div>
              <h3 id="course-games-checkpoints-title">Atividade durante o vídeo</h3>
              <p>Escolha o momento e a atividade. O vídeo pausa para exibi-la, sem bloquear a conclusão do curso.</p>
            </div>
          </div>

          {course.videos.length === 0 ? (
            <p className="course-games-empty">Adicione um vídeo ao curso antes de configurar uma pergunta durante a reprodução.</p>
          ) : modules.length === 0 ? (
            <p className="course-games-empty">Cadastre uma atividade na biblioteca para vinculá-la a um momento do vídeo.</p>
          ) : (
            <div className="course-checkpoint-videos">
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
        </section>
      </div>
      {previewing && <GamePlayer module={previewing} onClose={() => setPreviewing(null)} />}
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
    <details className="course-checkpoint-video">
      <summary>
        <span className="course-checkpoint-video-title">
          <strong>Vídeo {videoNumber} · {video.title}</strong>
          <small>{video.checkpoints.length === 0
            ? 'Nenhuma pergunta configurada'
            : `${video.checkpoints.length} ${video.checkpoints.length === 1 ? 'pergunta configurada' : 'perguntas configuradas'}`}
          </small>
        </span>
        <span className="course-checkpoint-expand">Configurar vídeo</span>
      </summary>
      <div className="course-checkpoint-content">
        <video
          aria-label={`Prévia de ${video.title}`}
          controls
          className="course-checkpoint-player"
          onSeeked={() => fired.current.clear()}
          onTimeUpdate={handleTimeUpdate}
          ref={videoRef}
          src={video.fileUrl}
        />
        {video.checkpoints.length > 0 && (
          <ul className="course-checkpoint-list">
            {video.checkpoints.map((checkpoint) => (
              <li key={`${checkpoint.timeMilliseconds}-${checkpoint.moduleId}`}>
                <span className="course-checkpoint-time">{checkpointLabel(checkpoint.timeMilliseconds)}</span>
                <span>{modules.find((item) => item.id === checkpoint.moduleId)?.title ?? 'Atividade removida'}</span>
                <button
                  aria-label={`Remover pergunta de ${checkpointLabel(checkpoint.timeMilliseconds)} em ${video.title}`}
                  className="button button-danger-quiet"
                  onClick={() => void save(
                    video.checkpoints.filter((item) => item !== checkpoint),
                    'A atividade foi removida do vídeo.',
                  )}
                  type="button"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="course-checkpoint-form">
          <div className="field">
            <label htmlFor={`cp-seconds-${video.id}`}>Momento do vídeo (segundos)</label>
            <input
              id={`cp-seconds-${video.id}`}
              min={1}
              onChange={(event) => setSeconds(event.target.value)}
              placeholder="Ex.: 45"
              type="number"
              value={seconds}
            />
          </div>
          <div className="field">
            <label htmlFor={`cp-module-${video.id}`}>Atividade a exibir</label>
            <select id={`cp-module-${video.id}`} onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
              <option value="">Selecione uma atividade</option>
              {modules.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </div>
          <button
            aria-label={`Adicionar parada no vídeo ${video.title}`}
            className="button button-secondary"
            disabled={!moduleId || !seconds || Number(seconds) < 1}
            onClick={() => {
              const time = Math.round(Number(seconds) * 1000);
              void save(
                [...video.checkpoints, { timeMilliseconds: time, moduleId }],
                'A atividade foi adicionada ao vídeo.',
              ).then((saved) => {
                if (saved) {
                  setSeconds('');
                  setModuleId('');
                }
              });
            }}
            type="button"
          >
            Adicionar parada
          </button>
        </div>
      </div>
    </details>
  );
}
