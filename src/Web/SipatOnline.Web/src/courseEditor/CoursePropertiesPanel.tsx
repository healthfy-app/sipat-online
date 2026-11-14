import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { editorPanel } from './CourseOutlinePanel';
import { formatDuration, pluralize } from './courseFormat';
import { gameTypeLabel, type LessonGroup, type TrackItem } from './courseTrack';

export interface PropertiesActions {
  onRenameVideo: (videoId: string, title: string | null) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onDescribeLesson: (lessonId: string, description: string) => void;
  onAddVideo: (lessonId: string) => void;
  onRemoveVideo: (videoId: string) => void;
  onManageActivities: () => void;
}

export default function CoursePropertiesPanel({
  item,
  lesson,
  lessonIndex,
  position,
  total,
  gamificationEnabled,
  busy,
  actions,
}: {
  item: TrackItem | undefined;
  lesson: LessonGroup | undefined;
  lessonIndex: number;
  position: number;
  total: number;
  gamificationEnabled: boolean;
  busy: boolean;
  actions: PropertiesActions;
}) {
  const kind = lesson ? 'AULA' : item?.kind === 'activity' ? 'ATIVIDADE' : 'VÍDEO';
  return (
    <aside aria-label="Propriedades do conteúdo" className={cn(editorPanel, 'max-[1180px]:col-span-full max-[1180px]:border-t max-[1180px]:border-border max-[1180px]:shadow-none')}>
      <header className="flex items-center justify-between gap-2 border-b border-border p-4 text-xs">
        <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-primary">{kind}</span>
        {lesson ? (
          <span className="font-medium tabular-nums text-muted-foreground">{lessonIndex + 1}ª aula</span>
        ) : item && <span className="font-medium tabular-nums text-muted-foreground">{position + 1} de {total}</span>}
      </header>

      <div className="grid content-start gap-4 p-4 max-[1180px]:grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        {!item && !lesson && <p className="m-0 text-sm leading-relaxed text-muted-foreground">Crie uma aula e adicione vídeos para começar a montar o curso.</p>}

        {lesson && <>
          <CommitField
            disabled={busy}
            id="prop-lesson-title"
            label="Nome da aula"
            onCommit={(value) => value.trim() && actions.onRenameLesson(lesson.id, value.trim())}
            value={lesson.title}
          />
          <CommitField
            disabled={busy}
            id="prop-lesson-description"
            label="Descrição"
            multiline
            onCommit={(value) => actions.onDescribeLesson(lesson.id, value)}
            value={lesson.description ?? ''}
          />
          <Button className="w-full" disabled={busy} onClick={() => actions.onAddVideo(lesson.id)} variant="outline">Adicionar vídeo à aula</Button>
        </>}

        {!lesson && item?.kind === 'video' && <>
          <CommitField
            disabled={busy}
            hint={item.video.libraryTitle && item.video.libraryTitle !== item.title
              ? `Título original na biblioteca: ${item.video.libraryTitle}`
              : 'Muda só neste curso; o título da biblioteca continua o mesmo.'}
            id="prop-video-title"
            label="Título do vídeo"
            onCommit={(value) => {
              const next = value.trim();
              if (!next) return;
              actions.onRenameVideo(item.video.id, next === item.video.libraryTitle ? null : next);
            }}
            value={item.title}
          />
          {item.video.libraryTitle && item.video.libraryTitle !== item.title && (
            <Button disabled={busy} onClick={() => actions.onRenameVideo(item.video.id, null)} size="sm" variant="outline">Restaurar título original</Button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <PropField label="Duração">{formatDuration(item.video.durationMilliseconds)}</PropField>
            <PropField label="Perguntas">{item.video.checkpoints.length}</PropField>
          </div>
          <Button disabled={busy} onClick={actions.onManageActivities} variant="outline">Editar perguntas do vídeo</Button>
          <Button disabled={busy} onClick={() => actions.onRemoveVideo(item.video.id)} variant="ghost">Remover do curso</Button>
        </>}

        {!lesson && item?.kind === 'activity' && <>
          <PropField label="Título">{item.module.title}</PropField>
          <div className="grid grid-cols-2 gap-3">
            <PropField label="Tipo">{gameTypeLabel(item.module)}</PropField>
            <PropField label="Posição">
              {item.afterVideoCount === 0 ? 'Antes do 1º vídeo' : `Após o ${item.afterVideoCount}º vídeo`}
            </PropField>
          </div>
          {item.module.questions.length > 0 && (
            <PropField label="Conteúdo">{pluralize(item.module.questions.length, 'pergunta', 'perguntas')}</PropField>
          )}
          <Button disabled={busy} onClick={actions.onManageActivities} variant="outline">Editar atividade</Button>
        </>}

        <section aria-labelledby="ce-props-activities" className="grid gap-2 border-t border-border pt-4 max-[1180px]:col-span-full">
          <h3 className="m-0 text-base font-medium" id="ce-props-activities">Atividades e perguntas</h3>
          <p className="m-0 text-[0.8125rem] leading-relaxed text-muted-foreground">
            Adicione atividades entre vídeos ou perguntas que aparecem durante a reprodução.
          </p>
          <Button className="w-full" disabled={busy} onClick={actions.onManageActivities} variant="outline">Configurar atividades</Button>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs text-muted-foreground before:size-1.5 before:rounded-full before:content-['']",
              gamificationEnabled ? 'before:bg-primary' : 'before:bg-border',
            )}
          >
            Atividades opcionais · {gamificationEnabled ? 'gamificação ativada' : 'gamificação desativada'}
          </span>
        </section>
      </div>
    </aside>
  );
}

/** Campo que salva ao sair (blur); Esc desfaz. */
function CommitField({ id, label, value, hint, multiline = false, disabled, onCommit }: {
  id: string;
  label: string;
  value: string;
  hint?: string;
  multiline?: boolean;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const Control = multiline ? Textarea : Input;
  return (
    <Field hint={hint} htmlFor={id} label={label}>
      <Control
        disabled={disabled}
        id={id}
        maxLength={multiline ? 2000 : 200}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDraft(value);
          if (event.key === 'Enter' && !multiline) event.currentTarget.blur();
        }}
        value={draft}
      />
    </Field>
  );
}

/** Valor somente leitura com o rótulo em aba (assinatura visual do editor). */
function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-start">
      <span className="rounded-t-sm border border-b-0 border-input bg-card px-1.5 py-px text-[0.6875rem] font-bold uppercase leading-snug tracking-[0.06em]">
        {label}
      </span>
      <span className="min-h-10 self-stretch rounded-b-sm rounded-tr-sm border border-input px-3.5 pb-1.5 pt-2 text-[0.9375rem] leading-normal tabular-nums [overflow-wrap:anywhere]">
        {children}
      </span>
    </div>
  );
}
