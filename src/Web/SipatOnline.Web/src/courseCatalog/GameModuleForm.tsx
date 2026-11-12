import { useState, type FormEvent } from 'react';
import {
  createGameModule,
  updateGameModule,
  type GameModule,
  type GameQuestion,
  type GamificationGameType,
} from '../api';
import GameContentEditor, { emptyGameContent } from '../GameContentEditor';
import { gameTypeOptions } from '../gamificationGames';
import { getErrorMessage } from '../courseEditor/courseFormat';

interface QuestionDraft {
  text: string;
  optionsText: string;
  correctIndex: number;
}

const emptyQuestion: QuestionDraft = { text: '', optionsText: '', correctIndex: 0 };
const usesQuestions = (type: GamificationGameType) => type === 'Quiz' || type === 'Scenario';

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

/** Formulário de criação e edição de um jogo; usado dentro de um diálogo. */
export default function GameModuleForm({
  module,
  onBusyChange,
  onCancel,
  onSaved,
}: {
  module: GameModule | null;
  onBusyChange: (busy: boolean) => void;
  onCancel: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(module?.title ?? '');
  const [gameType, setGameType] = useState<GamificationGameType>(module?.gameType ?? 'Quiz');
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    module && module.questions.length > 0 ? module.questions.map(toDraft) : [{ ...emptyQuestion }],
  );
  const [content, setContent] = useState(module?.content ?? emptyGameContent);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    onBusyChange(true);
    const data = {
      title: title.trim(),
      gameType,
      questions: usesQuestions(gameType) ? questions.map(toQuestion) : [],
      content: usesQuestions(gameType) ? null : {
        ...content,
        imageUrl: content.imageUrl?.trim() ?? null,
        items: content.items?.map((item) => item.trim()).filter(Boolean) ?? null,
        pairs: content.pairs?.map((pair) => ({ first: pair.first.trim(), second: pair.second.trim() })) ?? null,
      },
    };
    try {
      if (module) await updateGameModule(module.id, data);
      else await createGameModule(data);
      await onSaved(module ? `O jogo "${data.title}" foi atualizado.` : `O jogo "${data.title}" foi criado.`);
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
      onBusyChange(false);
    }
  }

  return (
    <form className="event-form event-form-single cat-game-form" onSubmit={handleSubmit}>
      <p className="muted-copy">
        Jogos entram na trilha do curso ou param um vídeo num momento escolhido. Não valem pontos e nunca bloqueiam o participante.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="field">
        <label htmlFor="game-module-title">Nome do jogo</label>
        <input data-autofocus id="game-module-title" maxLength={200} onChange={(event) => setTitle(event.target.value)} required value={title} />
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
        <span className="field-hint">{gameTypeOptions.find((option) => option.value === gameType)?.description}</span>
      </div>

      {usesQuestions(gameType) && questions.map((question, index) => (
        <fieldset className="game-question-editor" key={index}>
          <legend>Pergunta {index + 1}</legend>
          <div className="field">
            <label htmlFor={`game-question-text-${index}`}>Texto da pergunta {index + 1}</label>
            <input id={`game-question-text-${index}`} maxLength={500} required value={question.text}
              onChange={(event) => updateQuestion(index, { text: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor={`game-question-options-${index}`}>Alternativas da pergunta {index + 1}</label>
            <textarea id={`game-question-options-${index}`} required rows={3} value={question.optionsText}
              onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} />
            <span className="field-hint">Uma alternativa por linha (2 a 6).</span>
          </div>
          <div className="field">
            <label htmlFor={`game-question-correct-${index}`}>Alternativa correta da pergunta {index + 1}</label>
            <select id={`game-question-correct-${index}`} value={question.correctIndex}
              onChange={(event) => updateQuestion(index, { correctIndex: Number(event.target.value) })}>
              {question.optionsText.split('\n').map((option) => option.trim()).filter(Boolean).map((option, optionIndex) => (
                <option key={optionIndex} value={optionIndex}>{option}</option>
              ))}
            </select>
          </div>
          {questions.length > 1 && (
            <button className="button button-quiet" type="button"
              onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              Remover pergunta {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      {usesQuestions(gameType) && questions.length < 50 && (
        <button className="button button-secondary" onClick={() => setQuestions((current) => [...current, { ...emptyQuestion }])} type="button">
          Adicionar pergunta
        </button>
      )}
      {!usesQuestions(gameType) && <GameContentEditor content={content} onChange={setContent} type={gameType} />}

      <div className="course-dialog-actions">
        <button className="button button-secondary" disabled={isSaving} onClick={onCancel} type="button">Cancelar</button>
        <button className="button course-primary" disabled={isSaving} type="submit">
          {isSaving ? 'Salvando...' : module ? 'Salvar jogo' : 'Criar jogo'}
        </button>
      </div>
    </form>
  );
}
