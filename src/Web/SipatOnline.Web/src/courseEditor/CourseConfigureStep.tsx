import type { FormEvent, Ref } from 'react';
import type { GamificationGameType, PlatformCourse, PlatformCourseStatus } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Switch } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { gameTypeOptions } from '@/gamificationGames';
import CategorySelect from '@/courseCatalog/CategorySelect';
import { useCourseCategories } from '@/courseCatalog/useCourseCategories';
import { CourseCoverEditor } from './CourseMediaForms';
import CourseStepHeading, { StepPage } from './CourseStepHeading';

export interface CourseSettingsValues {
  title: string;
  description: string;
  gamificationEnabled: boolean;
  gameType: GamificationGameType;
  categoryId: string | null;
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
  const { categories, create } = useCourseCategories();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <StepPage label="Configuração do curso">
      <CourseStepHeading eyebrow="Etapa 2 · Configurar" headingRef={headingRef} status={status} title="Detalhes do curso">
        Revise as informações e escolha como o curso será apresentado aos participantes.
      </CourseStepHeading>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
        <Card>
          <form className="contents" onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle as="h2">Informações e preferências</CardTitle>
              <CardDescription>O nome e a descrição ajudam as pessoas a identificar este curso no catálogo.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field htmlFor="edit-course-title" label="Nome do curso">
                <Input disabled={busy} id="edit-course-title" maxLength={200} required value={values.title}
                  onChange={(event) => onChange({ title: event.target.value })} />
              </Field>
              <Field htmlFor="edit-course-category" label="Categoria">
                <CategorySelect categories={categories} disabled={busy} id="edit-course-category"
                  onChange={(categoryId) => onChange({ categoryId })} onCreate={create} value={values.categoryId} />
              </Field>
              <Field htmlFor="edit-course-description" label="Descrição">
                <Textarea className="min-h-28" disabled={busy} id="edit-course-description" maxLength={2000} rows={4} value={values.description}
                  onChange={(event) => onChange({ description: event.target.value })} />
              </Field>
              <Switch checked={values.gamificationEnabled} description="Ative ou desative a experiência de jogo deste curso."
                disabled={busy} id="edit-course-gamification" label="Gamificação após os vídeos"
                onChange={(event) => onChange({ gamificationEnabled: event.target.checked })} />

              {values.gamificationEnabled && (
                <fieldset className="m-0 grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-2 border-0 p-0">
                  <legend className="mb-2 p-0 text-xs font-bold uppercase tracking-[0.06em]">Tipo de jogo</legend>
                  {gameTypeOptions.filter((option) => !option.retired || option.value === values.gameType).map((option) => (
                    <label
                      className="m-0 flex cursor-pointer gap-2.5 rounded-md border border-border p-3 transition-colors hover:border-accent-foreground/25 has-[:checked]:border-primary has-[:checked]:bg-accent"
                      key={option.value}
                    >
                      <input checked={values.gameType === option.value} className="mt-0.5 accent-[var(--brand-primary)]" disabled={busy}
                        name="course-game-type" type="radio" value={option.value} onChange={() => onChange({ gameType: option.value })} />
                      <span className="grid gap-0.5">
                        <strong className="text-sm">{option.label}</strong>
                        <small className="text-xs leading-snug text-muted-foreground">{option.description}</small>
                        {!option.playable && <em className="text-[0.6875rem] font-semibold not-italic text-warning">Configurável agora · jogável em breve</em>}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
            </CardContent>
            <CardFooter>
              <Button disabled={busy} type="submit">{isSaving ? 'Salvando...' : 'Salvar alterações'}</Button>
            </CardFooter>
          </form>
        </Card>

        <Card aria-label="Foto do curso" role="complementary">
          <CardHeader>
            <CardTitle as="h2">Foto do curso</CardTitle>
            <CardDescription>Uma imagem ajuda a identificar o conteúdo no catálogo.</CardDescription>
          </CardHeader>
          <CardContent>
            <CourseCoverEditor course={course} onBusyChange={onBusyChange} onChanged={onChanged} onError={onError} />
          </CardContent>
        </Card>
      </div>
    </StepPage>
  );
}
