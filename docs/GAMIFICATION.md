# Gamificação nos cursos da SIPAT

A gamificação é opcional e escolhida por curso, no cadastro ou na edição do curso (perfil Operacional). Ela vem depois dos vídeos. Este documento registra a pesquisa de mercado e o que já existe no produto.

## Pesquisa de mercado

Plataformas de treinamento em SST, como a Worklinic, oferecem dezenas de jogos e simuladores. Os formatos mais comuns são quiz, percepção de risco em imagens e simuladores de situação. Esse tipo de jogo funciona bem em semanas de prevenção porque é curto, repetível e dá feedback imediato. Os seis tipos abaixo cobrem esses formatos sem exigir produção de conteúdo pesada.

## Os 6 tipos de jogo

| Tipo | Valor na API | Como funciona | Estado atual |
| --- | --- | --- | --- |
| Quiz | `Quiz` | Perguntas de múltipla escolha com feedback imediato, sem pontuação. | Autoria, prévia e participante. |
| Caça aos riscos | `RiskSpotting` | Identificar áreas de risco em uma imagem, com teclado ou apontador. | Autoria, prévia e participante. |
| Quebra-cabeça | `Puzzle` | Reconstruir uma imagem trocando duas peças por vez, sem exigir arrastar. | Autoria, prévia e participante. |
| Jogo da memória | `Memory` | Associar equipamentos às suas funções; os textos se complementam, não precisam ser iguais. | Autoria, prévia e participante. |
| Cenários | `Scenario` | Responder situações com alternativas e feedback, em sequência linear. | Autoria, prévia e participante. |
| Ordenação | `Ordering` | Colocar etapas na ordem correta com controles subir/descer. | Autoria, prévia e participante. |

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

## Participante e publicação

- No detalhe da empresa, **Cursos da empresa** associa um curso publicado a uma SIPAT publicada e aos participantes ativos. A operação repetida retorna a mesma associação.
- A distribuição congela conteúdo e atividades em um snapshot da revisão; editar o catálogo depois não altera o conteúdo já atribuído. A atualização de uma associação existente para outra versão não é automática.
- `GET /api/learning/tracks/{id}/activities` só retorna atividades de cursos atribuídos no tenant do participante.
- Atividades são abertas antes, entre ou depois dos vídeos conforme `afterVideoCount`. Checkpoints pausam na minutagem configurada; a retomada acontece depois da gravação do resultado ou da opção de pular.
- `PUT /api/learning/tracks/{id}/activities/{activityId}/outcome` registra `completed` ou `skipped`, de forma idempotente. Um acerto já registrado não é rebaixado para pulado.
- Esses resultados são autodeclarados para acompanhamento, não notas de prova nem evidência de reprodução. Não concedem progresso de vídeo ou elegibilidade ao certificado.
- O jogo da memória bloqueia cliques duplicados e a terceira carta durante a comparação. Pares encontrados continuam visíveis, com indicação de acerto; pares incorretos voltam a ficar ocultos.
- Falhas de carregamento ou gravação são visíveis e têm recuperação. Jogos não substituem o player e não bloqueiam a conclusão.

## Limites atuais

- Cenários são perguntas lineares, não simulações com árvore de decisões.
- Não há pontuação, ranking, prêmio ou avaliação formal.
- A evidência de vídeo da demo é apenas demonstrativa. O provedor de produção continua pendente; consulte [a arquitetura de vídeo](architecture/video-progress.md).