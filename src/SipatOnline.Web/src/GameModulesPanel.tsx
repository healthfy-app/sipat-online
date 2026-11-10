import { useState, type FormEvent } from 'react';
import {
  createGameModule,
  deleteGameModule,
  updateGameModule,
  type GameModule,
  type GameQuestion,
  type GamificationGameType,
} from './api';
import { gameTypeOptions } from './gamificationGames';

interface QuestionDraft {
  text: string;
  optionsText: string;
  correctIndex: number;
}

const emptyQuestion: QuestionDraft = { text: '', optionsText: '', correctIndex: 0 };

function toDraft(question: GameQuestion): QuestionDraft {
  return { text: question.text, optionsText: question.options.join('\n'), correctIndex: question.correctIndex };
}

function toQuestion(draft: QuestionDraft): GameQuestion {
  return {
    text: draft.text.trim(),
    options: draft.optionsText.split('\n').map((option) => option.trim()).filter(Boolean),
    correctIndex: draft.correctIndex,
  };
}

export default function GameModulesPanel({
  modules,
  onChanged,
  onError,
}: {
  modules: GameModule[];
  onChanged: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState<GameModule | null>(null);
  const [title, setTitle] = useState('');
  const [gameType, setGameType] = useState<GamificationGameType>('Quiz');
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...emptyQuestion }]);
  const [isSaving, setIsSaving] = useState(false);

  function startEdit(module: GameModule | null) {
    setEditing(module);
    setTitle(module?.title ?? '');
    setGameType(module?.gameType ?? 'Quiz');
    setQuestions(module && module.questions.length > 0 ? module.questions.map(toDraft) : [{ ...emptyQuestion }]);
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    setIsSaving(true);
    const data = {
      title: title.trim(),
      gameType,
      questions: gameType === 'Quiz' ? questions.map(toQuestion) : [],
    };
    try {
      if (editing) {
        await updateGameModule(editing.id, data);
      } else {
        await createGameModule(data);
      }
      const message = editing ? 'O módulo foi atualizado.' : `O módulo "${data.title}" foi criado.`;
      startEdit(null);
      await onChanged(message);
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar o módulo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(module: GameModule) {
    onError('');
    try {
      await deleteGameModule(module.id);
      if (editing?.id === module.id) startEdit(null);
      await onChanged(`O módulo "${module.title}" foi removido.`);
    } catch (deleteError) {
      onError(deleteError instanceof Error ? deleteError.message : 'Não foi possível remover o módulo.');
    }
  }

  return (
    <div className="management-grid">
      <section aria-labelledby="game-module-form-title" className="form-card">
        <h2 id="game-module-form-title">{editing ? 'Editar módulo' : 'Novo módulo de jogo'}</h2>
        <p className="muted-copy">
          Módulos podem entrar na trilha do curso ou parar um vídeo em uma minutagem. Não valem pontos e nunca bloqueiam o participante.
        </p>
        <form className="event-form event-form-single" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="game-module-title">Nome do módulo</label>
            <input id="game-module-title" maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} />
          </div>
          <div className="field">
            <label htmlFor="game-module-type">Tipo de jogo</label>
            <select id="game-module-type" onChange={(event) => setGameType(event.target.value as GamificationGameType)} value={gameType}>
              {gameTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}{option.playable ? '' : ' (jogável em breve)'}
                </option>
              ))}
            </select>
          </div>
          {gameType === 'Quiz' && questions.map((question, index) => (
            <fieldset className="game-question-editor" key={index}>
              <legend>Pergunta {index + 1}</legend>
              <div className="field">
                <label htmlFor={`game-question-text-${index}`}>Texto da pergunta {index + 1}</label>
                <input id={`game-question-text-${index}`} maxLength={500} onChange={(event) => updateQuestion(index, { text: event.target.value })} required value={question.text} />
              </div>
              <div className="field">
                <label htmlFor={`game-question-options-${index}`}>Alternativas da pergunta {index + 1}</label>
                <textarea id={`game-question-options-${index}`} onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} required rows={3} value={question.optionsText} />
                <span className="field-hint">Uma alternativa por linha (2 a 6).</span>
              </div>
              <div className="field">
                <label htmlFor={`game-question-correct-${index}`}>Alternativa correta da pergunta {index + 1}</label>
                <select id={`game-question-correct-${index}`} onChange={(event) => updateQuestion(index, { correctIndex: Number(event.target.value) })} value={question.correctIndex}>
                  {question.optionsText.split('\n').map((option) => option.trim()).filter(Boolean).map((option, optionIndex) => (
                    <option key={optionIndex} value={optionIndex}>{option}</option>
                  ))}
                </select>
              </div>
              {questions.length > 1 && (
                <button className="button button-quiet" onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))} type="button">
                  Remover pergunta {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          {gameType === 'Quiz' && questions.length < 50 && (
            <button className="button button-secondary" onClick={() => setQuestions((current) => [...current, { ...emptyQuestion }])} type="button">
              Adicionar pergunta
            </button>
          )}
          {gameType !== 'Quiz' && (
            <p className="field-hint">Este tipo de jogo só tem nome por enquanto; o conteúdo será configurável quando o jogo for liberado.</p>
          )}
          <div className="platform-course-card-actions">
            <button className="button button-primary" disabled={isSaving} type="submit">
              {isSaving ? 'Salvando...' : editing ? 'Salvar módulo' : 'Criar módulo'}
            </button>
            {editing && <button className="button button-quiet" onClick={() => startEdit(null)} type="button">Cancelar edição</button>}
          </div>
        </form>
      </section>

      <section aria-labelledby="game-module-list-title" className="list-section">
        <h2 id="game-module-list-title">Módulos cadastrados ({modules.length})</h2>
        {modules.length === 0 ? (
          <p className="compact-empty">Nenhum módulo ainda. Crie o primeiro ao lado.</p>
        ) : (
          <ul className="platform-video-order">
            {modules.map((module) => (
              <li key={module.id}>
                <span>
                  <strong>{module.title}</strong>
                  <small>
                    {gameTypeOptions.find((option) => option.value === module.gameType)?.label} · {module.questions.length} pergunta(s) · usado {module.usageCount}x
                  </small>
                </span>
                <span className="platform-video-order-actions">
                  <button className="button button-quiet" onClick={() => startEdit(module)} type="button" aria-label={`Editar módulo ${module.title}`}>Editar</button>
                  <button className="button button-quiet" onClick={() => void handleDelete(module)} type="button" aria-label={`Remover módulo ${module.title}`}>Remover</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
