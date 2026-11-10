import { useState } from 'react';
import type { GameModule } from './api';

/** Plays a module without scoring. It can always be skipped and never blocks anything. */
export default function GamePlayer({
  module,
  onClose,
}: {
  module: GameModule;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const question = module.questions[index];
  const isLast = index >= module.questions.length - 1;

  function next() {
    if (isLast) {
      onClose();
      return;
    }
    setIndex(index + 1);
    setSelected(null);
  }

  if (module.gameType !== 'Quiz' || !question) {
    return (
      <section aria-label={module.title} className="game-player">
        <h3>{module.title}</h3>
        <p className="muted-copy">Este tipo de jogo ainda não está disponível para jogar.</p>
        <button className="button button-secondary" onClick={onClose} type="button">Continuar</button>
      </section>
    );
  }

  return (
    <section aria-label={module.title} className="game-player">
      <p className="eyebrow">{module.title} · {index + 1}/{module.questions.length}</p>
      <h3>{question.text}</h3>
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
              {option}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <p aria-live="polite" role="status">
          {selected === question.correctIndex
            ? 'Resposta correta!'
            : `A resposta correta é: ${question.options[question.correctIndex]}`}
        </p>
      )}
      <div className="game-actions">
        {selected !== null && (
          <button className="button button-primary" onClick={next} type="button">
            {isLast ? 'Continuar' : 'Próxima pergunta'}
          </button>
        )}
        <button className="button button-quiet" onClick={onClose} type="button">Pular</button>
      </div>
    </section>
  );
}
