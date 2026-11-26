# Conteúdos: a mesma tela na operação e na empresa

Data: 2026-11-26 · Branch nova a partir de `dev` · Substitui `docs/superpowers/plans/2026-11-26-treinamento-e-playlist.md` (que renomeava o menu para "Treinamentos")

## Por quê

O treinamento já é um objeto só no banco (`PlatformCourses`, com `TenantId` nulo quando é da operação). As telas ainda não: a operação tem "Conteúdo", com um card que abre o editor de vídeos; a empresa tem "Treinamentos", com um card que abre a tela de dias. O dono do app (Rafael Palma) clica no card da operação esperando cair na mesma configuração da empresa, e não consegue excluir, encerrar nem duplicar um treinamento de empresa a partir dali. A lista também fica poluída com os encerrados.

Pedido do usuário (Rafael Ezequiel), em 2026-11-26: "deixa os dois exatamente iguais, com uma especificidade: ao criar desde o ops é um template, não está instanciado em uma empresa".

## Objetivos

1. **Mesma lista, mesmos cliques** na operação e na empresa: clicar no card abre a tela de dias; o lápis abre o editor de vídeos.
2. **As mesmas ações em qualquer treinamento, em qualquer status:** abrir, editar, duplicar, publicar, encerrar, reativar, copiar link, excluir. A operação faz isso nos treinamentos de todas as empresas.
3. **Os encerrados e concluídos não poluem a lista.**
4. **Treinamento criado pela operação é um template**, sem empresa, e abre na mesma tela de dias.
5. **O menu se chama "Conteúdos" nos dois lados**, com as abas Treinamentos e Jogos e perguntas. A operação vê os de todos; a empresa vê os dela.
6. **A empresa tem os seus próprios jogos**, privados dela.

## Fora

- Vídeos: continuam em "Biblioteca de vídeos" (operação) e "Vídeos da empresa" *(decisão minha)*.
- Aba Planos: só na operação.
- Categorias, área do participante, regras dos planos (Bronze só visualiza; jogos são do Diamante): não mudam.
- Juntar a tela de dias e o editor de vídeos numa tela só.

## O que não pode acontecer

- **Ninguém apaga um treinamento concluído** *(dito pelo usuário)*, nem a operação. Vale o mesmo para qualquer treinamento que algum participante já começou: progresso e certificado nunca somem por um clique *(leitura minha da resposta; a pergunta era sobre treinamentos que os participantes já fizeram)*.
- Uma empresa ver treinamento ou jogo de outra.
- Mexer na SIPAT da Damare que começa em 1º/12/2026.

## Abordagens

- **A. Um componente de lista e um de card, usados nas duas rotas.** ← escolhida *(decisão minha; o usuário entregou o "como")*. `SipatsPage` e `CoursesPanel`/`CourseCard` viram um só. A operação passa a lista de todos; a empresa, a dela. Garante que os dois lados nunca mais divergem.
- B. Manter as duas telas e igualar à mão (botões e filtros copiados). Mais rápido hoje, mas é exatamente como elas ficaram diferentes.
- C. Mandar a operação sempre para dentro da empresa para agir. Não atende: o Palma quer agir a partir da lista geral.

## O design

### 1. O card e os cliques

Um card só, o da empresa de hoje: capa, fase por cima, nome, período, "5 dias · 10 vídeos · 51 min". Na operação ele mostra também de quem é (o nome da empresa, ou "Template").

| Clique | Vai para |
|---|---|
| No card ou em "Abrir" | Tela de dias |
| Lápis | Editor de vídeos |
| Link | Copia o link (só publicado) |
| Duplicar | Cópia em rascunho, do mesmo dono |
| Menu "⋯" | Publicar, Encerrar, Reativar, Excluir, conforme a fase |

Na operação, o card de um treinamento de empresa abre a tela de dias daquela empresa (`/platform/companies/:id/treinamentos/:sipatId`), a mesma que o administrador dela vê.

"Ativar" e "inativar" do pedido do Palma são **Reativar** e **Encerrar** *(decisão minha: não crio um status novo)*. Encerrar tira dos participantes e da lista; Reativar devolve como rascunho para publicar de novo, como já é hoje.

O card encerrado deixa de ser um card morto com um botão só: tem as mesmas ações dos outros. Editar um encerrado é permitido e ele continua encerrado *(decisão minha, por "editar independentemente do status")*.

### 2. Excluir

| Situação | Excluir |
|---|---|
| Rascunho, Criado | sim |
| Publicado ou Em andamento, ninguém começou | sim, avisando que sai da área dos participantes |
| Qualquer um que algum participante já começou | não: só Encerrar |
| Concluído | não, para ninguém |
| Encerrado, ninguém começou | sim |
| Template | sim (as empresas que já copiaram ficam com a cópia) |

A regra é conferida no servidor e é a mesma para a operação e para a empresa. Hoje o servidor recusa qualquer treinamento já publicado; passa a recusar só o que tem progresso ou já terminou. O botão aparece sempre; quando não pode, a mensagem diz por quê e oferece Encerrar.

### 3. Filtros

- **Empresa:** a lista abre **sempre** em "Em andamento" *(dito pelo usuário)*. Não lembra a última escolha. Sem nenhum em andamento, a tela diz isso e oferece "Ver todos".
- **Operação:** abre em "Ativos", que esconde Encerrado e Concluído *(pedido do Palma: ocultos até mandar mostrar)*. As outras opções: Todos e cada fase. Continua o filtro por dono: Todos, Templates, cada empresa.
- **Unidade e setor** *(dito pelo usuário)*: a lista da empresa ganha um filtro "Para quem", com a mesma árvore do diálogo "Para quem" do treinamento (unidades, e os setores dentro de cada uma, com caixas de marcar e a busca). Marcar uma unidade ou um setor mostra os treinamentos destinados a ele e os de toda a empresa. Reaproveita o componente da árvore do diálogo; não é uma segunda árvore. Vale na tela da empresa e na operação dentro de uma empresa. Na lista geral da operação não aparece, porque unidades e setores são de cada empresa *(decisão minha)*. O seletor "Unidade" do topo do menu continua valendo junto.
- O filtro de fase é o mesmo componente nos dois lados; muda só o valor inicial.

### 4. Template

- Criado em Conteúdos da operação. Não tem empresa, datas, público nem link, e não se publica para participantes.
- Abre na mesma tela de dias, com "Dia 1, Dia 2…" no lugar das datas. As datas entram quando uma empresa cria o treinamento dela a partir do template.
- O banco já suporta: o dia é um título (`PlatformCourseLessons`) e a data é opcional. Falta a tela de dias ler e gravar um treinamento sem `SipatEvent`.

### 5. Menu "Conteúdos"

- Operação: o item "Conteúdo" vira "Conteúdos"; o título da página também. Abas: Treinamentos, Jogos e perguntas, Planos.
- Empresa: o item "Treinamentos" vira "Conteúdos". Abas: Treinamentos, Jogos e perguntas. A segunda aba só aparece no plano que tem jogos (Diamante), como já é com "Vídeos da empresa" *(decisão minha)*.
- A operação dentro de uma empresa vê a tela da empresa, com as mesmas abas.
- As rotas atuais continuam funcionando (`/admin/treinamentos`, `/platform/courses`), para não quebrar links salvos e o link do participante.

### 6. Jogos da empresa

- `GameModules` ganha `TenantId` (nulo = da operação). Migração: todos os que existem ficam da operação.
- A empresa cria, edita e exclui os jogos dela. Os da operação aparecem para ela usar, sem editar; para mudar, duplica e a cópia é dela.
- A operação vê todos, com o nome da empresa no card e filtro por dono, e edita qualquer um.
- O servidor confere o dono em toda leitura e gravação; um jogo de uma empresa não entra em treinamento de outra.

## Ordem de entrega

1. Lista única: card, cliques, ações, regra de excluir, filtros. É o que o Palma pediu e pode subir sozinha.
2. Template na tela de dias.
3. Menu "Conteúdos" e abas na empresa.
4. Jogos da empresa.

## Deixado para quem for construir

- De onde a lista da operação tira período, dias e fase dos treinamentos de empresa (hoje vem de `sipat-weeks`): ampliar esse endpoint ou criar um.
- Como a tela de dias trata o treinamento sem `SipatEvent`: um modo do `SipatBuilderPage` ou endpoints de dias por `courseId`.
- Como excluir um treinamento publicado que ninguém começou: as trilhas entregues (`LearningTracks`) saem junto, na mesma transação.
- Nomes de endpoints e rotas novas.

## Como saber que deu certo

- O Palma clica num card em Conteúdos e cai na tela de dias; o lápis leva ao editor. Na empresa, os mesmos cliques.
- Da lista da operação ele encerra, reativa, duplica e exclui um treinamento de empresa sem entrar na empresa.
- Excluir um concluído, ou um que alguém começou, é recusado pela API para qualquer usuário.
- A tela da empresa abre em "Em andamento" toda vez. A da operação abre sem os encerrados e concluídos.
- Na empresa, marcar um setor na árvore do filtro mostra só os treinamentos daquele setor e os de toda a empresa.
- Um template abre na tela de dias sem datas e não aparece para nenhuma empresa como treinamento dela.
- Uma empresa Diamante cria um jogo; outra empresa não o vê; a operação vê os dois.
