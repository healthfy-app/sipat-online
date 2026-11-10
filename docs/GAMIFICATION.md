# Gamificação nos cursos da SIPAT

A gamificação é opcional e escolhida por curso, no cadastro ou na edição do curso (perfil Operacional). Ela vem depois dos vídeos. Este documento registra a pesquisa de mercado e o que já existe no produto.

## Pesquisa de mercado

Plataformas de treinamento em SST, como a Worklinic, oferecem dezenas de jogos e simuladores. Os formatos mais comuns são quiz, percepção de risco em imagens e simuladores de situação. Esse tipo de jogo funciona bem em semanas de prevenção porque é curto, repetível e dá feedback imediato. Os seis tipos abaixo cobrem esses formatos sem exigir produção de conteúdo pesada.

## Os 6 tipos de jogo

| Tipo | Valor na API | Como funciona | Estado atual |
| --- | --- | --- | --- |
| Quiz | `Quiz` | Perguntas de múltipla escolha com pontuação e feedback. | Configurável; execução é o próximo passo. |
| Caça aos riscos | `RiskSpotting` | O participante marca os perigos em uma imagem do ambiente de trabalho. | Apenas configurável. |
| Quebra-cabeça | `Puzzle` | Montar uma imagem ou cartaz de segurança. | Apenas configurável. |
| Jogo da memória | `Memory` | Associar EPIs ou sinalizações aos seus usos. | Apenas configurável. |
| Simulador de cenários | `Scenario` | Escolher a melhor atitude diante de uma situação de risco. | Apenas configurável. |
| Ordenação | `Ordering` | Colocar os passos de um procedimento na ordem correta. | Apenas configurável. |

## O que existe hoje

- O curso tem a flag `gamificationEnabled` e o tipo de jogo `gameType`, gravados no banco e expostos em `PUT /api/platform/catalog/courses/{id}`.
- Na edição do curso há uma seleção do tipo de jogo, visível quando a gamificação está ativa.
- Duplicar um curso copia o tipo de jogo.

## Decisões a confirmar com o Rafael Palma

- A pontuação (pontos por acerto, nota mínima) é por curso ou global?
- O jogo é obrigatório para concluir o curso ou apenas bônus?
- Quais dos 5 tipos além do Quiz vêm primeiro?
