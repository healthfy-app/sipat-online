import type { GamificationGameType } from './api';

export interface GameTypeOption {
  value: GamificationGameType;
  label: string;
  description: string;
  playable: boolean;
  /** Still plays and can be edited, but new games of this type cannot be created. */
  retired?: boolean;
}

export const gameTypeOptions: GameTypeOption[] = [
  { value: 'Quiz', label: 'Quiz', description: 'Perguntas de múltipla escolha com feedback, sem pontuação.', playable: true },
  { value: 'SafeOrRisky', label: 'Seguro ou arriscado?', description: 'Cartas com situações: o participante arrasta para seguro ou arriscado e vê o porquê.', playable: true },
  { value: 'RiskSpotting', label: 'Caça aos riscos', description: 'Encontrar perigos em uma imagem do ambiente de trabalho.', playable: true, retired: true },
  { value: 'Puzzle', label: 'Quebra-cabeça', description: 'Montar uma imagem ou cartaz de segurança.', playable: true },
  { value: 'Memory', label: 'Jogo da memória', description: 'Associar equipamentos de proteção aos seus usos.', playable: true },
  { value: 'Scenario', label: 'Simulador de cenários', description: 'Escolher a melhor atitude em uma situação de risco.', playable: true },
  { value: 'Ordering', label: 'Ordenação', description: 'Colocar os passos de um procedimento na ordem correta.', playable: true },
];
