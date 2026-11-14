import { ImagePlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { createPlatformCourse, setCourseCategory, setPlatformCourseCover, type CourseCategory, type PlatformCourse } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { Field, Switch } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { getErrorMessage, maxCoverBytes } from '@/courseEditor/courseFormat';
import CategorySelect from './CategorySelect';

const acceptedCoverTypes = ['image/png', 'image/jpeg', 'image/webp'];

export default function CreateCourseDialog({
  categories,
  onCreateCategory,
  onCreated,
  onClose,
}: {
  categories: CourseCategory[];
  onCreateCategory: (name: string) => Promise<CourseCategory>;
  onCreated: (course: PlatformCourse) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
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
        description: description.trim() || null,
        gamificationEnabled,
      });
      setCreatedCourse(course);
      if (categoryId && course.categoryId !== categoryId) {
        await setCourseCategory(course.id, categoryId);
        course = { ...course, categoryId };
        setCreatedCourse(course);
      }
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
    <Dialog busy={isSaving} onClose={onClose} title="Detalhes do curso">
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label
          className="relative m-0 grid aspect-[16/7] cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-input bg-muted text-sm font-semibold text-primary transition-colors hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          htmlFor="create-course-cover"
        >
          {preview
            ? <img alt="Prévia da capa do curso" className="absolute inset-0 size-full object-cover" src={preview} />
            : <span className="grid justify-items-center gap-1.5"><ImagePlus className="size-6" />Adicionar capa</span>}
          <input
            accept={acceptedCoverTypes.join(',')}
            aria-label="Adicionar capa"
            className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
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
        {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
        <Field htmlFor="platform-course-category" label="Categoria">
          <CategorySelect categories={categories} disabled={locked} id="platform-course-category"
            onChange={setCategoryId} onCreate={onCreateCategory} value={categoryId} />
        </Field>
        <Field htmlFor="platform-course-title" label="Título (obrigatório)">
          <Input data-autofocus disabled={locked} id="platform-course-title" maxLength={200} placeholder="Curso sem título"
            required value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field htmlFor="platform-course-description" label="Descrição">
          <Textarea disabled={locked} id="platform-course-description" maxLength={2000} placeholder="Adicione uma breve descrição"
            rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        <Switch checked={gamificationEnabled} disabled={locked} id="platform-course-gamification"
          label="Gamificação após os vídeos" onChange={(event) => setGamificationEnabled(event.target.checked)} />
        <DialogActions>
          <Button disabled={isSaving} onClick={onClose} variant="outline">Cancelar</Button>
          <Button disabled={isSaving} type="submit">
            {isSaving ? 'Salvando...' : createdCourse ? 'Tentar salvar capa' : 'Criar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
