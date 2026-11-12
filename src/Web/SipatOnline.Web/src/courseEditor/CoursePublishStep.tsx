import type { Ref } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '../api';
import { pluralize } from './courseFormat';
import CourseStepHeading from './CourseStepHeading';

interface ChecklistItem {
  label: string;
  state: 'ready' | 'required' | 'optional';
  text: string;
}

export default function CoursePublishStep({
  course,
  title,
  description,
  gamificationEnabled,
  status,
  busy,
  headingRef,
  onReviewSettings,
  onPublish,
  onUnpublish,
}: {
  course: PlatformCourse;
  title: string;
  description: string;
  gamificationEnabled: boolean;
  status: PlatformCourseStatus;
  busy: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onReviewSettings: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const hasVideos = course.videos.length > 0;
  const isPublished = status === 'Published';
  const checklist: ChecklistItem[] = [
    { label: 'Nome do curso', state: title.trim() ? 'ready' : 'required', text: title.trim() ? 'Pronto' : 'Obrigatório' },
    { label: 'Descrição', state: description.trim() ? 'ready' : 'required', text: description.trim() ? 'Pronta' : 'Obrigatória' },
    { label: 'Vídeo', state: hasVideos ? 'ready' : 'required', text: hasVideos ? 'Adicionado' : 'Obrigatório' },
    { label: 'Foto do curso', state: course.coverUrl ? 'ready' : 'optional', text: course.coverUrl ? 'Adicionada' : 'Opcional' },
  ];
  const canPublish = hasVideos && title.trim() !== '' && description.trim() !== '';

  return (
    <section aria-label="Revisar e publicar" className="ce-page">
      <CourseStepHeading eyebrow="Etapa 3 · Publicar" headingRef={headingRef} status={status} title="Revisar e publicar">
        Confira os dados e os requisitos antes de disponibilizar o curso para as empresas.
      </CourseStepHeading>

      <div className="ce-page-grid">
        <section aria-labelledby="course-publish-details-title" className="ce-card">
          <div className="ce-card-heading">
            <h3 id="course-publish-details-title">Detalhes do curso</h3>
            <p>Resumo das informações que serão exibidas no catálogo.</p>
          </div>
          <dl className="ce-summary">
            <div><dt>Título</dt><dd>{title || 'Não informado'}</dd></div>
            <div><dt>Descrição</dt><dd>{description || 'Sem descrição'}</dd></div>
            <div><dt>Vídeos</dt><dd>{pluralize(course.videos.length, 'vídeo', 'vídeos')}</dd></div>
            <div><dt>Gamificação</dt><dd>{gamificationEnabled ? 'Ativada após os vídeos' : 'Desativada'}</dd></div>
          </dl>
          <div className="ce-card-actions">
            <button className="ce-btn" onClick={onReviewSettings} type="button">Revisar configurações</button>
          </div>
        </section>

        <section aria-labelledby="course-publish-action-title" className="ce-card">
          <div className="ce-card-heading ce-card-heading-row">
            <div>
              <h3 id="course-publish-action-title">Publicação no catálogo</h3>
              <p>Ao publicar, o curso fica disponível no catálogo. Os vínculos e o progresso das empresas são preservados.</p>
            </div>
            <span className={`ce-pill ${isPublished ? 'ce-pill-published' : 'ce-pill-draft'}`}>
              {isPublished ? 'No catálogo' : 'Rascunho'}
            </span>
          </div>
          <ul aria-label="Checklist de publicação" className="ce-checklist">
            {checklist.map((item) => (
              <li className={`is-${item.state}`} key={item.label}>
                <span aria-hidden="true" className="ce-check-mark">{item.state === 'ready' ? '✓' : item.state === 'optional' ? '–' : '!'}</span>
                <span className="ce-check-label">{item.label}</span>
                <strong>{item.text}</strong>
              </li>
            ))}
          </ul>
          {!hasVideos && <p className="form-error" role="alert">Adicione ao menos um vídeo antes de publicar.</p>}
          <div className="ce-card-actions">
            <button className="ce-btn ce-btn-primary" disabled={busy || !canPublish} onClick={onPublish} type="button">
              {isPublished ? 'Publicar alterações' : 'Publicar agora'}
            </button>
            {isPublished && (
              <button className="ce-btn" disabled={busy} onClick={onUnpublish} type="button">Voltar a rascunho</button>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
