import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ApiError,
  cancelSipatEvent,
  createSipatEvent,
  listSipatEvents,
  publishSipatEvent,
  updateSipatEvent,
  type SipatEvent,
  type SipatEventData,
} from './api';

interface EventFormValues {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

const emptyForm: EventFormValues = {
  title: '',
  description: '',
  startsAt: '',
  endsAt: '',
};

const pageSize = 20;

export default function SipatEventsPage() {
  const [events, setEvents] = useState<SipatEvent[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formValues, setFormValues] = useState<EventFormValues>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadEvents = useCallback(async (nextOffset: number) => {
    setIsLoading(true);
    setError('');
    try {
      const page = await listSipatEvents(nextOffset, pageSize);
      setEvents(page.items);
      setTotalCount(page.totalCount);
      setOffset(page.offset);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents(offset);
  }, [loadEvents, offset]);

  function startCreate() {
    setEditingId(null);
    setFormValues(emptyForm);
    setError('');
    setNotice('');
  }

  function startEdit(event: SipatEvent) {
    setEditingId(event.id);
    setFormValues({
      title: event.title,
      description: event.description ?? '',
      startsAt: toLocalDateTime(event.startsAt),
      endsAt: toLocalDateTime(event.endsAt),
    });
    setError('');
    setNotice('');
  }

  function updateField(field: keyof EventFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const startsAt = new Date(formValues.startsAt);
    const endsAt = new Date(formValues.endsAt);
    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      setError('A data e hora de término devem ser posteriores ao início.');
      return;
    }

    const data: SipatEventData = {
      title: formValues.title.trim(),
      description: formValues.description.trim() || null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    };

    setIsSaving(true);
    try {
      if (editingId) {
        await updateSipatEvent(editingId, data);
        setNotice('SIPAT atualizada com sucesso.');
      } else {
        await createSipatEvent(data);
        setNotice('SIPAT criada como rascunho.');
      }
      setEditingId(null);
      setFormValues(emptyForm);
      if (!editingId && offset !== 0) {
        setOffset(0);
      } else {
        await loadEvents(offset);
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish(event: SipatEvent) {
    setError('');
    setNotice('');
    try {
      await publishSipatEvent(event.id);
      setNotice(`"${event.title}" foi publicada.`);
      await loadEvents(offset);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    }
  }

  async function handleCancel(event: SipatEvent) {
    if (!window.confirm(`Deseja cancelar a SIPAT "${event.title}"? Essa ação não pode ser desfeita.`)) {
      return;
    }

    setError('');
    setNotice('');
    try {
      await cancelSipatEvent(event.id);
      setNotice(`"${event.title}" foi cancelada.`);
      if (editingId === event.id) {
        startCreate();
      }
      await loadEvents(offset);
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    }
  }

  return (
    <div className="page-content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO DO CLIENTE</p>
          <h1>Eventos SIPAT</h1>
          <p className="muted-copy">
            Organize os eventos e acompanhe o que está pronto para publicação.
          </p>
        </div>
        <button className="button button-primary" onClick={startCreate} type="button">
          <span aria-hidden="true">＋</span> Nova SIPAT
        </button>
      </div>

      {notice && <p className="success-message" role="status">{notice}</p>}
      {error && <p className="form-error page-error" role="alert">{error}</p>}

      <section aria-labelledby="event-form-title" className="form-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{editingId ? 'EDIÇÃO' : 'NOVO EVENTO'}</p>
            <h2 id="event-form-title">{editingId ? 'Editar SIPAT' : 'Criar SIPAT'}</h2>
          </div>
          <span className="draft-note">Novos eventos começam como rascunho</span>
        </div>
        <form className="event-form" onSubmit={handleSubmit}>
          <div className="field full-width">
            <label htmlFor="event-title">Nome do evento</label>
            <input
              id="event-title"
              maxLength={200}
              onChange={(event) => updateField('title', event.target.value)}
              required
              value={formValues.title}
            />
          </div>
          <div className="field full-width">
            <label htmlFor="event-description">Descrição <span>(opcional)</span></label>
            <textarea
              id="event-description"
              maxLength={2000}
              onChange={(event) => updateField('description', event.target.value)}
              rows={3}
              value={formValues.description}
            />
          </div>
          <div className="field">
            <label htmlFor="event-starts">Início</label>
            <input
              id="event-starts"
              onChange={(event) => updateField('startsAt', event.target.value)}
              required
              type="datetime-local"
              value={formValues.startsAt}
            />
          </div>
          <div className="field">
            <label htmlFor="event-ends">Término</label>
            <input
              id="event-ends"
              onChange={(event) => updateField('endsAt', event.target.value)}
              required
              type="datetime-local"
              value={formValues.endsAt}
            />
          </div>
          <div className="form-actions full-width">
            <button className="button button-primary" disabled={isSaving} type="submit">
              {isSaving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar rascunho'}
            </button>
            {editingId && (
              <button className="button button-quiet" onClick={startCreate} type="button">
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section aria-labelledby="events-list-title" className="list-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">VISÃO GERAL</p>
            <h2 id="events-list-title">Suas SIPATs</h2>
          </div>
          {!isLoading && <span className="count-label">{totalCount} {totalCount === 1 ? 'evento' : 'eventos'}</span>}
        </div>

        {isLoading ? (
          <p className="list-state" aria-live="polite">Carregando eventos...</p>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <span className="empty-illustration" aria-hidden="true">✦</span>
            <h3>Nenhuma SIPAT por aqui ainda</h3>
            <p>Crie um evento para começar a organizar os conteúdos da sua empresa.</p>
            <button className="button button-secondary" onClick={startCreate} type="button">
              Criar primeira SIPAT
            </button>
          </div>
        ) : (
          <div className="event-list">
            {events.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-card-main">
                  <div className="event-card-title">
                    <h3>{event.title}</h3>
                    <StatusBadge status={event.status} />
                  </div>
                  {event.description && <p className="event-description">{event.description}</p>}
                  <p className="event-dates">
                    {formatDateTime(event.startsAt)} <span aria-hidden="true">→</span> {formatDateTime(event.endsAt)}
                  </p>
                </div>
                <div className="event-actions">
                  {event.status !== 'Cancelled' && (
                    <button className="button button-quiet" onClick={() => startEdit(event)} type="button">
                      Editar
                    </button>
                  )}
                  {event.status === 'Draft' && (
                    <button className="button button-secondary" onClick={() => void handlePublish(event)} type="button">
                      Publicar
                    </button>
                  )}
                  {event.status !== 'Cancelled' && (
                    <button className="button button-danger-quiet" onClick={() => void handleCancel(event)} type="button">
                      Cancelar SIPAT
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && totalCount > pageSize && (
          <div className="pagination">
            <button
              className="button button-quiet"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
              type="button"
            >
              Anterior
            </button>
            <span>
              {offset + 1}–{Math.min(offset + events.length, totalCount)} de {totalCount}
            </span>
            <button
              className="button button-quiet"
              disabled={offset + pageSize >= totalCount}
              onClick={() => setOffset(offset + pageSize)}
              type="button"
            >
              Próxima
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: SipatEvent['status'] }) {
  const labels = {
    Draft: 'Rascunho',
    Published: 'Publicada',
    Cancelled: 'Cancelada',
  };

  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status]}</span>;
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : 'Ocorreu um erro inesperado. Tente novamente.';
}
