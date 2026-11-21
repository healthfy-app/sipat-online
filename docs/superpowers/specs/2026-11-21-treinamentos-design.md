# Treinamentos: a SIPAT vira um tipo de treinamento

Data: 2026-11-21 · Projeto 1 de 5 (ver "Os próximos projetos" no fim)

## Por quê

O SIPAT Online é uma plataforma de treinamentos genérica. A SIPAT é um dos tipos de treinamento, o mais comum. Os outros são, por exemplo, segurança dos alimentos, meio ambiente, food defense, contra incêndio e integração de funcionário novo. Hoje a interface chama o conceito geral de "SIPAT" e só deixa publicar um por vez. Uma empresa pode ter, ao mesmo tempo, a "SIPAT 2026" e um "Treinamento contra incêndios".

## Objetivos

1. O cliente vê **"Treinamento"** onde hoje vê "SIPAT" como conceito geral. "Formação" também sai: o termo certo é Treinamento.
2. **Vários treinamentos podem ficar publicados e em andamento ao mesmo tempo** na mesma empresa.
3. O acompanhamento **não mistura treinamentos**: painel, Participantes e relatório em Excel filtram por treinamento.
4. O participante com dois treinamentos em andamento vê os dois e escolhe qual fazer.

## Fora deste projeto

- Renomear o código e o banco (`SipatEvent`, `SipatPlan`, tabelas, `/api/.../sipats`). Fica para depois de dezembro, se valer a pena.
- Campo "tipo" de treinamento. O nome já diz o que ele é, e nada muda de comportamento conforme o tipo.
- Treinamento sem data de fim. **Foi para o projeto 4 (integração)**, porque exige migração no banco. *Decisão minha: antes eu tinha dito que entraria aqui.*
- Mandar um treinamento só para parte das pessoas. Cada treinamento publicado continua indo para todos os participantes ativos. O público por unidade ou setor é o projeto 3.

## O que não pode acontecer

- Nenhuma migração de banco e nenhuma mudança de contrato da API que quebre o que existe. A SIPAT do cliente de 600 pessoas começa em 1º/12/2026.
- Links antigos (`/sipats`, `/admin/sipats`...) não podem quebrar: eles redirecionam.
- "SIPAT" continua aparecendo quando é o **nome** de um treinamento ("SIPAT 2026") e no nome do produto "SIPAT Online".

## Abordagens consideradas

- **A. Trocar o que o cliente vê e manter os nomes internos.** ← **Escolhida.** O cliente vê tudo novo, sem migração e sem risco perto do dia 1º/12.
- B. Fazer o A e também renomear código e banco. Descartada agora: mexe em quase tudo, com risco, e o cliente não ganha nada com isso.
- C. Criar um campo "tipo" (SIPAT, Incêndio...). Descartada: nada do sistema depende do tipo.

## O design

### 1. Vocabulário
- Termo genérico: **Treinamento** (masculino). As fases mudam de gênero: Rascunho, **Criado**, **Publicado**, Em andamento, **Concluído**, **Encerrado** ([sipatPhase.ts](../../../src/Web/SipatOnline.Web/src/sipatBuilder/sipatPhase.ts)).
- Menu da empresa: "SIPATs" → **"Treinamentos"** ([CompanyNav.tsx](../../../src/Web/SipatOnline.Web/src/companies/CompanyNav.tsx)), para o operador e para o administrador.
- Tela da lista: título "Treinamentos", botão "Novo treinamento". A frase "Só uma fica publicada por vez" sai.
- Textos específicos usam o **nome do treinamento**, não a palavra genérica: "Você concluiu *Treinamento contra incêndios*". Textos genéricos usam "treinamento".
- Isso vale para a interface web (cerca de 45 arquivos), as mensagens de erro do back (`sipat.*` em `SipatPlanService`, `SipatEventApplicationService`), o certificado, os e-mails, se houver, e o manual (`docs/manual/manual.html`).
- Os códigos de erro (`sipat.already_published` etc.) ficam como estão. Só o texto muda.
- **"Dia" e "Módulo"** *(decisão minha: você não respondeu e escolhi a opção que recomendei)*. Quando um treinamento tem pelo menos uma parte com data, cada parte é um "Dia". Quando nenhuma parte tem data, cada parte é um "Módulo". Sem configuração: o construtor e a tela do participante decidem pelos dados.

### 2. Rotas
- `/…/sipats` → `/…/treinamentos`, nos dois painéis. As rotas antigas redirecionam para as novas, mantendo o id.
- A API continua em `/api/.../sipats`.

### 3. Vários ao mesmo tempo
- Remover a checagem `sipat.already_published` em [SipatPlanService.cs:154-160](../../../src/Infrastructure/SipatOnline.Infrastructure/Learning/SipatPlanService.cs). Publicar sempre funciona, desde que o treinamento tenha dias e não esteja cancelado.
- Remover do construtor o aviso de qual treinamento "sai do ar" ([SipatBuilderPage.tsx](../../../src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.tsx) e o teste "names the SIPAT that leaves the air").
- A entrega ([LearningDistributionService.EnsureAssignmentsAsync](../../../src/Infrastructure/SipatOnline.Infrastructure/Learning/LearningDistributionService.cs)) já trata vários treinamentos publicados. Só é preciso conferir com teste.

### 4. Participante
- Os chips da [tela inicial](../../../src/Web/SipatOnline.Web/src/learning/LearningHomePage.tsx) já existem. Muda a regra de qual treinamento abre primeiro: entre os que estão **em andamento** e têm dias, abre o **que começou primeiro**, porque o mais antigo tende a acabar antes. Se nenhum está em andamento, abre o próximo a começar. Se também não há próximo, abre o mais recente. A escolha que o participante fez na sessão continua valendo.
- Os chips mostram o nome e a fase, como hoje.
- Os certificados já são por treinamento. Só os textos mudam.

### 5. Acompanhamento sem misturar
- O painel da empresa ([TenantLearningDashboardPage.tsx](../../../src/Web/SipatOnline.Web/src/TenantLearningDashboardPage.tsx)), a tela de Participantes ([CollaboratorsPage.tsx](../../../src/Web/SipatOnline.Web/src/collaborators/CollaboratorsPage.tsx)) e o Excel ([companyExcelReport.ts](../../../src/Web/SipatOnline.Web/src/dashboard/companyExcelReport.ts)) ganham um **seletor de treinamento** no topo.
- O padrão do seletor é o treinamento que a tela inicial do participante abriria (a mesma regra). Com um treinamento só, o seletor não aparece.
- Os status (Concluiu, Em andamento, Não iniciou, Sem dias) passam a ser calculados **só sobre os dias do treinamento escolhido**.
- As trilhas da API já trazem `sipatEventId`, então o filtro pode ser feito no front. Se algum dado vier agregado pelo back sem esse campo, o back ganha um parâmetro opcional `sipatEventId`, sem quebrar quem chama sem ele.

### 6. Dados de demonstração
- A demo passa a ter, numa mesma empresa, uma SIPAT em andamento e um segundo treinamento em andamento (ex.: "Treinamento contra incêndios", 1 dia), para mostrar o caso novo.

## Testes
- Back: publicar um segundo treinamento com outro já publicado dá certo, e os participantes recebem os dois.
- Front: menu e títulos dizem "Treinamentos"; a rota antiga redireciona; com dois em andamento, o participante abre no que começou primeiro; o seletor de treinamento muda os números de Participantes; "Módulo" aparece quando não há data.
- Atualizar os testes existentes que procuram "SIPATs" ou "Formações".

## O que fica com quem construir
- A ordem dos commits e como dividir a troca de textos.
- O texto exato de cada mensagem, seguindo as regras acima.
- Onde fica o componente do seletor de treinamento.

## Os próximos projetos (cada um com a sua conversa)
2. **Cadastro:** nome e senha obrigatórios; matrícula, e-mail, telefone, unidade e setor opcionais, com a empresa podendo torná-los obrigatórios; listas padrão de unidades e setores fornecidas pelo RH; carga por planilha que padroniza nomes e matrículas e recusa unidade ou setor fora da lista.
3. **Público e acompanhamento por unidade e setor.**
4. **Integração:** treinamento sem data de fim, entregue automaticamente a quem é contratado.
5. **Cobrança** mensal ou anual.
