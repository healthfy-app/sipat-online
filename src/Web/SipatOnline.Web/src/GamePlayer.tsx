import { useEffect, useRef, useState } from 'react';
import type { GameModule } from './api';
import InteractiveGame, { type GameOutcome } from './InteractiveGame';
import AchievementMark from './AchievementMark';

/** Plays a module without scoring. It can always be skipped and never blocks anything. */
export default function GamePlayer({
  module,
  onClose,
}: {
  module: GameModule;
  onClose: (outcome?: GameOutcome) => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const question = module.questions[index];
  const isLast = index >= module.questions.length - 1;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (index > 0) heading.current?.focus(); }, [index]);

  function next() {
    if (isLast) {
      onClose('completed');
      return;
    }
    setIndex(index + 1);
    setSelected(null);
  }

  if (module.gameType !== 'Quiz' && module.gameType !== 'Scenario') {
    return <InteractiveGame key={module.id} module={module} onClose={onClose} />;
  }
  if (!question) {
    return (
      <section aria-label={module.title} className="game-player">
        <h3>{module.title}</h3>
        <p className="muted-copy">Este tipo de jogo ainda não está disponível para jogar.</p>
        <button className="button button-secondary" onClick={() => onClose('skipped')} type="button">Continuar</button>
      </section>
    );
  }

  return (
    <section aria-label={module.title} className="game-player">
      <div className="game-step-heading"><span>{module.title}</span><span>{index + 1}/{module.questions.length}</span></div>
      <progress className="game-question-progress" aria-label="Progresso das perguntas"
        max={module.questions.length} value={index + (selected === null ? 0 : 1)} />
      <div className="game-question" key={index}>
      <h3 ref={heading} tabIndex={-1}>{question.text}</h3>
      <div className="game-options" role="group" aria-label="Alternativas">
        {question.options.map((option, optionIndex) => {
          const state = selected === null
            ? ''
            : optionIndex === question.correctIndex
              ? ' is-correct'
              : optionIndex === selected
                ? ' is-wrong'
                : '';
          return (
            <button
              className={`game-option${state}`}
              disabled={selected !== null}
              key={option}
              onClick={() => setSelected(optionIndex)}
              type="button"
            >
              <span className="game-option-letter" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
              <span>{option}</span>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className={`game-feedback${selected === question.correctIndex ? ' is-complete' : ''}`}>
        {selected === question.correctIndex && <AchievementMark animate />}
        <p aria-live="polite" role="status">
          {selected === question.correctIndex
            ? 'Resposta correta!'
            : `A resposta correta é: ${question.options[question.correctIndex]}`}
        </p>
        </div>
      )}
      </div>
      <div className="game-actions">
        {selected !== null && (
          <button className="button button-primary" onClick={next} type="button">
            {isLast ? 'Continuar' : 'Próxima pergunta'}
          </button>
        )}
        <button className="button button-quiet" onClick={() => onClose('skipped')} type="button">Pular</button>
      </div>
    </section>
  );
}
