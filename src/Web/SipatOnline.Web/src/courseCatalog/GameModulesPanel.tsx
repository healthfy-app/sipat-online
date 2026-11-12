import type { GameModule } from '../api';
import { ActivityIcon } from '../courseEditor/CourseOutlinePanel';
import { gameTypeLabel } from '../courseEditor/courseTrack';
import { pluralize } from '../courseEditor/courseFormat';

export default function GameModulesPanel({
  modules,
  busy,
  onCreate,
  onEdit,
  onDelete,
}: {
  modules: GameModule[];
  busy: boolean;
  onCreate: () => void;
  onEdit: (module: GameModule) => void;
  onDelete: (module: GameModule) => void;
}) {
  return (
    <section aria-label="Jogos cadastrados" className="cat-panel">
      <div className="cat-toolbar">
        <p className="cat-toolbar-text">Jogos e perguntas para colocar entre os vídeos ou durante a reprodução.</p>
        <span className="cat-result-count">{pluralize(modules.length, 'jogo', 'jogos')}</span>
      </div>

      {modules.length === 0 ? (
        <div className="cat-empty">
          <p>Nenhum jogo ainda.</p>
          <button className="cat-btn cat-btn-primary" onClick={onCreate} type="button">Criar o primeiro jogo</button>
        </div>
      ) : (
        <ul className="cat-game-list">
          {modules.map((module) => {
            const contentCount = module.questions.length > 0
              ? pluralize(module.questions.length, 'pergunta', 'perguntas')
              : null;
            return (
              <li className="cat-game" key={module.id}>
                <span aria-hidden="true" className={`cat-game-icon is-${module.gameType.toLowerCase()}`}>
                  <ActivityIcon />
                </span>
                <div className="cat-game-text">
                  <strong>{module.title}</strong>
                  <span>
                    {gameTypeLabel(module)}
                    {contentCount && ` · ${contentCount}`}
                    {' · '}
                    {module.usageCount === 0 ? 'não usado em cursos' : `usado ${module.usageCount}×`}
                  </span>
                </div>
                <div className="cat-game-actions">
                  <button aria-label={`Editar jogo ${module.title}`} className="cat-btn" disabled={busy}
                    onClick={() => onEdit(module)} type="button">Editar</button>
                  <button aria-label={`Remover jogo ${module.title}`} className="cat-btn cat-btn-danger" disabled={busy}
                    onClick={() => onDelete(module)} type="button">Remover</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
