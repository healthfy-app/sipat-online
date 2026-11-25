# Um treinamento só — Plano de trabalho

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O treinamento da empresa e o treinamento do Conteúdo viram um só, com dono; a empresa ganha o editor completo, os vídeos privados e o link, tudo dentro do plano.

**Architecture:** O conteúdo de todo treinamento mora em `PlatformCourses` (títulos = dias, com data). `SipatEvents` continua sendo o cabeçalho (empresa, período, fase) e aponta para o seu conteúdo por `CourseId`. `SipatPlans` e `SipatWeekCourses` saem. Um serviço único decide, por plano, o que cada um pode fazer.

**Tech Stack:** .NET 10, EF Core + PostgreSQL (migrações escritas à mão, snapshot editado à mão), React + Tailwind v4 + shadcn/ui, R2.

**Spec:** [2026-11-25-treinamento-da-empresa-com-editor-design.md](../specs/2026-11-25-treinamento-da-empresa-com-editor-design.md)

## Global Constraints

- Branch `feat/treinamento-unico` (saiu de `fix/youtube-vimeo-gravam-progresso` + `origin/dev`, porque o PR #20 ainda não entrou no dev e traz os cards da lista). Vai para o `dev` por PR.
- Um commit por etapa entregue. Antes de cada push: `dotnet build SipatOnline.slnx` e `dotnet format whitespace SipatOnline.slnx --verify-no-changes`; no front, `npm run build` e `npm run lint` em `src/Web/SipatOnline.Web`.
- Não tocar em `LearningTracks`, `LearningLessons`, `LearningProgress`, `LearningAssignments`, certificados.
- O id de um dia é o id do título (`PlatformCourseLessons.Id`). As trilhas entregues casam por `SourceCourseId == day.Id`, então a migração preserva os ids dos dias.
- Um vídeo aparece uma vez por treinamento.
- Interface: "Treinamento", nunca "Formação" nem "trilha". Estilo só com Tailwind.
- Toda regra de plano é conferida no servidor.
- Testes: só o da migração é novo (pedido pelo desenho). No resto, ajustar os testes existentes que quebrarem; o CI do GitHub valida.

## Review Focus

- Treinamento publicado com gente no meio do caminho: depois da migração, publicar de novo tem de achar as mesmas trilhas (mesmo id de dia), sem duplicar dias para o participante.
- `DaysJson` com dia sem vídeos, com `videoIds` nulo, ou com vídeo/jogo que já foi excluído: a migração não pode falhar; ignora o que não existe mais.
- O mesmo vídeo em dois dias: fica no primeiro; salvar pela tela de dias passa a recusar com mensagem clara em vez de sumir em silêncio.
- Cópia da semana cujo treinamento foi excluído do Conteúdo: o treinamento ganha um conteúdo novo a partir do `DaysJson`.
- Excluir no Conteúdo um treinamento que é de uma empresa: tem de ser recusado, nunca deixar o `SipatEvent` sem conteúdo.

---

## Etapa 1 — Dados: um conteúdo só (esta entrega)

### Task 1.1: Colunas novas, migração dos dados e fim das duas tabelas

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261204100000_UnifyTrainings.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/PlatformDbContextModelSnapshot.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlatformCourseEntity.cs`, `PlatformCourseEntityConfiguration.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Sipats/SipatEventEntity.cs`, `SipatEventEntityConfiguration.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/PlatformDbContext.cs` (saem `SipatPlans`, `SipatWeekCourses`)
- Test: `tests/SipatOnline.IntegrationTests/UnifyTrainingsMigrationTests.cs`

**Interfaces — Produces:**
- `PlatformCourseEntity.TenantId : Guid?` (nulo = modelo), `PlatformCourseEntity.IsReadySipat : bool`
- `PlatformCourseLessonEntity.Date : DateOnly?`, `PlatformCourseLessonEntity.Subject : string?` (máx. 120)
- `SipatEventEntity.CourseId : Guid` (único, FK `Restrict` para `PlatformCourses`)

- [ ] Teste: migra até `20261203100000_CountExternalVideosWithLength`, semeia por SQL quatro treinamentos (com cópia editada; sem cópia; sem dias; cópia órfã com vídeo repetido em dois dias, um jogo e um vídeo inexistente no JSON), migra até o fim e confere: todo `SipatEvent` tem `CourseId`; o treinamento tem `TenantId`; os títulos têm os ids, nomes, datas e assuntos dos dias; os vídeos estão na ordem, o repetido só no primeiro dia; o jogo está depois do último vídeo do seu dia; as duas tabelas não existem.
- [ ] Migração `UnifyTrainings` (colunas, SQL de dados, `NOT NULL`, índices, FK, `DROP TABLE`).
- [ ] Entidades, configurações, `DbContext` e snapshot.
- [ ] Rodar o teste da migração (precisa de Docker).

### Task 1.2: Os dias são os títulos do treinamento

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/SipatPlanService.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Sipats/EfSipatEventStore.cs` (cria o conteúdo junto com o treinamento; o nome acompanha)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/DevelopmentLearningSampleInitializer.cs`, `DevelopmentDemoPresentationInitializer.cs`
- Modify: `src/Api/SipatOnline.Api/Endpoints/PlatformCourseCatalogEndpoints.cs` (excluir treinamento de empresa → 409)
- Test: `tests/SipatOnline.IntegrationTests/SipatPlanApiTests.cs` (ajustar)

**Interfaces — Produces (assinaturas públicas de `SipatPlanService` não mudam):**
- `GetAsync(sipatId)` lê títulos, vídeos e atividades do treinamento. Dia = `ProgramDay(lesson.Id, lesson.Title, lesson.Date, lesson.Subject, videoIds, gameIds)`.
- `SaveAsync(sipatId, days)` grava os títulos casando por id (cria, atualiza, apaga), os vídeos na ordem e as atividades. Vídeo em dois dias → erro `learning.program.video_repeated_across_days`: "O vídeo "X" está em dois dias. Cada vídeo entra uma vez no treinamento."
- Atividade que já estava no dia mantém a distância do início do dia (limitada ao número de vídeos do dia); atividade nova vai para depois do último vídeo.
- `OpenWeekAsync(sipatId)` só devolve `CourseId`. `WeeksAsync` e `WeekCourseIdsAsync` leem de `SipatEvents.CourseId`. Os endpoints e a interface ficam como estão nesta etapa.
- `SummariesAsync` conta dias e vídeos pelos títulos.

- [ ] Reescrever leitura e gravação em `SipatPlanService`; apagar `SipatPlanEntity`, `SipatWeekCourseEntity` e as cópias de ida e volta.
- [ ] `EfSipatEventStore.AddAsync` cria o `PlatformCourseEntity` (rascunho, `TenantId`, mesmo nome) e preenche `CourseId`; `SaveAsync` leva o nome.
- [ ] Semeadores de desenvolvimento criam o conteúdo junto.
- [ ] `DELETE /api/platform/catalog/courses/{id}` recusa treinamento com `TenantId` (409, "Este treinamento é de uma empresa. Cancele-o na tela de treinamentos da empresa.").
- [ ] `dotnet build`, `dotnet format`, ajustar `SipatPlanApiTests` e o que mais citar a cópia.
- [ ] Commit: `refactor: a company's training keeps its days in its own training; the week copy and its two-way sync are gone`

---

## Etapas seguintes (cada uma ganha as suas tarefas detalhadas quando a anterior fechar)

2. **Permissão por plano num lugar só** — `TrainingAccessService.For(actor, course) → TrainingAccess(View, EditDetails, EditGrid, UploadVideo, EditActivities, Publish, Delete)`; `ApplyPlanAsync` passa a morar nele; Bronze = SIPAT pronta (`IsReadySipat`, sai o teste pelo texto "Opção N").
3. **Perguntas por treinamento e jogos com dono** — `PlatformVideoCheckpoints.CourseId`; `GameModules.TenantId`; copiar de modelo copia as perguntas.
4. **Editor aberto ao administrador** — endpoints do editor com a permissão da etapa 2; rota `/admin/treinamentos/:sipatId/editar`; data no título; controles desligados com o plano que libera.
5. **Lista única** — mesmo componente no Conteúdo e na empresa: busca, filtros, capa, lápis, copiar link, duplicar, excluir; "Novo treinamento" com origem (SIPAT pronta, modelo, anterior, zero).
6. **Tela de dias** — sai o seletor "Treinamento:", upload no topo, lápis no lugar do cartão "Editar a semana".
7. **Conteúdo com todas as empresas** — filtro por empresa, nome da empresa no card, marca "Disponível como SIPAT pronta".
8. **Vídeos privados** — dono (`OwnerTenantId`), cota de 20 GB ajustável, tela "Vídeos da empresa" simples, regras de exclusão, termo, limpeza ao remover empresa, fila de conversão por empresa.
9. **Link para compartilhar** — "Copiar link" e `/learning?treinamento={id}` com login no meio.
10. **Ouro** — conferir logo, cores e certificado personalizado.
