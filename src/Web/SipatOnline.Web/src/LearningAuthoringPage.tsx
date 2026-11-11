import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  addLearningLesson,
  ApiError,
  createLearningTrack,
  getLearningTrackDraft,
  listSipatEvents,
  listTenantLearningTracks,
  publishLearningTrack,
  type LearningDraftLesson,
  type LearningTrackDraft,
  type LearningTrackSummary,
  type SipatEvent,
} from './api';

interface TrackFormValues {
  title: string;
  description: string;
}

const emptyTrackForm: TrackFormValues = {
  title: '',
  description: '',
};

interface LessonFormValues {
  title: string;
  description: string;
  providerAssetReference: string;
  durationSeconds: string;
}

const emptyLessonForm: LessonFormValues = {
  title: '',
  description: '',
  providerAssetReference: '',
  durationSeconds: '',
};

export default function LearningAuthoringPage() {
  const [events, setEvents] = useState<SipatEvent[]>([]);
  const [tracks, setTracks] = useState<LearningTrackSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [draft, setDraft] = useState<LearningTrackDraft | null>(null);
  const [trackForm, setTrackForm] = useState<TrackFormValues>(emptyTrackForm);
  const [lessonForm, setLessonForm] = useState(emptyLessonForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isCreatingTrack, setIsCreatingTrack] = useState(false);
  const [isAddingLesson, setIsAddingLesson] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const availableEvents = useMemo(
    () => events.filter((event) => event.status !== 'Cancelled'),
    [events],
  );
  const draftTracks = useMemo(
    () => tracks.filter((track) => !track.isPublished),
    [tracks],
  );
  const publishedTrackCount = tracks.filter((track) => track.isPublished).length;

  const loadCatalog = useCallback(async (preferredDraftId?: string) => {
    setIsLoading(true);
    setError('');
    try {
      const [eventPage, availableTracks] = await Promise.all([
        listSipatEvents(0, 100),
        listTenantLearningTracks(),
      ]);
      setEvents(eventPage.items);
      setTracks(availableTracks);
      setSelectedEventId((current) =>
        eventPage.items.some((event) => event.id === current && event.status !== 'Cancelled')
          ? current
          : eventPage.items.find((event) => event.status !== 'Cancelled')?.id ?? '',
      );
      setSelectedDraftId((current) => {
        const preferredId = preferredDraftId ?? current;
        return availableTracks.some((track) => track.id === preferredId && !track.isPublished)
          ? preferredId
          : availableTracks.find((track) => !track.isPublished)?.id ?? '';
      });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedDraftId) {
      setDraft(null);
      return;
    }

    let active = true;
    setDraft(null);
    setIsLoadingDraft(true);
    setError('');
    getLearningTrackDraft(selectedDraftId)
      .then((loadedDraft) => {
        if (active) {
          setDraft(loadedDraft);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoadingDraft(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDraftId]);

  async function handleCreateTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIsCreatingTrack(true);

    try {
      const track = await createLearningTrack(selectedEventId, {
        title: trackForm.title.trim(),
        description: trackForm.description.trim() || null,
      });
      setTrackForm(emptyTrackForm);
      await loadCatalog(track.id);
      setNotice('Trilha criada como rascunho. Adicione os vídeos antes de publicar.');
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setIsCreatingTrack(false);
    }
  }

  async function handleAddLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) {
      return;
    }

    setError('');
    setNotice('');
    setIsAddingLesson(true);
    try {
      await addLearningLesson(draft.trackId, {
        title: lessonForm.title.trim(),
        description: lessonForm.description.trim() || null,
        providerAssetReference: lessonForm.providerAssetReference.trim(),
        durationMilliseconds: Number(lessonForm.durationSeconds) * 1000,
      });
      const updatedDraft = await getLearningTrackDraft(draft.trackId);
      setDraft(updatedDraft);
      setLessonForm(emptyLessonForm);
      setNotice('Vídeo adicionado à trilha.');
    } catch (addError) {
      setError(getErrorMessage(addError));
    } finally {
      setIsAddingLesson(false);
    }
  }

  async function handlePublish() {
    if (!draft || draft.lessons.length === 0) {
      return;
    }

    setError('');
    setNotice('');
    setIsPublishing(true);
    try {
      await publishLearningTrack(draft.trackId);
      setNotice(`"${draft.title}" foi publicada e está disponível para atribuição.`);
      setDraft(null);
      await loadCatalog();
    } catch (publishError) {
      setError(getErrorMessage(publishError));
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTEÚDO DA SIPAT</p>
          <h1>Trilhas e vídeos</h1>
          <p className="muted-copy">
            Organize os conteúdos da programação semanal e publique trilhas prontas para atribuição.
          </p>
        </div>
        <span className="count-label">
          {publishedTrackCount} {publishedTrackCount === 1 ? 'trilha publicada' : 'trilhas publicadas'}
        </span>
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      {isLoading ? (
        <LoadingState className="list-state">Carregando programações e trilhas...</LoadingState>
      ) : (
        <div className="management-grid">
          <section aria-labelledby="create-track-title" className="form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">NOVA TRILHA</p>
                <h2 id="create-track-title">Criar conteúdo</h2>
              </div>
            </div>
            {availableEvents.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>Cadastre a programação primeiro</h3>
                <p>Uma trilha precisa estar vinculada à programação de uma SIPAT.</p>
              </div>
            ) : (
              <form className="event-form event-form-single" onSubmit={handleCreateTrack}>
                <div className="field">
                  <label htmlFor="authoring-event">Programação da SIPAT</label>
                  <select
                    id="authoring-event"
                    onChange={(event) => setSelectedEventId(event.target.value)}
                    required
                    value={selectedEventId}
                  >
                    {availableEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title} · {event.status === 'Published' ? 'Publicada' : 'Rascunho'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="track-title">Nome da trilha</label>
                  <input
                    id="track-title"
                    maxLength={200}
                    onChange={(event) =>
                      setTrackForm((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                    value={trackForm.title}
                  />
                </div>
                <div className="field">
                  <label htmlFor="track-description">Descrição <span>(opcional)</span></label>
                  <textarea
                    id="track-description"
                    maxLength={2000}
                    onChange={(event) =>
                      setTrackForm((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={3}
                    value={trackForm.description}
                  />
                </div>
                <div className="form-actions full-width">
                  <button
                    className="button button-primary"
                    disabled={isCreatingTrack || !selectedEventId}
                    type="submit"
                  >
                    {isCreatingTrack ? 'Criando...' : 'Criar trilha'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section aria-labelledby="draft-track-title" className="form-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">EM EDIÇÃO</p>
                <h2 id="draft-track-title">Montar trilha</h2>
              </div>
            </div>
            {draftTracks.length === 0 ? (
              <div className="empty-state compact-empty">
                <h3>Nenhuma trilha em rascunho</h3>
                <p>Crie uma trilha para adicionar vídeos e preparar a publicação.</p>
              </div>
            ) : (
              <div className="event-form event-form-single">
                <div className="field">
                  <label htmlFor="draft-track">Trilha em rascunho</label>
                  <select
                    id="draft-track"
                    onChange={(event) => setSelectedDraftId(event.target.value)}
                    value={selectedDraftId}
                  >
                    {draftTracks.map((track) => (
                      <option key={track.id} value={track.id}>{track.title}</option>
                    ))}
                  </select>
                </div>
                {isLoadingDraft ? (
                  <LoadingState className="list-state">Carregando rascunho...</LoadingState>
                ) : draft ? (
                  <>
                    <p className="field-hint">
                      Programação: {events.find((event) => event.id === draft.sipatEventId)?.title ?? 'SIPAT'}
                      {' · '}Revisão {draft.revisionNumber}
                    </p>
                    <form className="event-form event-form-single" onSubmit={handleAddLesson}>
                      <div className="field">
                        <label htmlFor="lesson-title">Título do vídeo</label>
                        <input
                          id="lesson-title"
                          maxLength={200}
                          onChange={(event) =>
                            setLessonForm((current) => ({ ...current, title: event.target.value }))
                          }
                          required
                          value={lessonForm.title}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="lesson-description">Descrição <span>(opcional)</span></label>
                        <textarea
                          id="lesson-description"
                          maxLength={2000}
                          onChange={(event) =>
                            setLessonForm((current) => ({ ...current, description: event.target.value }))
                          }
                          rows={2}
                          value={lessonForm.description}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="lesson-asset-reference">Referência do vídeo no provedor</label>
                        <input
                          autoComplete="off"
                          id="lesson-asset-reference"
                          maxLength={256}
                          onChange={(event) =>
                            setLessonForm((current) => ({
                              ...current,
                              providerAssetReference: event.target.value,
                            }))
                          }
                          required
                          value={lessonForm.providerAssetReference}
                        />
                        <span className="field-hint">
                          Para a demo local em Development, use development:mdn-flower-demo e informe 5,055 segundos.
                          Essa amostra CC0 da MDN é somente técnica; não faz parte do catálogo comercial.
                          Em outros ambientes, informe um ativo autorizado no provedor configurado.
                        </span>
                      </div>
                      <div className="field">
                        <label htmlFor="lesson-duration">Duração em segundos</label>
                        <input
                          id="lesson-duration"
                          max={86400}
                          min={1}
                          onChange={(event) =>
                            setLessonForm((current) => ({ ...current, durationSeconds: event.target.value }))
                          }
                          required
                          step={0.001}
                          type="number"
                          value={lessonForm.durationSeconds}
                        />
                      </div>
                      <div className="form-actions full-width">
                        <button
                          className="button button-secondary"
                          disabled={isAddingLesson}
                          type="submit"
                        >
                          {isAddingLesson ? 'Adicionando...' : 'Adicionar vídeo'}
                        </button>
                      </div>
                    </form>
                    <DraftLessonList lessons={draft.lessons} />
                    <div className="form-actions full-width">
                      <button
                        className="button button-primary"
                        disabled={isPublishing || draft.lessons.length === 0}
                        onClick={() => void handlePublish()}
                        type="button"
                      >
                        {isPublishing ? 'Publicando...' : 'Publicar trilha'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DraftLessonList({ lessons }: { lessons: LearningDraftLesson[] }) {
  return (
    <section aria-label="Vídeos adicionados" className="list-section">
      <div className="section-heading">
        <h3>{lessons.length} {lessons.length === 1 ? 'vídeo' : 'vídeos'}</h3>
      </div>
      {lessons.length === 0 ? (
        <p className="list-state">Adicione ao menos um vídeo antes de publicar.</p>
      ) : (
        <ol className="draft-lesson-list">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <span>{lesson.position}. {lesson.title}</span>
              <span>{formatDuration(lesson.durationMilliseconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatDuration(durationMilliseconds: number): string {
  const totalSeconds = Math.floor(durationMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
import LoadingState from './LoadingState';
