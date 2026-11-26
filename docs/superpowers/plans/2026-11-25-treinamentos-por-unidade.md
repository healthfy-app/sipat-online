# Treinamentos por unidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um treinamento vale para toda a empresa ou para unidades/setores marcados, chega sozinho a quem é do público, e a gestão da empresa se orienta por um seletor de unidade.

**Architecture:** O público fica em duas tabelas de ligação do treinamento. Uma regra pura (`TrainingAudience.Includes`) decide quem está dentro; `LearningDistributionService` passa a usá-la nos três pontos que hoje entregam a todos, e ganha dois reconciliadores (mudou a pessoa / mudou o público). No web, a lista de marcar do "Associar vídeos" vira um componente comum usado por três diálogos, e um contexto guarda a unidade escolhida no topo.

**Tech Stack:** .NET (minimal APIs, EF Core + Npgsql, xUnit com `[DockerFact]`), React + TypeScript + Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-25-treinamentos-por-unidade-design.md`

## Global Constraints

- Textos de interface em português; "Treinamento" é o termo genérico; nunca "trilha" nem "Formação".
- Estilo só com classes Tailwind no JSX (celular com variantes `max-[…]`); nenhum CSS novo.
- Empresa com menos de duas unidades ativas não vê nada novo além da linha "Para quem".
- Treinamentos existentes ficam "toda a empresa": a migração só cria tabelas vazias.
- Nenhuma linha no público = toda a empresa.
- A pessoa tem uma unidade e um setor (não muda).
- Migrações são escritas à mão, no estilo de `20261207100000_AddVideoThumbnails.cs` (sem `.Designer.cs`), e `PlatformDbContextModelSnapshot.cs` é atualizado junto.
- Há alterações não commitadas de outra frente em `LearningEndpoints.cs`, `UserManagementEndpoints.cs`, `LearningEntities.cs` e migrações antigas: não reverter, não incluir nos commits deste plano (use `git add` arquivo a arquivo; em arquivo compartilhado, `git add -p`).
- Antes de cada commit de C#: `dotnet format --verify-no-changes`. Subir sempre por PR.
- Mensagens de commit no estilo do repositório: `feat(api): a training is delivered to the units marked on it`.
- Comandos: `dotnet test tests/SipatOnline.IntegrationTests --filter <Classe>`; em `src/Web/SipatOnline.Web`: `npm run lint` e `npx vitest run <arquivo>`.

## Review Focus

1. **Entrega manual a alguém de fora do público** (`POST /learning/tracks/{id}/assignments`): mudar a unidade dessa pessoa depois não pode tirar o treinamento. → teste na Task 3.
2. **Vai e volta** (SP → Rio → SP sem ter começado): a pessoa tem o treinamento de SP de novo. → teste na Task 3.
3. **Andamento em só um dia** de um treinamento de vários dias: ao sair do público fica com todos os dias. → teste na Task 3.
4. **Unidade desativada que está no público de um treinamento**: continua valendo na entrega e aparece (marcada, com "desativada") no "Para quem". → testes nas Tasks 2 e 6.
5. **Unidade lembrada no seletor que foi desativada ou é de outra empresa**: o seletor volta para "Todas as unidades" em vez de mostrar tudo vazio. → teste na Task 8.

---

### Task 1: A regra do público

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/TrainingAudience.cs`
- Test: `tests/SipatOnline.Application.UnitTests/Learning/TrainingAudienceTests.cs`

**Interfaces:**
- Produces: `public sealed record TrainingAudience(IReadOnlySet<Guid> UnitIds, IReadOnlySet<Guid> SectorIds)` com `static TrainingAudience Everyone`, `bool IsEveryone` e `bool Includes(Guid? unitId, Guid? sectorId)`.

- [ ] **Step 1: Testes que falham** — `[Theory]` `Includes_follows_units_and_sectors` com os casos: público vazio inclui pessoa sem unidade e sem setor; só unidade SP inclui (SP, qualquer setor) e exclui (Rio, x) e (null, x); só setor Produção inclui (qualquer unidade, Produção) e exclui (x, null); SP + Produção inclui só (SP, Produção); SP e Rio marcadas incluem as duas.
- [ ] **Step 2:** `dotnet test tests/SipatOnline.Application.UnitTests --filter TrainingAudienceTests` → FAIL (tipo não existe).
- [ ] **Step 3: Implementar** — `Includes` = `(UnitIds.Count == 0 || (unitId is { } u && UnitIds.Contains(u))) && (SectorIds.Count == 0 || (sectorId is { } s && SectorIds.Contains(s)))`.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(learning): who a training is for, by the units and sectors marked on it`.

### Task 2: Guardar e ler o público do treinamento

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Sipats/SipatEventAudienceEntities.cs` (duas entidades + configurações)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261208100000_AddTrainingAudience.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/TrainingAudienceService.cs`
- Create: `src/Api/SipatOnline.Api/Endpoints/TrainingAudienceEndpoints.cs`
- Modify: `PlatformDbContext.cs` (dois `DbSet`), `Migrations/PlatformDbContextModelSnapshot.cs`, o registro de serviços e de endpoints (onde `CompanyRegistryService` e `MapCompanyRegistryEndpoints` estão registrados), `Learning/SipatPlanService.cs` (`SummariesAsync`)
- Test: `tests/SipatOnline.IntegrationTests/TrainingAudienceApiTests.cs` (molde: `CompanyRegistryApiTests.cs`)

**Interfaces:**
- Consumes: `TrainingAudience` (Task 1).
- Produces:
  - Tabelas `sipats.SipatEventUnits (SipatEventId, UnitId, TenantId)` e `sipats.SipatEventSectors (SipatEventId, SectorId, TenantId)`; chave primária composta pelas duas primeiras colunas; FK para `SipatEvents` com cascade e para `CompanyUnits`/`CompanySectors` com restrict; índice em `(TenantId, UnitId)` / `(TenantId, SectorId)`.
  - `db.SipatEventUnits`, `db.SipatEventSectors`.
  - `TrainingAudienceService`:
    - `Task<Result<AudienceView>> GetAsync(Guid sipatId, CancellationToken token)`
    - `Task<Result<AudienceSaved>> SaveAsync(Guid sipatId, IReadOnlyList<Guid>? unitIds, IReadOnlyList<Guid>? sectorIds, CancellationToken token)`, com `record AudienceSaved(AudienceView Saved, TrainingAudience Before)` (a Task 3 precisa do público anterior).
    - `Task<Result<AudienceCount>> CountAsync(IReadOnlyList<Guid>? unitIds, IReadOnlyList<Guid>? sectorIds, CancellationToken token)`
    - `Task<IReadOnlyDictionary<Guid, TrainingAudience>> OfAsync(Guid tenantId, IReadOnlyCollection<Guid> sipatIds, CancellationToken token)` (sem checar papel; treinamento sem linhas vem como `Everyone`)
  - `record AudienceView(IReadOnlyList<Guid> UnitIds, IReadOnlyList<Guid> SectorIds)`; `record AudienceCount(int Receiving, int WithoutUnit, int WithoutSector)`.
  - HTTP: `GET` e `PUT /api/admin/sipats/{sipatId:guid}/audience` (corpo `{ unitIds, sectorIds }`), `POST /api/admin/registry/audience-count` (mesmo corpo). Leitura com `ViewTenantLearning`; escrita com a mesma política do `PUT /api/admin/sipats/{id}/plan`.
  - `SipatPlanSummary` (C# e resposta de `/api/admin/sipat-plans`) ganha `UnitIds` e `SectorIds`.
- Regras: ao salvar, um id novo precisa ser da empresa **e ativo** (erro `audience.unit.invalid` / `audience.sector.invalid`, 400); um id que o treinamento já tinha é aceito mesmo desativado. `CountAsync` conta participantes ativos (o mesmo `Participants(tenant)` de `CompanyRegistryService`, filtrando `IsActive`): `Receiving` pelo `Includes`; `WithoutUnit` = sem unidade quando `unitIds` não é vazio, senão 0; idem setor. Auditoria `sipats.audience_changed` no mesmo `SaveChanges`.

- [ ] **Step 1: Testes que falham** (`[DockerFact]`):
  - `Audience_starts_as_everyone` — GET de um treinamento novo → listas vazias.
  - `Saving_units_and_sectors_reads_back` — PUT com SP e Produção → GET devolve os dois; `/api/admin/sipat-plans` traz `unitIds: [SP]`.
  - `A_unit_of_another_company_is_refused` → 400 `audience.unit.invalid`.
  - `An_inactive_unit_cannot_be_added_but_one_already_there_stays` — salva SP, desativa SP, PUT de novo com SP + Rio → 200; PUT num outro treinamento com SP → 400.
  - `Count_says_who_receives_and_who_is_left_out` — 3 pessoas em SP, 2 no Rio, 1 sem unidade; contar `[SP]` → `{ receiving: 3, withoutUnit: 1, withoutSector: 0 }`; contar vazio → `{ 6, 0, 0 }`.
- [ ] **Step 2:** `dotnet test tests/SipatOnline.IntegrationTests --filter TrainingAudienceApiTests` → FAIL (404).
- [ ] **Step 3: Entidades, migração, snapshot, `DbSet`s.**
- [ ] **Step 4: Serviço, endpoints, registros, `SummariesAsync`.**
- [ ] **Step 5:** mesmo comando → PASS; `dotnet test tests/SipatOnline.IntegrationTests --filter "SipatPlanApiTests|UnifyTrainingsMigrationTests"` → PASS.
- [ ] **Step 6: Commit** — `feat(api): a training keeps the units and sectors it is for`.

### Task 3: A entrega obedece ao público

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/LearningDistributionService.cs` (linhas 120-126, 244-312)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/ParticipantProfileService.cs` (`ChangeAsync`, `ChangePlacementAsync`)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/ParticipantImportService.cs` (depois do commit da carga, ~linha 113)
- Modify: `src/Api/SipatOnline.Api/Endpoints/TrainingAudienceEndpoints.cs` (o `PUT` chama `AudienceChangedAsync`)
- Test: `tests/SipatOnline.IntegrationTests/TrainingAudienceDeliveryTests.cs` (molde de publicar e ler dias: `SipatPlanApiTests.cs`; de pessoa: `ParticipantProfileApiTests.cs`)

**Interfaces:**
- Consumes: `TrainingAudienceService.OfAsync`, `TrainingAudience.Includes`.
- Produces, em `LearningDistributionService`:
  - `record PlacementBefore(Guid ParticipantId, Guid? UnitId, Guid? SectorId)`
  - `record AssignmentSync(int Added, int Removed, IReadOnlyList<string> ReceivedTrainings)` (títulos distintos dos treinamentos em que alguém ganhou dias)
  - `Task<AssignmentSync> PlacementChangedAsync(Guid tenantId, IReadOnlyCollection<PlacementBefore> people, CancellationToken token)`
  - `Task<AssignmentSync> AudienceChangedAsync(Guid tenantId, Guid sipatId, TrainingAudience before, CancellationToken token)`
  - As duas `EnsureAssignmentsAsync` e `CreateTrackFromCourseAsync` mantêm a assinatura; passam a entregar só a quem `Includes`.
  - `PlacementResult` vira `PlacementResult(int Changed, int Added, int Removed, IReadOnlyList<string> ReceivedTrainings)`.
- Algoritmo dos reconciliadores (para os treinamentos publicados e não encerrados, o mesmo critério de `LiveTrackIdsAsync`):
  1. Entrega: `EnsureAssignments` para as pessoas envolvidas (já filtrado pelo público).
  2. Retirada: para cada par (pessoa, treinamento) em que a pessoa **estava** no público antes e **não está** agora — `before.Includes(unidade/setor antigos)` no caso de pessoa, `before.Includes(atuais)` no caso de público — se não existe nenhuma linha de `LearningProgress` dessa pessoa em nenhum track do treinamento, **apaga** as linhas de `LearningAssignments` dela nesses tracks (apagar, não `RevokedAt`); se existe, não mexe em nada.
  3. Nunca toca em quem não estava no público antes (é a entrega manual).
- `ChangeAsync` e `ChangePlacementAsync` leem unidade e setor antigos antes de alterar e chamam `PlacementChangedAsync` depois do `SaveChanges`. A planilha chama para as pessoas atualizadas cujo `UnitId`/`SectorId` mudou (guardar o antes em `Updated`).

- [ ] **Step 1: Testes que falham** (cada um monta: unidades SP e Rio, setor Produção; treinamento "SIPAT SP" com público `[SP]`, publicado, com 2 dias):
  - `Publishing_delivers_only_to_the_units_marked` — Ana (SP) tem os 2 dias; Bia (Rio) e Caio (sem unidade) têm 0.
  - `A_training_for_everyone_still_reaches_everyone` — público vazio → os três recebem.
  - `Unit_and_sector_together_narrow_it` — público SP + Produção: só quem é SP **e** Produção.
  - `Someone_hired_into_the_unit_later_receives_it` — criar pessoa já em SP depois de publicar.
  - `Moving_into_the_unit_delivers_at_once` — `POST` de placement de Bia para SP → resposta `added: 2`, `receivedTrainings: ["SIPAT SP"]`; Bia lista os 2 dias.
  - `Moving_out_without_starting_takes_it_away` — Ana para o Rio → `removed: 2`; Ana lista 0 dias.
  - `Moving_out_after_starting_keeps_everything` — Ana registra progresso em 1 aula do dia 1, vai para o Rio → continua com os 2 dias.
  - `Coming_back_to_the_unit_gives_it_again` — Ana SP → Rio → SP sem começar → 2 dias.
  - `A_training_handed_to_someone_outside_is_never_taken` — entregar à mão o dia 1 a Bia (Rio); mudar Bia para Minas → Bia continua com o dia 1.
  - `Narrowing_a_published_training_removes_only_the_untouched` — "SIPAT geral" publicada para todos; Ana (SP) registrou progresso, Caio (sem unidade) não; PUT do público para `[Rio]` → Ana continua com os 2 dias, Caio fica com 0, Bia (Rio) continua com 2.
  - `Widening_a_published_training_delivers_to_the_new_ones` — "SIPAT SP": PUT do público para `[SP, Rio]` → Bia passa a ter os 2 dias.
  - `An_inactive_unit_in_the_audience_still_delivers` — desativar SP (`PUT /api/admin/registry/units/{id}` com `isActive: false`) e relançar o treinamento com um terceiro dia → Ana (SP) tem os 3 dias.
- [ ] **Step 2:** `dotnet test tests/SipatOnline.IntegrationTests --filter TrainingAudienceDeliveryTests` → FAIL.
- [ ] **Step 3: Filtro de público nos três pontos de entrega** (uma função privada `InAudienceAsync(tenantId, trackIds, participantIds)` que devolve os pares permitidos; os três pontos passam por ela).
- [ ] **Step 4: `PlacementChangedAsync`, `AudienceChangedAsync` e as chamadas** em perfil, lote, planilha e no `PUT` do público.
- [ ] **Step 5:** filtro acima → PASS; depois `dotnet test tests/SipatOnline.IntegrationTests --filter "LearningApiTests|SipatPlanApiTests|ParticipantProfileApiTests|ParticipantImportApiTests"` → PASS.
- [ ] **Step 6: Commit** — `feat(api): a training reaches the people of its units by itself, and follows them when they move`.

### Task 4: Tirar unidade e setor

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Identity/CompanyRegistryService.cs`, `src/Api/SipatOnline.Api/Endpoints/CompanyRegistryEndpoints.cs`
- Test: `tests/SipatOnline.IntegrationTests/CompanyRegistryApiTests.cs`

**Interfaces:**
- Produces: `Task<Result<RegistryRemoval>> RemoveAsync(RegistryKind kind, Guid id, CancellationToken token)`; `record RegistryRemoval(bool Deleted)`; `DELETE /api/admin/registry/{units|sectors}/{id:guid}` (`ManageTenantUsers`) → `{ deleted: true|false }`.
- Regra: sem pessoas (qualquer usuário com aquele `UnitId`/`SectorId`) **e** sem linha em `SipatEventUnits`/`SipatEventSectors` → apaga a linha (`deleted: true`); senão `IsActive = false` (`deleted: false`). Auditoria `identity.registry.unit_removed` / `sector_removed`.

- [ ] **Step 1: Testes** — `Removing_an_unused_unit_deletes_it` (some do GET); `Removing_a_unit_with_people_only_deactivates_it` (`deleted: false`, `isActive: false`, `peopleCount` mantido); `Removing_a_unit_marked_on_a_training_only_deactivates_it`; `Removing_one_of_another_company_is_not_found` (404).
- [ ] **Step 2:** `dotnet test tests/SipatOnline.IntegrationTests --filter CompanyRegistryApiTests` → FAIL nos novos.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** — `feat(api): a unit or sector nobody uses is deleted; one in use is only put away`.

### Task 5: A lista de marcar vira um componente comum

**Files:**
- Create: `src/Web/SipatOnline.Web/src/components/ui/choice-list.tsx`
- Create: `src/Web/SipatOnline.Web/src/components/ui/choice-list.test.tsx`
- Modify: `src/Web/SipatOnline.Web/src/videoLibrary/AssociateVideosDialog.tsx` (passa a usar o componente; comportamento e textos idênticos)

**Interfaces:**
- Produces:
  ```ts
  export type Mark = 'all' | 'some' | 'none';
  export interface Choice { id: string; title: string; hint?: string }
  export function ChoiceList(props: {
    choices: Choice[];
    marks: ReadonlyMap<string, Mark>;
    onToggle: (id: string) => void;
    /** 'multi': caixas; 'single': uma só marcada por vez (radio). */
    mode?: 'multi' | 'single';
    /** O que é cada item, para os textos: "assunto", "unidade", "setor", "empresa". */
    noun: string;
    someLabel?: string;            // padrão "(em parte dos vídeos)"
    onCreate?: (name: string) => Promise<void>;
    onRemove?: (id: string) => Promise<void>;
    removeNote?: (choice: Choice) => string;   // texto cinza da confirmação
    removeVerb?: string;           // padrão "Apagar"
    disabled?: boolean;
  }): JSX.Element
  ```
  O componente é dono da busca, do botão "Criar {noun} «X»", do Enter que cria quando não há resultado, e da confirmação em linha. `Choice` e `Mark` deixam de ser exportados de `AssociateVideosDialog` (atualizar os imports).

- [ ] **Step 1: Testes que falham** (`choice-list.test.tsx`): filtra pela busca sem diferenciar maiúsculas; mostra "Criar unidade «Minas»" só quando não há item com esse nome exato e `onCreate` existe; Enter cria quando a lista filtrada está vazia; em `mode="single"` os inputs são `radio`; o X abre a confirmação com o texto de `removeNote` e só chama `onRemove` no "Apagar"; `hint` aparece à direita do item.
- [ ] **Step 2:** `npx vitest run src/components/ui/choice-list.test.tsx` → FAIL.
- [ ] **Step 3: Extrair** `MarkBox`, `ConfirmDelete`, a busca e o "criar" de `AssociateVideosDialog.tsx` para `choice-list.tsx`, e reescrever o diálogo de vídeos em cima dele.
- [ ] **Step 4:** `npx vitest run src/components/ui/choice-list.test.tsx src/videoLibrary` → PASS (os testes existentes de `VideoLibraryPage.test.tsx` passam sem alteração); `npm run lint` → sem erros.
- [ ] **Step 5: Commit** — `refactor(web): the list you mark, search and add to is one piece, shared by the dialogs`.

### Task 6: "Para quem" no treinamento

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts`
- Create: `src/Web/SipatOnline.Web/src/trainings/AudienceDialog.tsx`, `src/Web/SipatOnline.Web/src/trainings/audienceLabel.ts`, `src/Web/SipatOnline.Web/src/trainings/AudienceDialog.test.tsx`
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.tsx` (linha "Para quem"), `src/Web/SipatOnline.Web/src/sipatBuilder/SipatsPage.tsx` (etiqueta no cartão; `duplicate` abre o diálogo)

**Interfaces:**
- Consumes: `ChoiceList`; endpoints das Tasks 2 e 4.
- Produces em `api.ts`:
  - `interface TrainingAudience { unitIds: string[]; sectorIds: string[] }`
  - `getTrainingAudience(sipatId): Promise<TrainingAudience>`; `saveTrainingAudience(sipatId, audience): Promise<TrainingAudience>`; `countAudience(audience): Promise<{ receiving: number; withoutUnit: number; withoutSector: number }>`; `removeRegistryItem(kind: RegistryKind, id: string): Promise<{ deleted: boolean }>`
  - `SipatPlanSummary` ganha `unitIds?: string[]; sectorIds?: string[]`.
- `audienceLabel(audience, registry): string` → `"Toda a empresa"` quando vazio; senão nomes das unidades e depois dos setores unidos por `" · "`; com mais de 3 nomes, os 2 primeiros e `"+N"`.
- `AudienceDialog({ sipatId, title, registry, onClose, onSaved })` — título "Para quem"; abas **Unidades** e **Setores** (o mesmo `tablist` do diálogo de vídeos); `ChoiceList` `mode="multi"` com `hint` = `pluralize(peopleCount, 'pessoa', 'pessoas')`; itens inativos só aparecem se já estão marcados, com `hint` "desativada"; criar chama `addRegistryItems` e já marca; texto por aba: "Marque as unidades que fazem este treinamento. Sem nenhuma marcada, vale para toda a empresa." (idem "os setores"); rodapé com a contagem de `countAudience` (refeita a cada mudança, com 250 ms de espera): "214 pessoas vão receber" e, se > 0, " · 12 sem unidade não vão receber" / "sem setor"; Salvar desligado sem mudança.
- No construtor: linha `Para quem` + valor de `audienceLabel` + botão "Mudar" (some para quem só consulta). No cartão: `Badge` com o `audienceLabel` quando não é toda a empresa. `duplicate`: depois de criar a cópia, navega para `${basePath}/${copy.id}?para-quem=1`, e o construtor abre o diálogo quando vê esse parâmetro.

- [ ] **Step 1: Testes que falham** (`AudienceDialog.test.tsx`, com `api` simulada como em `RegistryPage.test.tsx`): abre com o público atual marcado; marcar SP e salvar chama `saveTrainingAudience('t1', { unitIds: ['sp'], sectorIds: [] })`; mostra "3 pessoas vão receber · 1 sem unidade não vão receber"; unidade inativa marcada aparece com "desativada" e a inativa não marcada não aparece; criar "Minas" chama `addRegistryItems('units', ['Minas'])` e deixa marcada. E em `audienceLabel`: vazio → "Toda a empresa"; SP + Produção → "São Paulo · Produção"; quatro nomes → "São Paulo · Rio de Janeiro +2".
- [ ] **Step 2:** `npx vitest run src/trainings/AudienceDialog.test.tsx` → FAIL.
- [ ] **Step 3: `api.ts`, `audienceLabel`, `AudienceDialog`.**
- [ ] **Step 4: Linha no construtor, etiqueta no cartão, `duplicate`.** Acrescentar a `SipatsPage.test.tsx` o caso "o cartão de um treinamento de SP mostra a etiqueta São Paulo".
- [ ] **Step 5:** `npx vitest run src/trainings src/sipatBuilder` → PASS; `npm run lint`.
- [ ] **Step 6: Ver na tela** — `.\docker-local.ps1 up -Build`, abrir um treinamento, marcar uma unidade, conferir a contagem e a etiqueta no cartão (largura de celular também).
- [ ] **Step 7: Commit** — `feat(web): a training says who it is for, marked like the videos' subjects`.

### Task 7: "Unidade e setor" na lista de colaboradores

**Files:**
- Modify (reescrever): `src/Web/SipatOnline.Web/src/collaborators/PlacementDialog.tsx`
- Modify: `src/Web/SipatOnline.Web/src/collaborators/CollaboratorsPage.tsx` (linhas 73, 151-161, 235-236, 293-294), `src/Web/SipatOnline.Web/src/api.ts` (`changePlacement`)
- Test: `src/Web/SipatOnline.Web/src/collaborators/CollaboratorsPage.test.tsx`, novo `PlacementDialog.test.tsx`

**Interfaces:**
- Consumes: `ChoiceList` (`mode="single"`), `addRegistryItems`, `removeRegistryItem`, `changePlacement`.
- Produces:
  - `changePlacement(...)` devolve `{ changed: number; added: number; removed: number; receivedTrainings: string[] }`.
  - `PlacementDialog({ people, profiles, registry, onClose, onSaved, onRegistryChanged })` onde `people: { id: string }[]`; `onSaved(message: string)`.
- Comportamento: título "Unidade e setor"; descrição `Vale para N colaboradores escolhidos. Só muda o que você marcar.`; abas Unidades / Setores. Cada aba: primeira opção fixa "Sem unidade" / "Sem setor" (id `'none'`), depois os itens ativos com `hint` de pessoas. Estado inicial: `all` no item que todos os escolhidos têm; `some` com `someLabel="(em parte das pessoas)"` nos que só parte tem. Uma aba em que nada foi clicado não gera chamada. Criar: `addRegistryItems` e já escolhe. Tirar: `removeRegistryItem`, com `removeVerb="Tirar"` e `removeNote` = "Ninguém está nela." quando `peopleCount === 0`, senão "{N pessoas} continuam nela; ela só deixa de ser oferecida." (setor: "nele"/"ele").
- Mensagem de sucesso montada pela página: `"3 colaboradores passaram para São Paulo"` (ou `"ficaram sem unidade"`), mais `" e receberam SIPAT 2026 · São Paulo"` quando `receivedTrainings` não é vazio (títulos unidos por ", "), mais `" · N dias de treinamentos não iniciados saíram"` quando `removed > 0`. Mudou unidade e setor: duas frases.
- Na página: um só botão "Unidade e setor" na barra dos selecionados, visível mesmo sem nenhuma unidade cadastrada (é ali que se cria).

- [ ] **Step 1: Testes que falham** (`PlacementDialog.test.tsx`): 2 pessoas em SP e 1 no Rio → SP e Rio aparecem com "(em parte das pessoas)"; todas em SP → SP marcada; escolher Rio e salvar chama `changePlacement(ids, 'unit', 'rio')` e **não** chama para `'sector'`; "Sem unidade" envia `null`; criar "Minas" chama `addRegistryItems('units', ['Minas'])` e a deixa escolhida; os inputs são `radio`. Em `CollaboratorsPage.test.tsx`: trocar os casos de "Mudar unidade"/"Mudar setor" pelo botão único e pela mensagem "1 colaborador passou para São Paulo e recebeu SIPAT SP".
- [ ] **Step 2:** `npx vitest run src/collaborators` → FAIL.
- [ ] **Step 3: Reescrever o diálogo e ligar na página.**
- [ ] **Step 4:** `npx vitest run src/collaborators` → PASS; `npm run lint`.
- [ ] **Step 5: Ver na tela** — selecionar pessoas, criar uma unidade pelo diálogo, mover, conferir a mensagem e a coluna Unidade.
- [ ] **Step 6: Commit** — `feat(web): people are put in a unit and a sector from their list, and the units are made right there`.

### Task 8: Seletor de unidade no topo

**Files:**
- Create: `src/Web/SipatOnline.Web/src/trainings/unitScope.tsx` (contexto + `UnitSelect`), `src/Web/SipatOnline.Web/src/trainings/unitScope.test.tsx`
- Modify: `src/Web/SipatOnline.Web/src/App.tsx` (provedor em volta das rotas da empresa; `UnitSelect` logo abaixo do rótulo "GESTÃO DA EMPRESA", ~linha 616), `sipatBuilder/SipatsPage.tsx`, `collaborators/CollaboratorsPage.tsx`, `TenantLearningDashboardPage.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function UnitScopeProvider(props: { tenantKey: string; children: ReactNode }): JSX.Element
  /** unitId null = todas as unidades. units = só as ativas. */
  export function useUnitScope(): { unitId: string | null; unit: RegistryItem | null; units: RegistryItem[]; setUnitId: (id: string | null) => void }
  export function UnitSelect(): JSX.Element | null   // null com menos de 2 unidades ativas
  export function inUnit(profiles: ReadonlyMap<string, { unitId: string | null }>, unitId: string | null): (personId: string) => boolean
  export function trainingInUnit(summary: { unitIds?: string[] } | undefined, unitId: string | null): boolean  // sem unidades marcadas = toda a empresa = sempre true
  ```
- **Pedido do usuário (2026-11-25, durante a construção):** o seletor fica **no topo da área da empresa**, não na barra lateral; é global, igual para o admin da empresa e para o operador dentro da empresa; visual elegante "tipo iPhone" (controle segmentado com a pílula deslizando); trocar refiltra todas as telas na hora. Até 4 unidades: segmentos "Todas · SP · Rio · Minas"; com mais, uma pílula única que abre a lista (`dropdown-menu`). Isto substitui o `NativeSelect` descrito abaixo.
- **Pedido do usuário (2026-11-25): criar segue o filtro.** Com unidade escolhida no topo: "Adicionar colaborador" já vem com ela no campo unidade; na planilha, linha sem unidade entra nela, linha com outra unidade escrita fica com a da planilha e a prévia avisa quantas são "de outra unidade"; treinamento novo nasce com ela no "Para quem". Com "Todas", nada é preenchido sozinho.
- **Mudança de modelo (usuário, 2026-11-25): o setor é de dentro da unidade** ("RH de Minas", "TI de São Paulo"). O público deixa de ser dois conjuntos cruzados e vira uma lista de alvos `(unidade?, setor?)`: unidade sem setor = toda a unidade; unidade + setor = aquele setor daquela unidade; setor sem unidade = o setor em todas as unidades; nenhum alvo = toda a empresa. A pessoa recebe se cair em qualquer alvo. A lista de setores continua única por empresa. Tabela `sipats.SipatEventTargets`; API `{ targets: [{ unitId, sectorId }] }`; o "Para quem" é uma lista de unidades com os setores de cada uma embaixo. Isto substitui `SipatEventUnits`/`SipatEventSectors` e `unitIds`/`sectorIds` nas Tasks 1, 2, 3, 6 e 8.
- Guarda em `localStorage` na chave `sipat:unit:{tenantKey}`, com try/catch. O provedor carrega `getCompanyRegistry()` uma vez (o operador dentro de uma empresa usa as mesmas rotas `/admin`, então vê o mesmo seletor); se a unidade guardada não está entre as ativas, vale `null` e a chave é apagada. `UnitSelect` é um `NativeSelect` com "Todas as unidades" e as unidades; `aria-label="Unidade"`.
- Uso:
  - **Treinamentos:** lista só os que passam em `trainingInUnit`. Criar treinamento com unidade escolhida: logo após `createSipatEvent`, `saveTrainingAudience(id, { unitIds: [unitId], sectorIds: [] })`.
  - **Colaboradores:** o estado `unitFilter` sai; o filtro de unidade passa a ser `useUnitScope()`. O select de unidade da página só aparece quando `UnitSelect` não aparece (menos de 2 unidades); "Sem unidade" continua acessível pelo aviso "N pessoas sem unidade" (estado local `onlyWithoutUnit`). O CSV segue a lista visível por unidade.
  - **Visão geral:** carregar também `listParticipantProfiles()`; `participants` e `participation` são filtrados por `inUnit` antes de qualquer cálculo; o Excel recebe os dados já filtrados e o título ganha " · {unidade}".
  - Com unidade escolhida, o cabeçalho das três páginas mostra o nome dela no `eyebrow`: `Gestão da empresa · São Paulo`.

- [ ] **Step 1: Testes que falham** (`unitScope.test.tsx`): `UnitSelect` não aparece com 1 unidade ativa; aparece com 2; escolher grava `sipat:unit:acme`; remontar lê a escolha; **unidade guardada que não existe mais volta para "Todas as unidades" e apaga a chave**; `trainingInUnit({ unitIds: [] }, 'sp')` é `true`, `({ unitIds: ['rio'] }, 'sp')` é `false`, `(qualquer, null)` é `true`; `inUnit` com `null` aceita todos.
- [ ] **Step 2:** `npx vitest run src/trainings/unitScope.test.tsx` → FAIL.
- [ ] **Step 3: Contexto, `UnitSelect`, provedor e posição em `App.tsx`** (barra lateral no desktop e o mesmo bloco no menu do celular, que já reusa `sidebarNav`).
- [ ] **Step 4: Aplicar nas três páginas**; ajustar `CollaboratorsPage.test.tsx`, `SipatsPage.test.tsx` e `TenantLearningDashboardPage.test.tsx` envolvendo com o provedor e acrescentando um caso por página ("com São Paulo escolhida, só aparece …").
- [ ] **Step 5:** `npx vitest run` → PASS; `npm run lint`.
- [ ] **Step 6: Ver na tela** — duas unidades, trocar no seletor e conferir as três páginas; com uma unidade só, nada aparece.
- [ ] **Step 7: Commit** — `feat(web): the company is read one unit at a time, chosen once at the top`.

### Task 9: Quadro "Por unidade" e colunas no Excel

**Files:**
- Create: `src/Web/SipatOnline.Web/src/dashboard/byUnit.ts`, `src/Web/SipatOnline.Web/src/dashboard/byUnit.test.ts`
- Modify: `src/Web/SipatOnline.Web/src/TenantLearningDashboardPage.tsx`, `src/Web/SipatOnline.Web/src/dashboard/companyExcelReport.ts`, `src/Web/SipatOnline.Web/src/participantReports.ts` (CSV)

**Interfaces:**
- Consumes: `useUnitScope`, `ParticipantProgressSummary` (`participantProgress.ts`).
- Produces: `byUnit(summaries, profiles, units): UnitRow[]` com `interface UnitRow { unitId: string | null; name: string; people: number; completed: number; inProgress: number; notStarted: number; completedPercent: number }` — uma linha por unidade ativa com pessoas, em ordem alfabética, e por último "Sem unidade" (`unitId: null`) se houver; conta só pessoas ativas; `completedPercent` arredondado, 0 quando `people` é 0.
- Tela: painel "Por unidade" na Visão geral, só com "Todas as unidades" e 2+ unidades; colunas Unidade, Pessoas, Concluíram, Em andamento, Não iniciaram, % concluído (barra como a da lista de colaboradores); clicar na linha de uma unidade chama `setUnitId`. Excel: aba "Colaboradores" e CSV ganham as colunas **Unidade** e **Setor** depois do login; o "Resumo" ganha a tabela por unidade quando há 2+.

- [ ] **Step 1: Testes que falham** (`byUnit.test.ts`): 3 em SP (2 concluíram, 1 não iniciou) e 1 sem unidade em andamento → `[{ name: 'São Paulo', people: 3, completed: 2, inProgress: 0, notStarted: 1, completedPercent: 67 }, { unitId: null, name: 'Sem unidade', people: 1, inProgress: 1, … }]`; pessoa inativa não conta; unidade sem ninguém não aparece. Em `companyExcelReport.test.ts`: o cabeçalho da aba Colaboradores contém "Unidade" e "Setor".
- [ ] **Step 2:** `npx vitest run src/dashboard` → FAIL.
- [ ] **Step 3: `byUnit`, painel, Excel e CSV.**
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run lint`.
- [ ] **Step 5: Commit** — `feat(web): the overview and the spreadsheet show how each unit is doing`.

---

## Depois da última task

- `dotnet format --verify-no-changes`, `dotnet test`, `npm run lint`, `npx vitest run`.
- Abrir o PR (nunca push direto para a VM).
- O link próprio e o aviso de "não disponível para você" já existem e não mudam (spec, seção 5).
