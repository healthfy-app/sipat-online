import type { FormEvent, Ref } from 'react';
import type { GamificationGameType, PlatformCourse, PlatformCourseStatus } from '../api';
import { gameTypeOptions } from '../gamificationGames';
import { CourseCoverEditor } from './CourseMediaForms';
import CourseStepHeading from './CourseStepHeading';

export interface CourseSettingsValues {
  title: string;
  description: string;
  gamificationEnabled: boolean;
  gameType: GamificationGameType;
}

export default function CourseConfigureStep({
  course,
  values,
  status,
  busy,
  isSaving,
  headingRef,
  onChange,
  onSubmit,
  onBusyChange,
  onChanged,
  onError,
}: {
  course: PlatformCourse;
  values: CourseSettingsValues;
  status: PlatformCourseStatus;
  busy: boolean;
  isSaving: boolean;
  headingRef: Ref<HTMLHeadingElement>;
  onChange: (values: Partial<CourseSettingsValues>) => void;
  onSubmit: () => void;
  onBusyChange: (busy: boolean) => void;
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section aria-label="Configuração do curso" className="ce-page">
      <CourseStepHeading
        eyebrow="Etapa 2 · Configurar"
        headingRef={headingRef}
        status={status}
        title="Detalhes do curso"
      >
        Revise as informações e escolha como o curso será apresentado aos participantes.
      </CourseStepHeading>

      <div className="ce-page-grid">
        <form className="ce-card ce-settings-form" onSubmit={handleSubmit}>
          <div className="ce-card-heading">
            <h2>Informações e preferências</h2>
            <p>O nome e a descrição ajudam as pessoas a identificar este curso no catálogo.</p>
          </div>
          <div className="field">
            <label htmlFor="edit-course-title">Nome do curso</label>
            <input disabled={busy} id="edit-course-title" maxLength={200} required value={values.title}
              onChange={(event) => onChange({ title: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="edit-course-description">Descrição</label>
            <textarea disabled={busy} id="edit-course-description" maxLength={2000} rows={4} value={values.description}
              onChange={(event) => onChange({ description: event.target.value })} />
          </div>

          <label className="ce-switch" htmlFor="edit-course-gamification">
            <input checked={values.gamificationEnabled} disabled={busy} id="edit-course-gamification" type="checkbox"
              onChange={(event) => onChange({ gamificationEnabled: event.target.checked })} />
            <span className="ce-switch-track" aria-hidden="true" />
            <span className="ce-switch-text">
              <strong>Gamificação após os vídeos</strong>
              <small>Ative ou desative a experiência de jogo deste curso.</small>
            </span>
          </label>

          {values.gamificationEnabled && (
            <fieldset className="ce-game-types">
              <legend>Tipo de jogo</legend>
              {gameTypeOptions.map((option) => (
                <label className="ce-game-option" key={option.value}>
                  <input checked={values.gameType === option.value} disabled={busy} name="course-game-type" type="radio"
                    value={option.value} onChange={() => onChange({ gameType: option.value })} />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                    {!option.playable && <em>Configurável agora · jogável em breve</em>}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <div className="ce-card-actions">
            <button className="ce-btn ce-btn-primary" disabled={busy} type="submit">
              {isSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>

        <aside aria-label="Foto do curso" className="ce-card ce-cover-card">
          <div className="ce-card-heading">
            <h2>Foto do curso</h2>
            <p>Uma imagem ajuda a identificar o conteúdo no catálogo.</p>
          </div>
          <CourseCoverEditor course={course} onBusyChange={onBusyChange} onChanged={onChanged} onError={onError} />
        </aside>
      </div>
    </section>
  );
}
