# Gamificação nos cursos da SIPAT

A gamificação é opcional e escolhida por curso, no cadastro ou na edição do curso (perfil Operacional). Ela vem depois dos vídeos. Este documento registra a pesquisa de mercado e o que já existe no produto.

## Pesquisa de mercado

Plataformas de treinamento em SST, como a Worklinic, oferecem dezenas de jogos e simuladores. Os formatos mais comuns são quiz, percepção de risco em imagens e simuladores de situação. Esse tipo de jogo funciona bem em semanas de prevenção porque é curto, repetível e dá feedback imediato. Os seis tipos abaixo cobrem esses formatos sem exigir produção de conteúdo pesada.

## Os 6 tipos de jogo

| Tipo | Valor na API | Como funciona | Estado atual |
| --- | --- | --- | --- |
| Quiz | `Quiz` | Perguntas de múltipla escolha com feedback imediato, sem pontuação. | Configurável e jogável na pré-visualização. |
| Caça aos riscos | `RiskSpotting` | O participante marca os perigos em uma imagem do ambiente de trabalho. | Apenas configurável. |
| Quebra-cabeça | `Puzzle` | Montar uma imagem ou cartaz de segurança. | Apenas configurável. |
| Jogo da memória | `Memory` | Associar EPIs ou sinalizações aos seus usos. | Apenas configurável. |
| Simulador de cenários | `Scenario` | Escolher a melhor atitude diante de uma situação de risco. | Apenas configurável. |
| Ordenação | `Ordering` | Colocar os passos de um procedimento na ordem correta. | Apenas configurável. |

## Regras

- Sem pontos e sem confirmação obrigatória. O jogo existe, mas nunca bloqueia o progresso nem a conclusão do curso; o participante pode pular.
- O vídeo é enviado cru. O Operacional escolhe a minutagem em que o vídeo deve parar para exibir uma pergunta ou jogo.
- Módulos de jogo e de perguntas também podem entrar na trilha do curso, entre os vídeos.

## O que existe hoje

- O curso tem a flag `gamificationEnabled` e o tipo de jogo `gameType` (`PUT /api/platform/catalog/courses/{id}`).
- Biblioteca de módulos: `GET/POST /api/platform/catalog/modules`, `PUT/DELETE /api/platform/catalog/modules/{id}`. Quiz tem de 1 a 50 perguntas com 2 a 6 alternativas.
- Trilha do curso: `PUT /api/platform/catalog/courses/{id}/modules` (`afterVideoCount`: 0 = antes do primeiro vídeo).
- Paradas no vídeo: `PUT /api/platform/catalog/videos/{id}/checkpoints` (`timeMilliseconds` dentro da duração).
- No painel do Operacional, a aba "Jogos e perguntas" cadastra módulos; no detalhe do curso é possível posicionar módulos na trilha, definir paradas e pré-visualizar o vídeo parando na minutagem.
- Duplicar um curso copia o tipo de jogo e os módulos da trilha.

## Limitações

- Os cursos da plataforma ainda não chegam ao participante; a execução (Quiz) acontece na pré-visualização do Operacional.
- Apenas o Quiz é jogável; os demais tipos só têm nome por enquanto.