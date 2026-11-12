import { Check, Minus, TriangleAlert } from 'lucide-react';
import type { Ref } from 'react';
import type { PlatformCourse, PlatformCourseStatus } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { pluralize } from './courseFormat';
import CourseStepHeading, { StepPage } from './CourseStepHeading';

interface ChecklistItem {
  label: string;
  state: 'ready' | 'required' | 'optional';
  text: string;
}

const checkStyles = {
  ready: { mark: 'bg-primary text-primary-foreground', text: 'text-primary', icon: Check },
  required: { mark: 'bg-destructive-soft text-destructive', text: 'text-destructive', icon: TriangleAlert },
  optional: { mark: 'bg-warning-soft text-warning', text: 'text-warning', icon: Minus },
};

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
  const summary = [
    { term: 'Título', value: title || 'Não informado' },
    { term: 'Descrição', value: description || 'Sem descrição' },
    { term: 'Vídeos', value: pluralize(course.videos.length, 'vídeo', 'vídeos') },
    { term: 'Gamificação', value: gamificationEnabled ? 'Ativada após os vídeos' : 'Desativada' },
  ];

  return (
    <StepPage label="Revisar e publicar">
      <CourseStepHeading eyebrow="Etapa 3 · Publicar" headingRef={headingRef} status={status} title="Revisar e publicar">
        Confira os dados e os requisitos antes de disponibilizar o curso para as empresas.
      </CourseStepHeading>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)]">
        <Card aria-labelledby="course-publish-details-title" role="region">
          <CardHeader>
            <CardTitle id="course-publish-details-title">Detalhes do curso</CardTitle>
            <CardDescription>Resumo das informações que serão exibidas no catálogo.</CardDescription>
          </CardHeader>
          <CardContent className="py-1">
            <dl className="m-0 grid">
              {summary.map((row) => (
                <div className="grid grid-cols-[minmax(7rem,0.6fr)_minmax(0,1.4fr)] gap-3 border-b border-border py-3 last:border-0 max-sm:grid-cols-1 max-sm:gap-0.5" key={row.term}>
                  <dt className="text-[0.6875rem] font-bold uppercase leading-loose tracking-[0.06em] text-muted-foreground">{row.term}</dt>
                  <dd className="m-0 font-medium leading-normal [overflow-wrap:anywhere]">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
          <CardFooter>
            <Button onClick={onReviewSettings} variant="outline">Revisar configurações</Button>
          </CardFooter>
        </Card>

        <Card aria-labelledby="course-publish-action-title" role="region">
          <CardHeader className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <CardTitle id="course-publish-action-title">Publicação no catálogo</CardTitle>
              <CardDescription>Ao publicar, o curso fica disponível no catálogo. Os vínculos e o progresso das empresas são preservados.</CardDescription>
            </div>
            <Badge variant={isPublished ? 'default' : 'warning'}>{isPublished ? 'No catálogo' : 'Rascunho'}</Badge>
          </CardHeader>
          <CardContent>
            <ul aria-label="Checklist de publicação" className="m-0 grid list-none gap-1.5 p-0">
              {checklist.map((item) => {
                const style = checkStyles[item.state];
                const Icon = style.icon;
                return (
                  <li className="grid min-h-10 grid-cols-[1.375rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md bg-background px-3 py-1.5" key={item.label}>
                    <span aria-hidden="true" className={cn('grid size-[1.375rem] place-items-center rounded-full', style.mark)}><Icon className="size-3" /></span>
                    <span className="text-sm">{item.label}</span>
                    <strong className={cn('text-xs font-semibold', style.text)}>{item.text}</strong>
                  </li>
                );
              })}
            </ul>
            {!hasVideos && (
              <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">
                Adicione ao menos um vídeo antes de publicar.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button className="max-sm:flex-1" disabled={busy || !canPublish} onClick={onPublish}>
              {isPublished ? 'Publicar alterações' : 'Publicar agora'}
            </Button>
            {isPublished && <Button className="max-sm:flex-1" disabled={busy} onClick={onUnpublish} variant="outline">Voltar a rascunho</Button>}
          </CardFooter>
        </Card>
      </div>
    </StepPage>
  );
}
