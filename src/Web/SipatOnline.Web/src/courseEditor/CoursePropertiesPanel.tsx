import type { ReactNode } from 'react';
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
    <aside aria-label="Propriedades do conteúdo" className="ce-panel ce-props">
      <header className="ce-props-head">
        <span className="ce-props-type">{item?.kind === 'activity' ? 'ATIVIDADE' : 'VÍDEO'}</span>
        {item && <span className="ce-props-position">{position + 1} de {total}</span>}
      </header>

      <div className="ce-props-body">
        {!item && <p className="ce-props-hint">Envie um vídeo ou escolha um na biblioteca para começar a montar o curso.</p>}

        {item?.kind === 'video' && <>
          <PropField label="Título">{item.video.title}</PropField>
          <div className="ce-props-row">
            <PropField label="Duração">{formatDuration(item.video.durationMilliseconds)}</PropField>
            <PropField label="Perguntas">{item.video.checkpoints.length}</PropField>
          </div>
        </>}

        {item?.kind === 'activity' && <>
          <PropField label="Título">{item.module.title}</PropField>
          <div className="ce-props-row">
            <PropField label="Tipo">{gameTypeLabel(item.module)}</PropField>
            <PropField label="Posição">
              {item.afterVideoCount === 0 ? 'Antes do 1º vídeo' : `Após o ${item.afterVideoCount}º vídeo`}
            </PropField>
          </div>
          {item.module.questions.length > 0 && (
            <PropField label="Conteúdo">{pluralize(item.module.questions.length, 'pergunta', 'perguntas')}</PropField>
          )}
        </>}

        <section className="ce-props-group" aria-labelledby="ce-props-activities">
          <h3 id="ce-props-activities">Atividades e perguntas</h3>
          <p>Adicione atividades entre vídeos ou perguntas que aparecem durante a reprodução.</p>
          <button className="ce-btn ce-btn-outline" disabled={busy} onClick={onManageActivities} type="button">
            Configurar atividades
          </button>
          <span className={`ce-props-status${gamificationEnabled ? ' is-on' : ''}`}>
            Atividades opcionais · {gamificationEnabled ? 'gamificação ativada' : 'gamificação desativada'}
          </span>
        </section>
      </div>
    </aside>
  );
}

function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ce-field">
      <span className="ce-field-label">{label}</span>
      <span className="ce-field-value">{children}</span>
    </div>
  );
}
