import { Brain, Layers, ListOrdered, MessageCircleQuestion, Puzzle, Search, Signpost, type LucideIcon } from 'lucide-react';
import type { GamificationGameType } from '@/api';

export interface GameTypeLook {
  label: string;
  icon: LucideIcon;
  /** Short how-to shown on the opening screen. */
  howTo: string[];
}

export const gameLooks: Record<GamificationGameType, GameTypeLook> = {
  Quiz: {
    label: 'Quiz', icon: MessageCircleQuestion,
    howTo: ['Escolha a alternativa certa (dá para usar as teclas A, B, C...).', 'Acertos seguidos multiplicam seus pontos.', 'Responder rápido vale bônus.'],
  },
  Scenario: {
    label: 'Simulador de cenários', icon: Signpost,
    howTo: ['Leia a situação com atenção.', 'Escolha a atitude mais segura.', 'Boas decisões seguidas multiplicam seus pontos.'],
  },
  RiskSpotting: {
    label: 'Caça aos riscos', icon: Search,
    howTo: ['Use a lanterna para varrer a imagem.', 'Clique em cada risco que encontrar.', 'Cliques no lugar errado quebram o combo.'],
  },
  Memory: {
    label: 'Jogo da memória', icon: Brain,
    howTo: ['Vire duas cartas por vez.', 'Junte o equipamento à proteção que ele oferece.', 'Pares seguidos multiplicam seus pontos.'],
  },
  Puzzle: {
    label: 'Quebra-cabeça', icon: Puzzle,
    howTo: ['Arraste uma peça sobre outra para trocar as duas.', 'Ou clique em duas peças, uma depois da outra.', 'Peças no lugar certo travam sozinhas.'],
  },
  SafeOrRisky: {
    label: 'Seguro ou arriscado?', icon: Layers,
    howTo: ['Leia a situação de cada carta.', 'Arraste para a direita se for seguro e para a esquerda se for arriscado (ou use os botões e as setas).', 'Acertos seguidos multiplicam seus pontos.'],
  },
  Ordering: {
    label: 'Ordenação', icon: ListOrdered,
    howTo: ['Arraste as etapas pela alça ou use as setas.', 'Monte o procedimento na ordem certa.', 'Acertar de primeira vale mais pontos.'],
  },
};
