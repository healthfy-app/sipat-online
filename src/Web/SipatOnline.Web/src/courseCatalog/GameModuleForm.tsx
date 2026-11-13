import { ArrowLeft, Play, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  createGameModule,
  updateGameModule,
  type GameModule,
  type GameQuestion,
  type GamificationGameType,
} from '@/api';
import { Button } from '@/components/ui/button';
import { DialogActions } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import { gameTypeOptions } from '@/gamificationGames';
import GameContentEditor, { emptyGameContent } from './GameContentEditor';
import LazyGamePlayer from '@/games/LazyGamePlayer';

interface QuestionDraft {
  text: string;
  optionsText: string;
  correctIndex: number;
}

const emptyQuestion: QuestionDraft = { text: '', optionsText: '', correctIndex: 0 };
const usesQuestions = (type: GamificationGameType) => type === 'Quiz' || type === 'Scenario';
const optionLines = (text: string) => text.split('\n').map((option) => option.trim()).filter(Boolean);

function toDraft(question: GameQuestion): QuestionDraft {
  return { text: question.text, optionsText: question.options.join('\n'), correctIndex: question.correctIndex };
}

function toQuestion(draft: QuestionDraft): GameQuestion {
  return { text: draft.text.trim(), options: optionLines(draft.optionsText), correctIndex: draft.correctIndex };
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
  const [testing, setTesting] = useState(false);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function draftData() {
    return {
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
  }

  if (testing) {
    const data = draftData();
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-sm text-muted-foreground">Teste com o que está no formulário agora. Nada é salvo.</p>
          <Button onClick={() => setTesting(false)} size="sm" variant="outline"><ArrowLeft /> Voltar à edição</Button>
        </div>
        <LazyGamePlayer
          module={{ ...data, title: data.title || 'Jogo sem nome', id: module?.id ?? 'draft', createdAt: '', usageCount: 0 }}
          onClose={() => setTesting(false)}
        />
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);
    onBusyChange(true);
    const data = draftData();
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
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <p className="m-0 text-sm text-muted-foreground">
        Jogos entram na trilha do curso ou param um vídeo num momento escolhido. O participante vê pontos e estrelas só como
        incentivo (nada é salvo) e sempre pode pular.
      </p>
      {error && <p className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="game-module-title" label="Nome do jogo">
          <Input data-autofocus id="game-module-title" maxLength={200} required value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field hint={gameTypeOptions.find((option) => option.value === gameType)?.description} htmlFor="game-module-type" label="Tipo de jogo">
          <NativeSelect id="game-module-type" value={gameType} onChange={(event) => setGameType(event.target.value as GamificationGameType)}>
            {gameTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}{option.playable ? '' : ' (jogável em breve)'}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {usesQuestions(gameType) && questions.map((question, index) => (
        <fieldset className="m-0 grid gap-3 rounded-lg border border-border p-4" key={index}>
          <legend className="px-1 text-[0.8125rem] font-semibold">Pergunta {index + 1}</legend>
          <Field htmlFor={`game-question-text-${index}`} label={`Texto da pergunta ${index + 1}`}>
            <Input id={`game-question-text-${index}`} maxLength={500} required value={question.text}
              onChange={(event) => updateQuestion(index, { text: event.target.value })} />
          </Field>
          <Field hint="Uma alternativa por linha (2 a 6)." htmlFor={`game-question-options-${index}`} label={`Alternativas da pergunta ${index + 1}`}>
            <Textarea id={`game-question-options-${index}`} required rows={3} value={question.optionsText}
              onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} />
          </Field>
          <Field htmlFor={`game-question-correct-${index}`} label={`Alternativa correta da pergunta ${index + 1}`}>
            <NativeSelect id={`game-question-correct-${index}`} value={question.correctIndex}
              onChange={(event) => updateQuestion(index, { correctIndex: Number(event.target.value) })}>
              {optionLines(question.optionsText).map((option, optionIndex) => (
                <option key={optionIndex} value={optionIndex}>{option}</option>
              ))}
            </NativeSelect>
          </Field>
          {questions.length > 1 && (
            <Button className="justify-self-start" size="sm" variant="ghost"
              onClick={() => setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
              Remover pergunta {index + 1}
            </Button>
          )}
        </fieldset>
      ))}
      {usesQuestions(gameType) && questions.length < 50 && (
        <Button className="justify-self-start" variant="outline" onClick={() => setQuestions((current) => [...current, { ...emptyQuestion }])}>
          <Plus /> Adicionar pergunta
        </Button>
      )}
      {!usesQuestions(gameType) && <GameContentEditor content={content} onChange={setContent} type={gameType} />}

      <DialogActions>
        <Button className="sm:mr-auto" disabled={isSaving} onClick={() => setTesting(true)} variant="ghost"><Play /> Testar jogo</Button>
        <Button disabled={isSaving} onClick={onCancel} variant="outline">Cancelar</Button>
        <Button disabled={isSaving} type="submit">{isSaving ? 'Salvando...' : module ? 'Salvar jogo' : 'Criar jogo'}</Button>
      </DialogActions>
    </form>
  );
}
