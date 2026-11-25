# Um treinamento só: a fusão do Conteúdo com os treinamentos da empresa

Data: 2026-11-25 · Branch nova a partir de `dev` · Sem restrição de prazo (dito pelo usuário: "muda tudo o necessário para que seja perfeito")

## Por quê

O P.O. explicou que o treinamento funciona como num Hotmart: quem é dono do treinamento vê os vídeos dele, edita, coloca capa, publica e manda o link para quem vai fazer. Hoje isso está partido em dois:

- **Conteúdo** (operação): treinamento com capa, categoria, títulos, vídeos, perguntas e atividades, num editor completo.
- **Treinamentos da empresa**: uma lista e uma grade de dias com datas. O editor completo só abre para a operação, por uma cópia escondida.

O usuário pediu a fusão dos dois. A empresa passa a fazer o seu próprio treinamento com a tela de arrastar e com o editor de vídeos, dentro do plano dela.

## Objetivos

1. Existe **um treinamento só**, com um dono: a operação (um modelo) ou uma empresa.
2. O administrador da empresa cria, monta e edita o seu treinamento com as **mesmas telas** da operação: a grade de dias e o editor completo, aberto por um lápis.
3. A lista de treinamentos da empresa é igual à do Conteúdo: cards com capa, busca e filtros.
4. A tela de dias mostra **todos os vídeos**, só com filtro por assunto, e tem o **upload** no topo.
5. O Conteúdo da operação mantém os modelos e mostra também **todos os treinamentos de todas as empresas**, com filtro por empresa. A operação edita qualquer um.
6. Um treinamento publicado tem um **link para compartilhar** com quem vai fazer.
7. As regras dos planos do site valem em todas as telas e são conferidas no servidor, num lugar só.

## Fora deste projeto

- O que o participante vê em `/learning`, além de abrir direto o treinamento do link.
- Auto-cadastro pelo link, limite de vagas, link que expira.
- Preço, cobrança e troca de plano pela própria empresa.
- Quais assuntos cada plano pode usar (`PlanSubjectExclusions`): continua como está.
- Renomear tabelas e classes de `Sipat*` e `PlatformCourse*` para "Treinamento". É cosmético e pode vir depois.

## O que não pode acontecer

- Perder ou mudar um treinamento que já existe. A SIPAT do cliente de 600 pessoas começa em 1º/12/2026 e já está montada: a migração leva cada treinamento para o modelo novo com os mesmos dias, datas, vídeos e jogos.
- Mudar o que já foi entregue aos participantes. O que eles assistem é uma fotografia tirada na publicação (`LearningTracks`), com progresso e certificado presos a ela. Este projeto não toca nisso.
- Uma empresa ver ou editar treinamento, vídeo ou capa de outra.
- O plano ser conferido só na tela.

## Abordagens consideradas

- **A. Um conteúdo só, com dono.** ← **Escolhida** *(decisão minha; o usuário entregou o "como")*. O treinamento da empresa passa a ter o seu conteúdo num lugar só, o mesmo dos modelos. Os dias são os títulos do treinamento, e cada título ganha uma data. Somem a cópia escondida e a sincronia entre as duas versões.
- B. Manter as duas versões e criar a cópia junto com o treinamento. Era a minha escolha quando o prazo pesava. Descartada: mantém dois lugares para a mesma coisa e a sincronia por posição entre eles, que é frágil (um vídeo em dois dias fica só no primeiro, um título novo vira dia "no dia seguinte ao último").
- C. Juntar também o cabeçalho (`SipatEvents`) na tabela de treinamentos. Descartada: progresso, relatórios, certificados e entregas usam o id do `SipatEvent`. Trocar isso não muda nada para quem usa e mexe em tudo o que já foi entregue.

## Como é hoje (para quem for construir)

- `PlatformCourses` + `PlatformCourseLessons` (títulos) + `PlatformCourseVideoLinks` + `PlatformCourseModuleLinks` + capa: o treinamento do Conteúdo. Não tem dono.
- `SipatEvents`: o treinamento da empresa (nome, período, fase). `SipatPlans.DaysJson`: os dias, com data, vídeos e jogos.
- `SipatWeekCourses`: liga um treinamento de empresa a uma cópia em `PlatformCourses`, criada quando a operação clica em "Editar a semana". `SipatPlanService` copia de um lado para o outro a cada leitura e gravação.
- `LearningDistributionService.ApplyDaysAsync`: ao publicar, cada dia vira uma trilha entregue aos participantes.
- Editor e upload: `/api/platform/catalog/...`, só para a operação. A empresa tem `/api/admin/sipats`, `/api/admin/sipats/{id}/plan` e o catálogo filtrado `/api/admin/sipat-catalog`.

## Regras dos planos

Fonte: sipatonline.com.br/plans.html, lida em 2026-11-25.

| | Bronze | Prata | Ouro | Diamante |
|---|---|---|---|---|
| Escolher entre os módulos prontos | sim | sim | sim | sim |
| Relatórios diários e certificado padrão | sim | sim | sim | sim |
| Personalizar a grade de vídeos | não | sim | sim | sim |
| Logo e cores, certificado personalizado | não | não | sim | sim |
| Vídeo interno da empresa | não | não | não | sim |
| Quiz ao final de cada módulo | não | não | não | sim |

### O que já é aplicado hoje

Em `SipatPlanService.ApplyPlanAsync`, ao salvar e ao publicar os dias:

- Bronze: cada dia tem de ser um módulo pronto inteiro.
- Sem Diamante: os jogos e quizzes dos dias são retirados.
- Assuntos excluídos do plano, assuntos de outra empresa e vídeos privados de outra empresa são recusados.
- O catálogo que o administrador recebe já vem filtrado pelas mesmas regras.

### O que falta ou muda

- O editor completo não tem regra de plano, porque só a operação entra nele.
- **Bronze são SIPATs prontas** *(dito pelo usuário)*. A operação monta as SIPATs prontas no Conteúdo, inteiras. A empresa Bronze escolhe uma e recebe o treinamento montado. Isso troca a regra de hoje, de um módulo pronto por dia.
- Uma SIPAT pronta é reconhecida hoje pelo texto da descrição ("Opção 1", "Opção 2", "Opção 3"). Passa a ser uma marca no modelo: "Disponível como SIPAT pronta".
- Logo, cores e certificado personalizado (Ouro) não foram conferidos. O trabalho inclui conferir e corrigir.

- **No Bronze a empresa só visualiza** *(dito pelo usuário em 2026-11-25: "o ops cria um curso e associa a empresa em modo vista")*. A empresa Bronze não cria, não edita e não publica treinamento: a operação, dentro da empresa, cria a partir de uma SIPAT pronta, acerta datas e nomes dos dias e publica. Isso vale mais que as linhas do Bronze na tabela abaixo: para a empresa Bronze, só "ver" e "copiar o link" continuam. *Decisão minha, em aberto com o usuário:* a operação também fica presa a uma SIPAT pronta inteira no Bronze.

### O que cada plano faz

*Decisão minha, seguindo o site. O site não fala do editor.*

| Ação | Bronze | Prata e Ouro | Diamante |
|---|---|---|---|
| Criar treinamento a partir de uma SIPAT pronta | sim | sim | sim |
| Criar treinamento do zero ou de outro modelo | não | sim | sim |
| Ver o treinamento e assistir aos vídeos no editor | sim | sim | sim |
| Trocar a capa, o nome e a data dos dias | sim | sim | sim |
| Adicionar, tirar e reordenar dias e vídeos; renomear vídeo no treinamento | não | sim | sim |
| Upload de vídeo próprio | não | não | sim |
| Perguntas no vídeo, atividades e jogos | não | não | sim |
| Copiar o link do treinamento publicado | sim | sim | sim |

A operação segue o plano da empresa quando edita o treinamento dela *(decisão minha)*. Se precisar de mais, muda o plano da empresa. Nos modelos a operação não tem limite.

## O design

### 1. Dados

- `PlatformCourses` ganha **`TenantId`** (nulo = modelo da operação) e **`IsReadySipat`** (a marca de SIPAT pronta, só em modelos).
- `PlatformCourseLessons` ganha **`Date`** (opcional) e **`Subject`** (o assunto do dia, opcional). Um título com data é um "Dia"; sem data nenhuma no treinamento, cada título é um "Módulo", como já é hoje.
- `SipatEvents` ganha **`CourseId`**, obrigatório e único: o conteúdo do treinamento. Continua guardando empresa, nome, período e fase, e continua sendo o id usado por entregas, progresso, relatórios e certificados.
- O período (`StartsAt`, `EndsAt`) segue as datas dos títulos, como hoje segue as datas dos dias.
- O nome do treinamento fica igual nos dois lados; quem grava um grava o outro, na mesma transação.
- Saem `SipatPlans` e `SipatWeekCourses`.
- **Migração:** para cada `SipatEvent`, usa a cópia que já existe ou cria o treinamento; marca o dono; escreve os dias de `DaysJson` como títulos com data, assunto, vídeos e jogos; preenche `CourseId`. Depois apaga as duas tabelas. Um treinamento sem dias fica com o conteúdo vazio. A migração roda numa transação e tem teste com os casos: com cópia, sem cópia, sem dias, com jogos, com vídeo repetido em dois dias.
- **Um vídeo aparece uma vez por treinamento.** Já é a regra do editor. Na migração, um vídeo repetido em dois dias fica no primeiro, e a migração lista esses casos no log para a operação conferir.
- As trilhas entregues (`LearningTracks` e o resto) não são tocadas pela migração.

### 2. Permissão num lugar só

Um serviço responde, para quem está pedindo e para um treinamento, o que pode ser feito: `ver`, `editarDados` (capa, nomes, datas), `editarGrade`, `enviarVideo`, `editarAtividades`, `publicar`, `excluir`.

- Operação num modelo: tudo.
- Operação ou administrador num treinamento de empresa: o que o plano dela permite (tabela acima). O administrador só nos da empresa dele.
- Toda gravação passa por esse serviço. A resposta de leitura do treinamento leva a lista, e a tela desliga o que não pode.
- `ApplyPlanAsync` vira parte dele: a conferência ao salvar e ao publicar é a mesma do editor.

### 3. API

- O editor usa um grupo só de endpoints, para a operação e para o administrador, com a permissão do item 2. Ler o treinamento, estrutura (títulos, ordem, datas), vídeos, capa, perguntas do vídeo, atividades, upload.
- `/api/admin/sipats/{id}/plan` (os dias) passa a ler e gravar os títulos do treinamento. O formato da resposta pode continuar o mesmo, para a tela de dias mudar pouco.
- Criar treinamento de empresa recebe a origem: uma SIPAT pronta, outro modelo, um treinamento anterior da empresa, ou do zero. O conteúdo é **copiado** para o treinamento novo; mexer nele nunca muda o modelo.
- A biblioteca oferecida à empresa continua sendo a lista filtrada pelo plano.
- O vídeo enviado por uma empresa fica privado dela (`CompanyVideos`).
- Sai `/api/platform/catalog/sipat-weeks` e `POST /api/admin/sipats/{id}/week`.

### 4. Lista de treinamentos (uma tela, dois lugares)

O mesmo componente serve o Conteúdo da operação e a tela da empresa.

- Barra: busca por nome, filtro por fase ou status, filtro por categoria, contador.
- Card: capa, fase por cima, categoria, nome, período, "5 dias · 8 vídeos · 45 min". Ações: **Abrir** (grade de dias), **lápis** (editor), **Copiar link** (quando publicado), duplicar, excluir.
- Sem capa, o card mostra um fundo liso com o nome. Hoje todos mostram a mesma foto.
- **Na empresa** (`/admin/treinamentos` e `/platform/companies/:id/treinamentos`): os treinamentos dela, agrupados por ano. "Novo treinamento" abre a escolha de origem; o Bronze só vê as SIPATs prontas.
- **No Conteúdo** (`/platform/courses`): modelos e treinamentos de todas as empresas. Filtro novo: "Tudo", "Só modelos" e cada empresa. O card de empresa mostra o nome dela. Excluir treinamento de empresa pede confirmação com o nome da empresa e só é permitido se ninguém começou; depois disso, só cancelar.
- Um modelo tem a opção "Disponível como SIPAT pronta" nas suas configurações.

### 5. Tela de dias

- Continua como é: uma coluna por dia, com data, nome, vídeos arrastáveis e o tempo total.
- Sai o seletor "Treinamento:". A "Lista completa" mostra todos os vídeos que a empresa pode usar, com "Filtrar por assunto" e a busca.
- O botão de upload fica no topo da lista, visível, para quem pode enviar vídeo.
- O cartão "Editar a semana no editor de vídeos" vira um **lápis** ao lado do nome, "Editar treinamento".
- No Bronze a grade abre só para leitura da grade: dá para mudar datas e nomes dos dias, não os vídeos. A lista de vídeos de cima não aparece.
- A tela lê e grava o mesmo treinamento que o editor. Não há mais "salvar e voltar à semana" para sincronizar.

### 6. Editor

- É o editor do Conteúdo ([CourseEditor.tsx](../../../src/Web/SipatOnline.Web/src/courseEditor/CourseEditor.tsx)), o mesmo para todos.
- Rotas: `/platform/courses/:courseId/edit` (operação) e `/admin/treinamentos/:sipatId/editar` (administrador). Num treinamento de empresa o cabeçalho mostra a empresa e "Voltar ao treinamento".
- Cada título mostra a sua data, editável ali também.
- O que o plano não permite fica visível e desligado, com uma linha dizendo a partir de qual plano libera.

### 7. Link para compartilhar

*Escolhido pelo usuário: o link é só para quem já está cadastrado.*

- "Copiar link" aparece no card e na tela de um treinamento publicado.
- O link é o endereço da empresa com o treinamento, por exemplo `https://empresa.../learning?treinamento={id}`. Não leva senha nem código.
- Quem abre faz login com o usuário que o RH cadastrou e cai direto naquele treinamento. Quem já está logado vai direto.
- Link de treinamento cancelado, encerrado ou de outra empresa leva para a tela inicial do participante, com um aviso.

### 8. Publicar

- Publicar continua entregando cada dia como uma trilha, pela mesma `ApplyDaysAsync`, agora lendo os títulos do treinamento.
- As regras de reaplicar (um dia que ninguém começou é atualizado; um dia com progresso só recebe extras) não mudam.

### 9. Vídeos privados da empresa

**Como é hoje.** O upload vai direto do navegador para o R2, em partes, retomável, até 2 GB por arquivo. Depois o nosso servidor converte o vídeo (480p, 720p e 1080p). Um vídeo fica privado quando a operação o liga a uma ou mais empresas na Biblioteca (`CompanyVideos`). Não existe dono (`OwnerTenantId` existe e está sempre vazio), não existe limite de espaço, e só a operação envia e exclui.

**Dono e visibilidade.**
- O vídeo enviado por uma empresa tem **dono**: `OwnerTenantId` é a empresa. Só ela e a operação o veem. Ele nunca entra no catálogo público.
- "Compartilhado com" (`CompanyVideos`) continua sendo coisa da operação, para vídeos da operação. Um vídeo com dono não pode ser compartilhado com outra empresa.
- Enviar é do Diamante. A empresa também pode cadastrar um link do YouTube ou do Vimeo como vídeo próprio *(decisão minha)*: não ocupa espaço nem conversão.

**Onde a empresa gerencia.** Uma tela "Vídeos da empresa" no menu do administrador (só Diamante). **Tem de ser simples e muito elegante** *(pedido do usuário em 2026-11-25)*. Ela não copia a Biblioteca da operação, que é uma tabela densa.

- Uma coisa só no topo: a área de soltar arquivos, grande, com "Arraste seus vídeos aqui ou escolha do computador". Sem formulário antes do envio: o nome vem do arquivo e pode ser trocado depois.
- Embaixo, os vídeos em cards com a miniatura, o nome e a duração. Nada de colunas.
- O vídeo em envio aparece na hora como um card com a barra de progresso; depois "Preparando o vídeo…"; depois fica pronto. Se falhar, o card diz o que houve em uma linha e oferece "Tentar de novo".
- Clicar no card toca o vídeo. O nome se edita no próprio card. Um menu "⋯" guarda o resto: assunto, em quais treinamentos está, excluir.
- O espaço usado é uma linha fina e discreta no rodapé ("3,2 GB de 20 GB"), que só chama atenção perto do limite.
- Link do YouTube ou Vimeo: um link de texto pequeno ao lado da área de soltar, "ou cole um link", que abre um campo só.
- O termo de uso aparece uma vez, no primeiro envio, em uma frase com um botão.
- Vazio: só a área de soltar e uma frase. Sem ilustração nem tutorial.
- Segue a identidade aprovada do `/learning` e funciona no celular.
- O botão de upload da tela de dias e o do editor abrem o mesmo seletor de arquivo e usam a bandeja de envios que já existe; o vídeo cai nesta lista.

**Limites e custo.**
- Espaço por empresa: **20 GB, ajustável pela operação empresa por empresa** *(confirmado pelo usuário em 2026-11-25)*. Conta o arquivo original mais as versões convertidas. O ajuste fica na tela da empresa, ao lado do plano. No R2 isso custa cerca de US$ 0,30 por mês por empresa cheia, mais as versões convertidas; a saída é grátis.
- O custo real é a conversão, que usa o processador do nosso servidor. Regras: uma conversão por empresa de cada vez, e os envios da operação passam na frente.
- Arquivo: até 2 GB, como hoje. Tipos aceitos: os mesmos de hoje.
- Ao chegar no limite, o envio é recusado antes de começar, com o espaço usado e o limite na mensagem.

**Excluir.**
- A empresa exclui um vídeo dela que não está em nenhum treinamento.
- Em treinamento em rascunho: precisa tirar de lá antes, como já é para a operação.
- Em treinamento publicado ou entregue: não exclui. O que foi entregue ao participante aponta para o arquivo; apagar quebraria a aula e o histórico. Libera depois que o treinamento encerra e a empresa confirma.
- Excluir apaga o registro e os arquivos no R2.

**Mudança de plano e fim de contrato.**
- Empresa que sai do Diamante: os vídeos dela continuam guardados e os treinamentos já publicados continuam tocando. Ela não envia vídeo novo nem usa os antigos em treinamento novo. Já é a regra aplicada ao publicar.
- Empresa removida: os vídeos dela são apagados do R2 junto. Hoje nada faz isso.

**Privacidade e responsabilidade.**
- Reprodução: o participante já recebe uma autorização de reprodução por aula. A pré-visualização do administrador passa a conferir que o vídeo é público ou da empresa dele. Os links para o R2 são assinados e curtos.
- No primeiro envio a empresa aceita um termo curto: o conteúdo é dela, ela tem o direito de uso e a autorização de imagem das pessoas que aparecem.
- A operação vê todos os vídeos de empresas na Biblioteca, com filtro por dono, e pode remover um vídeo. Todo envio e exclusão fica no registro de auditoria.

### 10. O que deixa de ser global

Abrir o editor para a empresa expõe duas coisas que hoje são globais, porque só a operação mexia nelas:

- **Perguntas do vídeo** (`PlatformVideoCheckpoints`) pertencem ao vídeo, não ao treinamento. Uma empresa Diamante que editasse as perguntas de um vídeo público mudaria esse vídeo para todas as empresas. As perguntas passam a pertencer ao **vídeo dentro do treinamento**. Criar um treinamento a partir de um modelo copia as perguntas do modelo.
- **Jogos e atividades** (`GameModules`) são uma biblioteca só, sem dono. Passam a ter dono: os da operação ficam disponíveis para todos usarem, sem editar; os que a empresa cria são só dela. Para mudar um jogo da operação, a empresa duplica.
- Duração e nome do vídeo na biblioteca: a empresa só altera nos vídeos dela. O nome dentro do treinamento já é separado (`TitleOverride`).

## Deixado para quem for construir

- Nomes dos endpoints e formato das respostas.
- Se `/api/platform/catalog/courses/...` e `/api/admin/...` viram um prefixo só ou dois prefixos com o mesmo código por baixo.
- Ordem de entrega. Sugestão: (1) dados e migração, com a tela de dias e o editor lendo do lugar novo, sem mudar o que o usuário vê; (2) serviço de permissão e editor aberto ao administrador; (3) lista única com capa, filtros e ações; (4) tela de dias: lista de vídeos, upload, lápis; (5) Bronze com SIPAT pronta; (6) Conteúdo com todas as empresas; (7) link; (8) conferência do Ouro.
- Os testes de integração que hoje cobrem a cópia da semana são reescritos para o modelo novo.

## Como saber que deu certo

- Depois da migração, a SIPAT 2026 da Damare tem os mesmos dias, datas, vídeos e jogos, e os participantes veem o mesmo de antes.
- Um administrador Bronze cria um treinamento a partir de uma SIPAT pronta, acerta as datas, troca a capa e publica. Não consegue mudar a grade nem pela API.
- Um administrador Prata cria do zero, arrasta vídeos para os dias, reordena no editor, e as duas telas mostram a mesma coisa sem salvar duas vezes.
- Um administrador Diamante envia um vídeo, usa num dia e coloca uma pergunta nele; outra empresa não vê esse vídeo.
- A operação vê no Conteúdo os modelos e os treinamentos de todas as empresas, filtra por empresa e edita qualquer um.
- Um participante deslogado abre o link copiado, faz login e cai no treinamento certo, mesmo com dois em andamento.
- Editar um treinamento criado a partir de um modelo não muda o modelo.
