import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { editorPanel } from './CourseOutlinePanel';
import { formatDuration, pluralize } from './courseFormat';
import { gameTypeLabel, type TrackItem } from './courseTrack';

export default function CoursePropertiesPanel({
  item,
  position,
  total,
  gamificationEnabled,
  busy,
  onManageActivities,
}: {
  item: TrackItem | undefined;
  position: number;
  total: number;
  gamificationEnabled: boolean;
  busy: boolean;
  onManageActivities: () => void;
}) {
  return (
    <aside aria-label="Propriedades do conteúdo" className={cn(editorPanel, 'max-[1180px]:col-span-full max-[1180px]:border-t max-[1180px]:border-border max-[1180px]:shadow-none')}>
      <header className="flex items-center justify-between gap-2 border-b border-border p-4 text-xs">
        <span className="text-[0.6875rem] font-bold tracking-[0.08em] text-primary">{item?.kind === 'activity' ? 'ATIVIDADE' : 'VÍDEO'}</span>
        {item && <span className="font-medium tabular-nums text-muted-foreground">{position + 1} de {total}</span>}
      </header>

      <div className="grid content-start gap-4 p-4 max-[1180px]:grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]">
        {!item && <p className="m-0 text-sm leading-relaxed text-muted-foreground">Envie um vídeo ou escolha um na biblioteca para começar a montar o curso.</p>}

        {item?.kind === 'video' && <>
          <PropField label="Título">{item.video.title}</PropField>
          <div className="grid grid-cols-2 gap-3">
            <PropField label="Duração">{formatDuration(item.video.durationMilliseconds)}</PropField>
            <PropField label="Perguntas">{item.video.checkpoints.length}</PropField>
          </div>
        </>}

        {item?.kind === 'activity' && <>
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
        </>}

        <section aria-labelledby="ce-props-activities" className="grid gap-2 border-t border-border pt-4 max-[1180px]:col-span-full">
          <h3 className="m-0 text-base font-medium" id="ce-props-activities">Atividades e perguntas</h3>
          <p className="m-0 text-[0.8125rem] leading-relaxed text-muted-foreground">
            Adicione atividades entre vídeos ou perguntas que aparecem durante a reprodução.
          </p>
          <Button className="w-full" disabled={busy} onClick={onManageActivities} variant="outline">Configurar atividades</Button>
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
