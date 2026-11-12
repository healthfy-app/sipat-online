import { useEffect, useState, type FormEvent } from 'react';
import { createPlatformCourse, setPlatformCourseCover, type PlatformCourse } from '../api';
import CourseDialog from '../CourseDialog';
import { formatCourseOption, getErrorMessage, maxCoverBytes, type CourseOption } from '../courseEditor/courseFormat';

const acceptedCoverTypes = ['image/png', 'image/jpeg', 'image/webp'];

export default function CreateCourseDialog({
  onCreated,
  onClose,
}: {
  onCreated: (course: PlatformCourse) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [option, setOption] = useState<CourseOption>('1');
  const [gamificationEnabled, setGamificationEnabled] = useState(false);
  const [cover, setCover] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [createdCourse, setCreatedCourse] = useState<PlatformCourse | null>(null);
  const locked = isSaving || createdCourse !== null;

  useEffect(() => {
    if (!cover) { setPreview(''); return; }
    const url = URL.createObjectURL(cover);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    let course = createdCourse;
    try {
      course ??= await createPlatformCourse({
        title: title.trim(),
        description: formatCourseOption(option, description.trim()),
        gamificationEnabled,
      });
      setCreatedCourse(course);
      const savedCourse = cover ? await setPlatformCourseCover(course.id, cover) : course;
      await onCreated(savedCourse);
    } catch (saveError) {
      setError(course
        ? `O curso foi criado, mas não foi possível salvar a capa. Tente novamente. ${getErrorMessage(saveError)}`
        : getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <CourseDialog busy={isSaving} onClose={onClose} title="Detalhes do curso">
      <form className="course-create-form" onSubmit={handleSubmit}>
        <label className="course-create-cover" htmlFor="create-course-cover">
          {preview ? <img alt="Prévia da capa do curso" src={preview} /> : (
            <span><span aria-hidden="true" className="course-upload-icon">↑</span>Adicionar capa</span>
          )}
          <input
            accept={acceptedCoverTypes.join(',')}
            aria-label="Adicionar capa"
            disabled={isSaving}
            id="create-course-cover"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (!acceptedCoverTypes.includes(file.type) || file.size > maxCoverBytes) {
                setError('Escolha uma imagem PNG, JPEG ou WebP de até 2 MB.');
                event.target.value = '';
                return;
              }
              setError('');
              setCover(file);
            }}
            type="file"
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="field">
          <label htmlFor="platform-course-option">Opção da grade</label>
          <select disabled={locked} id="platform-course-option" value={option}
            onChange={(event) => setOption(event.target.value as CourseOption)}>
            <option value="1">Opção 1</option>
            <option value="2">Opção 2</option>
            <option value="3">Opção 3</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="platform-course-title">Título (obrigatório)</label>
          <input data-autofocus disabled={locked} id="platform-course-title" maxLength={200} placeholder="Curso sem título"
            required value={title} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="platform-course-description">Descrição</label>
          <textarea disabled={locked} id="platform-course-description" maxLength={2000} placeholder="Adicione uma breve descrição"
            rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </div>
        <label className="platform-toggle">
          <input checked={gamificationEnabled} disabled={locked} type="checkbox"
            onChange={(event) => setGamificationEnabled(event.target.checked)} />
          <span>Gamificação após os vídeos</span>
        </label>
        <div className="course-dialog-actions">
          <button className="button button-secondary" disabled={isSaving} onClick={onClose} type="button">Cancelar</button>
          <button className="button course-primary" disabled={isSaving} type="submit">
            {isSaving ? 'Salvando...' : createdCourse ? 'Tentar salvar capa' : 'Criar'}
          </button>
        </div>
      </form>
    </CourseDialog>
  );
}
