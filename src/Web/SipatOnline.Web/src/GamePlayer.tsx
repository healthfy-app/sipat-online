import { useCallback, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { GameModule } from './api';
import { Button } from '@/components/ui/button';
import { prefersReducedMotion, useElapsedSeconds, useGameScore, type GameOutcome, type GameResult } from '@/games/gameKit';
import { GameCountdown, GameFrame, GameHud, GameIntro, GameVictory, useTitleId, type HudProgress } from '@/games/GameShell';
import MemoryGame from '@/games/MemoryGame';
import OrderingGame from '@/games/OrderingGame';
import PuzzleGame from '@/games/PuzzleGame';
import QuizGame from '@/games/QuizGame';
import RiskSpottingGame from '@/games/RiskSpottingGame';
import SafeOrRiskyGame from '@/games/SafeOrRiskyGame';

export type { GameOutcome } from '@/games/gameKit';

const boards = {
  Quiz: QuizGame, Scenario: QuizGame, RiskSpotting: RiskSpottingGame, Memory: MemoryGame, Puzzle: PuzzleGame, Ordering: OrderingGame, SafeOrRisky: SafeOrRiskyGame,
} as const;

function isPlayable(module: GameModule) {
  const content = module.content;
  switch (module.gameType) {
    case 'Quiz': case 'Scenario': return module.questions.length > 0;
    case 'RiskSpotting': return !!content?.imageUrl && !!content.risks?.length;
    case 'Memory': return !!content?.pairs?.length;
    case 'Puzzle': return !!content?.imageUrl;
    case 'Ordering': return (content?.items?.length ?? 0) >= 2;
    case 'SafeOrRisky': return !!content?.cards?.some(card => card.text.trim());
  }
}

/**
 * Plays a module: opening screen, countdown, the board with a live scoreboard, then the result.
 * It can always be skipped and never blocks the course. Points are for fun only and are not saved.
 */
export default function GamePlayer({ module, onClose }: { module: GameModule; onClose: (outcome?: GameOutcome) => void }) {
  const [attempt, setAttempt] = useState(0);
  return <MotionConfig reducedMotion="user">
    <GameSession key={attempt} module={module} onClose={onClose} onReplay={() => setAttempt(value => value + 1)} replay={attempt > 0} />
  </MotionConfig>;
}

function GameSession({ module, onClose, onReplay, replay }: {
  module: GameModule; onClose: (outcome?: GameOutcome) => void; onReplay: () => void; replay: boolean;
}) {
  const titleId = useTitleId();
  const [phase, setPhase] = useState<'intro' | 'countdown' | 'play' | 'done'>(replay ? 'play' : 'intro');
  const [result, setResult] = useState<GameResult | null>(null);
  const [progress, setProgress] = useState<HudProgress | null>(null);
  const score = useGameScore();
  const seconds = useElapsedSeconds(phase === 'play');
  const onProgress = useCallback((next: HudProgress) => setProgress(next), []);
  const startPlaying = useCallback(() => setPhase('play'), []);
  const skip = () => onClose('skipped');

  if (!isPlayable(module)) return <GameFrame module={module} onSkip={skip} showSkip={false} titleId={titleId}>
    <div className="grid justify-items-start gap-3 p-5" role="alert">
      <p className="m-0">Este jogo precisa de conteúdo. Peça à operação para revisar a configuração.</p>
      <Button onClick={skip} variant="outline">Pular atividade</Button>
    </div>
  </GameFrame>;

  const Board = boards[module.gameType];
  return <GameFrame module={module} onSkip={skip} showSkip={phase !== 'done'} titleId={titleId}>
    {phase === 'intro' && <GameIntro module={module} onStart={() => setPhase(prefersReducedMotion() ? 'play' : 'countdown')} />}
    {phase === 'countdown' && <GameCountdown onDone={startPlaying} />}
    {phase === 'play' && <>
      <GameHud gainId={score.gainId} lastGain={score.lastGain} progress={progress} score={score.score} seconds={seconds} streak={score.streak} />
      <Board module={module} onFinish={outcome => { setResult({ ...outcome, seconds }); setPhase('done'); }} onProgress={onProgress} score={score} />
    </>}
    {phase === 'done' && result && <GameVictory onContinue={() => onClose('completed')} onReplay={onReplay} result={result} />}
  </GameFrame>;
}
