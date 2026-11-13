import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Check, ShieldAlert, X } from 'lucide-react';
import type { GameModule } from '@/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { prefersReducedMotion, starsFor, type FinishGame, type useGameScore } from './gameKit';
import { GameMessage, type HudProgress } from './GameShell';

const fastWindowSeconds = 10;

/** Quiz and Scenario share the flow: one question at a time, instant feedback, combo and speed bonus. */
export default function QuizGame({ module, score, onProgress, onFinish }: {
  module: GameModule; score: ReturnType<typeof useGameScore>;
  onProgress: (progress: HudProgress) => void; onFinish: FinishGame;
}) {
  const scenario = module.gameType === 'Scenario';
  const questions = module.questions;
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const askedAt = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const question = questions[index];
  const isLast = index >= questions.length - 1;
  const answered = selected !== null;
  const correct = answered && selected === question.correctIndex;

  useEffect(() => { askedAt.current = Date.now(); if (index > 0) heading.current?.focus(); }, [index]);
  useEffect(() => {
    onProgress({ done: index + (answered ? 1 : 0), total: questions.length, label: scenario ? 'situações' : 'perguntas' });
  }, [index, answered, questions.length, scenario, onProgress]);

  function choose(option: number) {
    if (answered) return;
    setSelected(option);
    if (option === question.correctIndex) {
      score.hit(100);
      const seconds = (Date.now() - askedAt.current) / 1000;
      const bonus = Math.round(Math.max(0, fastWindowSeconds - seconds) * 5);
      if (bonus > 0 && !scenario) score.bonus(bonus);
    } else score.miss();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (answered || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const option = event.key.toUpperCase().charCodeAt(0) - 65;
      if (event.key.length === 1 && option >= 0 && option < question.options.length) { event.preventDefault(); choose(option); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function next() {
    if (!isLast) { setIndex(index + 1); setSelected(null); return; }
    const { score: points, hits, misses } = score.current();
    onFinish({ score: points, hits, misses, stars: starsFor(hits, misses) });
  }

  const reduced = prefersReducedMotion();
  return <div className="grid gap-4 p-4 sm:p-6" key={index}>
    <motion.div animate={{ opacity: 1, y: 0 }} className={cn('rounded-2xl', scenario ? 'game-scene p-5 text-white' : 'bg-muted p-5')}
      initial={reduced ? false : { opacity: 0, y: 12 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
      <p className={cn('m-0 mb-2 text-xs font-semibold tracking-[0.08em] uppercase', scenario ? 'text-signal' : 'text-muted-foreground')}>
        {scenario ? <span className="inline-flex items-center gap-1.5"><ShieldAlert aria-hidden="true" className="size-4" />Situação {index + 1} de {questions.length}</span>
          : `Pergunta ${index + 1} de ${questions.length}`}
      </p>
      <h4 className={cn('m-0 text-lg leading-snug font-semibold outline-none sm:text-xl', scenario && 'text-white')} ref={heading} tabIndex={-1}>{question.text}</h4>
      {scenario && <p className="m-0 mt-2 text-sm text-white/75">O que você faz?</p>}
    </motion.div>
    <div aria-label="Alternativas" className="grid gap-2 sm:grid-cols-2" role="group">
      {question.options.map((option, optionIndex) => {
        const isAnswer = optionIndex === question.correctIndex;
        const isPicked = optionIndex === selected;
        const state = !answered ? 'idle' : isAnswer ? 'right' : isPicked ? 'wrong' : 'dim';
        return <motion.button
          animate={state === 'wrong' && !reduced ? { x: [0, -8, 8, -5, 5, 0] } : state === 'right' && isPicked && !reduced ? { scale: [1, 1.04, 1] } : {}}
          className={cn('game-option-tile group relative flex min-h-16 w-full items-center gap-3 rounded-xl border-2 bg-card px-3.5 py-3 text-left text-[0.9375rem] font-medium',
            state === 'idle' && 'border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card-hover',
            state === 'right' && 'border-success bg-success-soft',
            state === 'wrong' && 'border-destructive bg-destructive-soft',
            state === 'dim' && 'border-border opacity-55')}
          disabled={answered} key={option} onClick={() => choose(optionIndex)} transition={{ duration: 0.4 }} type="button">
          <span aria-hidden="true" className={cn('grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold',
            state === 'right' ? 'bg-success text-white' : state === 'wrong' ? 'bg-destructive text-white' : 'bg-muted text-foreground group-hover:bg-primary group-hover:text-white')}>
            {state === 'right' ? <Check className="size-4" /> : state === 'wrong' ? <X className="size-4" /> : String.fromCharCode(65 + optionIndex)}
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option}</span>
        </motion.button>;
      })}
    </div>
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
      <GameMessage tone={!answered ? 'neutral' : correct ? 'good' : 'bad'}>
        {!answered ? '' : correct
          ? (scenario ? 'Boa decisão! Essa é a atitude segura.' : 'Resposta correta!')
          : (scenario ? `Atitude arriscada. O mais seguro: ${question.options[question.correctIndex]}` : `A resposta correta é: ${question.options[question.correctIndex]}`)}
      </GameMessage>
      {answered && <Button autoFocus onClick={next}>{isLast ? 'Ver resultado' : scenario ? 'Próxima situação' : 'Próxima pergunta'}<ArrowRight className="size-4" /></Button>}
    </div>
  </div>;
}
