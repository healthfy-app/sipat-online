# Treinamentos — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A interface passa a dizer "Treinamento" (SIPAT vira só nome/tipo), vários treinamentos podem ficar publicados ao mesmo tempo, e o acompanhamento filtra por treinamento.

**Architecture:** Só a camada visível muda; `SipatEvent`, tabelas e `/api/.../sipats` ficam como estão. O back perde o bloqueio de publicação e passa a dizer, em cada linha de progresso, a que treinamento ela pertence (campo novo, aditivo). O front ganha duas funções puras compartilhadas (`pickDefaultTraining`, `partWord`) e um seletor de treinamento usado por painel, Participantes e Excel.

**Tech Stack:** .NET 10 (xUnit, Testcontainers Postgres em `[DockerFact]`), React + TypeScript + Vite, Vitest + Testing Library, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-11-21-treinamentos-design.md`

## Global Constraints

- **Nenhuma migração de banco.** Nenhuma mudança que quebre contrato da API: só campos novos opcionais.
- Termo genérico: **Treinamento** (masculino). Nunca "Formação", "trilha" nem "SIPATs" como conceito geral. "SIPAT" só como nome de um treinamento ("SIPAT 2026") e no produto "SIPAT Online" (sempre maiúsculo).
- Fases: Rascunho, **Criado**, **Publicado**, Em andamento, **Concluído**, **Encerrado**.
- Textos específicos citam o **nome** do treinamento; os genéricos dizem "treinamento".
- Partes de um treinamento: **"Dia"** se alguma parte tem data, **"Módulo"** se nenhuma tem.
- Os códigos de erro (`sipat.*`) não mudam, só as mensagens.
- Rotas: `/admin/sipats` → `/admin/treinamentos`; `/platform/companies/:companyId/sipats` → `/platform/companies/:companyId/treinamentos`. As antigas redirecionam, mantendo `:sipatId`.
- A SIPAT do cliente de 600 pessoas começa em 2026-12-01: nada pode mudar o comportamento de uma SIPAT já publicada.

## Review Focus

1. **Treinamento já publicado passa a conviver com outro.** Publicar o segundo não pode tirar nem duplicar os dias do primeiro para ninguém. Teste na Task 1.
2. **Participante com dois treinamentos e um deles sem dias montados.** Deve abrir no que tem dias. Teste na Task 2 (`pickDefaultTraining`).
3. **Empresa com um único treinamento.** O seletor não aparece, e os números do painel ficam iguais aos de hoje. Teste na Task 5.
4. **Link antigo salvo nos favoritos** (`/admin/sipats/<id>`). Abre o mesmo treinamento na rota nova. Teste na Task 6.
5. **Linha de progresso sem `sipatEventId`** (resposta antiga em cache, ou dia entregue avulso). Não some do painel quando o seletor está em "todos", e só entra no filtro do treinamento certo. Teste na Task 5.

---

### Task 1: Back — publicar vários ao mesmo tempo e dizer o treinamento de cada progresso

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/SipatPlanService.cs:140-168` (remover o bloco `sipat.already_published`, linhas 156-160; atualizar os comentários das linhas 41 e 140)
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/LearningParticipantProgress.cs` (novo último parâmetro)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/EfLearningStore.cs:328` (passar `track.SipatEventId`)
- Test: `tests/SipatOnline.IntegrationTests/SipatPlanApiTests.cs`, `tests/SipatOnline.IntegrationTests/LearningApiTests.cs`

**Interfaces:**
- Produces: `LearningParticipantProgress(..., DateTimeOffset? LastAccessedAt = null, Guid? SipatEventId = null)`; o JSON de `GET /api/admin/learning/participation` ganha `sipatEventId`.

- [ ] **Step 1: Mudar o teste de integração existente.** Em `Administrator_BuildsADraftWeek_LaunchesItOnePublishedAtATime_AndReusesAnotherSipat`, renomear para `Administrator_BuildsADraftWeek_LaunchesItBesideAnotherPublished_AndReusesAnotherSipat`. Trocar o trecho das linhas 65-71 (conflito e cancelamento) por:
```csharp
// the sample company already has a published SIPAT: another training goes live beside it
var sipats = await Get(admin, "/api/admin/sipats");
var other = Assert.Single(sipats.GetProperty("items").EnumerateArray(), item => item.GetProperty("status").GetString() == "Published");
var otherId = other.GetProperty("id").GetGuid();
int otherTracksBefore;
await using (var scope = factory.Services.CreateAsyncScope())
    otherTracksBefore = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().LearningTracks.CountAsync(t => t.SipatEventId == otherId);
```
Depois do `launched`:
```csharp
sipats = await Get(admin, "/api/admin/sipats");
Assert.Equal(2, sipats.GetProperty("items").EnumerateArray().Count(item => item.GetProperty("status").GetString() == "Published"));
await using (var scope = factory.Services.CreateAsyncScope())
    Assert.Equal(otherTracksBefore, await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().LearningTracks.CountAsync(t => t.SipatEventId == otherId));
```
- [ ] **Step 2: Teste de progresso.** Em `LearningApiTests.cs`, no teste que lê `/api/admin/learning/participation` (linha 46), afirmar que cada linha tem `sipatEventId` igual ao `SipatEventId` da trilha correspondente: `Assert.Equal(expectedSipatId, row.GetProperty("sipatEventId").GetGuid())`.
- [ ] **Step 3: Rodar e ver falhar.** `dotnet test tests/SipatOnline.IntegrationTests --filter "FullyQualifiedName~SipatPlanApiTests|FullyQualifiedName~LearningApiTests"` (precisa do Docker). Esperado: FAIL. A publicação devolve 409, e `sipatEventId` não existe.
- [ ] **Step 4: Implementar.** Remover o bloqueio em `LaunchAsync`. O `if (sipat.Status != Published)` continua só trocando o status e gravando a auditoria. Adicionar `Guid? SipatEventId = null` ao record e passar `track.SipatEventId` em `EfLearningStore`. As mensagens desse serviço passam a dizer "treinamento": "Este treinamento foi cancelado…", "Monte os dias do treinamento antes de publicar.", "O treinamento não foi encontrado.", "O treinamento escolhido ainda não tem dias montados.".
- [ ] **Step 5: Rodar e ver passar** (mesmo comando). Esperado: PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(api): let several trainings be published at once and tag progress with its training"`

### Task 2: Front — regras compartilhadas `pickDefaultTraining` e `partWord`

**Files:**
- Create: `src/Web/SipatOnline.Web/src/trainings/defaultTraining.ts`, `src/Web/SipatOnline.Web/src/trainings/partWord.ts`
- Test: `src/Web/SipatOnline.Web/src/trainings/defaultTraining.test.ts`, `src/Web/SipatOnline.Web/src/trainings/partWord.test.ts`

**Interfaces:**
- Produces:
  - `export interface TrainingTiming { id: string; startsAt: string; endsAt: string; status: 'Draft' | 'Published' | 'Cancelled'; hasDays: boolean }`
  - `export function pickDefaultTraining<T extends TrainingTiming>(items: readonly T[], now?: Date): T | undefined`
  - `export function partWord(dates: readonly (string | null | undefined)[]): 'Dia' | 'Módulo'`

- [ ] **Step 1: Testes.**
```ts
// defaultTraining.test.ts — now = 2026-11-21T12:00Z
const t = (id, startsAt, endsAt, extra = {}) => ({ id, startsAt, endsAt, status: 'Published', hasDays: true, ...extra });
it('opens the running training that started first', () =>
  expect(pickDefaultTraining([t('fogo', '2026-11-20', '2026-11-22'), t('sipat', '2026-11-09', '2026-12-01')], now)?.id).toBe('sipat'));
it('skips a running training without days', () =>
  expect(pickDefaultTraining([t('vazio', '2026-11-01', '2026-12-01', { hasDays: false }), t('fogo', '2026-11-20', '2026-11-22')], now)?.id).toBe('fogo'));
it('falls back to the next one to start', () =>
  expect(pickDefaultTraining([t('velho', '2025-11-01', '2025-11-05'), t('jan', '2027-01-10', '2027-01-12'), t('dez', '2026-12-01', '2026-12-05')], now)?.id).toBe('dez'));
it('falls back to the most recent', () =>
  expect(pickDefaultTraining([t('a', '2024-11-01', '2024-11-05'), t('b', '2025-11-01', '2025-11-05')], now)?.id).toBe('b'));
it('ignores drafts and cancelled when anything else exists', () =>
  expect(pickDefaultTraining([t('r', '2026-11-20', '2026-11-22', { status: 'Draft' }), t('b', '2025-11-01', '2025-11-05')], now)?.id).toBe('b'));
it('returns undefined for no trainings', () => expect(pickDefaultTraining([], now)).toBeUndefined());

// partWord.test.ts
expect(partWord(['2026-11-09', null])).toBe('Dia');
expect(partWord([null, undefined])).toBe('Módulo');
expect(partWord([])).toBe('Módulo');
```
- [ ] **Step 2:** `npx vitest run src/trainings` (na pasta `src/Web/SipatOnline.Web`). Esperado: FAIL, módulo não encontrado.
- [ ] **Step 3: Implementar as duas funções.** "Em andamento" significa `status === 'Published'`, com `startsAt <= now < endsAt`. "Próximo" significa publicado com `startsAt > now`; entre esses, o de menor `startsAt`. Quando nenhum dos dois existe, vale o de maior `startsAt` entre os não-rascunho e não-cancelados. Se só houver rascunhos ou cancelados, vale o de maior `startsAt` entre eles.
- [ ] **Step 4:** mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(web): shared rules for the default training and Dia/Módulo`

### Task 3: Construtor — sem aviso de "sai do ar", com Dia/Módulo

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.tsx:275,385-388` (remover `live` e a frase "Só uma formação fica publicada por vez…"), `sipatBuilder/BuilderGrid.tsx:94`, `sipatBuilder/model.ts:81`, `sipatBuilder/ImportDialog.tsx:44`, `SipatBuilderPage.tsx:363`
- Test: `src/Web/SipatOnline.Web/src/sipatBuilder/SipatBuilderPage.test.tsx`

**Interfaces:**
- Consumes: `partWord` (Task 2).

- [ ] **Step 1: Testes.** Trocar `names the SIPAT that leaves the air when another is published` por `publishes beside another published training without warning`. Com os mesmos dados, o diálogo `Publicar o treinamento?` **não** contém "deixa de aparecer" e contém "Ao publicar, cada dia é entregue aos participantes ativos da empresa." Adicionar `calls the parts Módulo when no day has a date`: com um plano cujos dias têm `date: null`, existe o textbox `Título do módulo 1`.
- [ ] **Step 2:** `npx vitest run src/sipatBuilder`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** A palavra vem de `partWord(days.map(d => d.date))`. Ela é aplicada ao rótulo do título (`Título do ${word.toLowerCase()} N`), ao título-padrão de uma parte nova (`${word} N`), à prévia da importação e ao aviso de removido. Quando o construtor diz "dia" para uma parte com data, continua dizendo "dia".
- [ ] **Step 4:** mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(web): builder publishes beside other trainings and names parts Dia or Módulo`

### Task 4: Participante — abre no treinamento certo e diz Dia/Módulo

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/learning/LearningHomePage.tsx:74-89`, `learning/WeekVideos.tsx:61-75`, `learning/LearningTrackPage.tsx:534-558`
- Test: `src/Web/SipatOnline.Web/src/LearningPage.test.tsx`

**Interfaces:**
- Consumes: `pickDefaultTraining`, `partWord` (Task 2).

- [ ] **Step 1: Testes.** `opens the running training that started first`: duas trilhas de treinamentos diferentes, ambas em andamento ("SIPAT 2026", que começou em 09/11, e "Treinamento contra incêndios", que começou em 20/11). A tela abre na SIPAT, e o chip de incêndio fica visível. `says Módulo for a training without dates`: uma trilha com `dayPosition: 1, dayDate: null` mostra "Módulo 1", e não "Dia 1".
- [ ] **Step 2:** `npx vitest run src/LearningPage.test.tsx`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** `currentSipat` passa a ser `sipats.find(id === chosenSipat) ?? pickDefaultTraining(sipats)`, com `hasDays` e o status vindo do que já é montado ali. A palavra da parte vem de `partWord(tracks.map(t => t.dayDate))`, calculada sobre as trilhas do treinamento atual e repassada ao `WeekVideos` e à página da trilha. A página da trilha calcula a palavra pelas trilhas do mesmo `sipatEventId`. "Dia N concluído!" e "Ir para o Dia N" usam a palavra.
- [ ] **Step 4:** mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(web): learner opens the right training and names parts Dia or Módulo`

### Task 5: Seletor de treinamento no painel, em Participantes e no Excel

**Files:**
- Create: `src/Web/SipatOnline.Web/src/trainings/TrainingSelect.tsx`, `src/Web/SipatOnline.Web/src/trainings/useTrainingFilter.ts`
- Modify: `src/Web/SipatOnline.Web/src/api.ts:498-512` (`sipatEventId?: string | null` em `LearningParticipantProgress`), `TenantLearningDashboardPage.tsx:58-75`, `collaborators/CollaboratorsPage.tsx:54-80`, `dashboard/companyExcelReport.ts` (`CompanyExcelReportInput` ganha `trainingTitle?: string`; ele entra no título da planilha de resumo e no nome do arquivo)
- Test: `src/Web/SipatOnline.Web/src/trainings/useTrainingFilter.test.ts`, `TenantLearningDashboardPage.test.tsx`, `collaborators/CollaboratorsPage.test.tsx` (criar se não existir)

**Interfaces:**
- Consumes: `pickDefaultTraining` (Task 2); `sipatEventId` na participação (Task 1); `listSipatEvents`, `listSipatPlans` (já existem em `api.ts`).
- Produces:
  - `export function useTrainingFilter(): { trainings: TrainingTiming & { title: string }[]; selectedId: string | null; setSelectedId(id: string | null): void; filter<T extends { sipatEventId?: string | null }>(rows: readonly T[]): T[] }`. `null` significa todos. O valor inicial é o id de `pickDefaultTraining` sobre os treinamentos não-rascunho; `hasDays` vem de `listSipatPlans`.
  - `export function TrainingSelect(props: { trainings: { id: string; title: string }[]; value: string | null; onChange(id: string | null): void })`. Renderiza `null` quando há menos de 2 treinamentos. O rótulo acessível é "Treinamento". A primeira opção é "Todos os treinamentos".

- [ ] **Step 1: Testes.**
  - `useTrainingFilter`: com o filtro num treinamento, `filter` mantém só as linhas dele. Com `null`, mantém todas, inclusive as que têm `sipatEventId` vazio.
  - Painel: com dois treinamentos e uma pessoa que concluiu os dias da SIPAT e não começou o de incêndio, escolher "SIPAT 2026" mostra a pessoa como "Concluiu", e escolher "Treinamento contra incêndios" mostra "Não iniciou".
  - Com um treinamento só, `queryByRole('combobox', { name: 'Treinamento' })` é `null`, e os números ficam iguais aos de antes.
  - Participantes: mesma afirmação de status com o filtro.
  - Excel: `buildCompanyExcelReport({ ..., trainingTitle: 'SIPAT 2026' })` tem "SIPAT 2026" no título da planilha de resumo.
- [ ] **Step 2:** `npx vitest run src/trainings src/TenantLearningDashboardPage.test.tsx src/collaborators src/dashboard`. Esperado: FAIL.
- [ ] **Step 3: Implementar.** As duas páginas chamam `useTrainingFilter` e aplicam `filter(participation)` **antes** de `summarizeParticipants` e `summarizeCompanyProgress`. O `TrainingSelect` fica no cabeçalho da página. A exportação passa as linhas filtradas e o `trainingTitle`. A descrição do painel vira "Acompanhe o progresso dos colaboradores em cada treinamento da sua empresa."
- [ ] **Step 4:** mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(web): pick the training in the dashboard, participants and Excel`

### Task 6: Rotas `/treinamentos` e menus

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/App.tsx:202-218,580-583,659,668`, `companies/CompanyNav.tsx:30-36`, `companies/CompanyHome.tsx:6`
- Create: `src/Web/SipatOnline.Web/src/trainings/LegacySipatRedirect.tsx`
- Test: `src/Web/SipatOnline.Web/src/companies/CompanyNav.test.tsx`, `src/Web/SipatOnline.Web/src/trainings/LegacySipatRedirect.test.tsx`

**Interfaces:**
- Produces: `export function LegacySipatRedirect({ to }: { to: (params: Readonly<Params>) => string })`. Ele faz `<Navigate replace>` para `to(useParams())`.

- [ ] **Step 1: Testes.** O `CompanyNav` tem o link "Treinamentos" ativo em `/platform/companies/c1/treinamentos/s1`. `MemoryRouter` em `/admin/sipats/s1` vai para `/admin/treinamentos/s1`, e em `/platform/companies/c1/sipats` vai para `/platform/companies/c1/treinamentos`.
- [ ] **Step 2:** `npx vitest run src/companies src/trainings`. Esperado: FAIL.
- [ ] **Step 3: Implementar.**
  - As rotas e os `basePath` passam para `/treinamentos`. As 4 rotas antigas usam `LegacySipatRedirect`.
  - Os menus mudam assim: o link do administrador "Formações" vira "Treinamentos", e "SIPATs" no `CompanyNav` vira "Treinamentos".
  - O menu do participante "Minha formação" vira "Meus treinamentos", com rótulo mobile "Treinamentos", e "Minhas formações" vira "Meus treinamentos".
- [ ] **Step 4:** mesmo comando. Esperado: PASS.
- [ ] **Step 5: Commit.** `feat(web): trainings live at /treinamentos; old links redirect`

### Task 7: Varredura de textos (front, back, certificado, manual)

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/sipatPhase.ts` (fases no masculino), `sipatBuilder/SipatsPage.tsx`, `sipatBuilder/SipatBuilderPage.tsx`, `sipatBuilder/BuilderSetup.tsx`, `CertificatesPage.tsx`, `TenantLearningDashboardPage.tsx`, `collaborators/*.tsx`, `learning/*.tsx`, `dashboard/companyExcelReport.ts` e os demais arquivos listados pela busca do Step 3; `src/Modules/Sipats/Application/.../SipatEventApplicationService.cs` e os validadores; `src/Infrastructure/.../Learning/CertificatePdfRenderer.cs`; `docs/manual/manual.html`
- Test: os testes existentes que procuram os textos antigos

- [ ] **Step 1: Atualizar os testes que afirmam textos antigos.** Por exemplo: "Formações" → "Treinamentos", "Nova formação" → "Novo treinamento", "Encerrar formação" → "Encerrar treinamento", "Formação encerrada." → "Treinamento encerrado.", "Publicar a formação?" → "Publicar o treinamento?", "Todas as formações" → "Todos os treinamentos", "Criada" → "Criado".
- [ ] **Step 2:** `npx vitest run`. Esperado: FAIL nos testes alterados.
- [ ] **Step 3: Trocar os textos seguindo as Global Constraints.** A lista da página passa a ter a descrição "Cada treinamento tem os seus dias ou módulos. Vários podem estar publicados ao mesmo tempo; os anteriores continuam no histórico.". As mensagens do back trocam "SIPAT" por "treinamento", e "Você não tem permissão para gerenciar SIPATs." vira "…gerenciar treinamentos.". O manual troca as seções "SIPATs da empresa", "Nova SIPAT" e "Duplicar de outra SIPAT" pelos termos novos, mantendo "SIPAT 2026" como exemplo de nome. Fica fora desta varredura: identificadores de código, chaves de armazenamento (`sipat-company-administration`), nomes de arquivo e `SIPAT Online`.
- [ ] **Step 4: Verificar.**
  - `npx vitest run` → PASS.
  - `dotnet test tests/SipatOnline.Application.UnitTests tests/SipatOnline.Domain.UnitTests` → PASS.
  - `grep -rniE "formaç|SIPATs|\bsipat\b" src/Web/SipatOnline.Web/src --include=*.tsx --include=*.ts | grep -v "\.test\." | grep -vE "SIPAT Online|sipat[A-Z_-]|Sipat[A-Z]|/api/|import |'sipat\.|sipat-"` mostra só exemplos de nome ("SIPAT 2026").
  - Rodar a mesma busca nas strings `"..."` de `src/Modules src/Infrastructure src/Api` (excluindo `Migrations`).
- [ ] **Step 5: Commit.** `feat: say Treinamento across the product, SIPAT only as a training's name`

### Task 8: Demonstração com dois treinamentos em andamento

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/DevelopmentDemoPresentationInitializer.cs` (e/ou `DevelopmentLearningSampleInitializer.cs`, onde a demo cria a SIPAT publicada)
- Test: o teste de integração que cobre a demo (o mesmo arquivo que já testa esses inicializadores; se não houver nenhum, afirmar em `SipatPlanApiTests` com `developmentSampleEnabled: true`)

- [ ] **Step 1: Teste.** Na empresa de demonstração existem 2 treinamentos `Published` e em andamento hoje, e um deles se chama "Treinamento contra incêndios", com 1 módulo sem data.
- [ ] **Step 2:** rodar o teste. Esperado: FAIL.
- [ ] **Step 3: Implementar.** Criar o segundo treinamento na demo, com começo hoje e fim em +30 dias, e uma parte sem data, usando vídeos que já estão no acervo da demo. Apagar as SIPATs duplicadas e velhas que confundem a demonstração (`docs/PENDENCIAS-PARA-O-PO.md:46`).
- [ ] **Step 4:** rodar o teste. Esperado: PASS.
- [ ] **Step 5: Commit.** `chore(demo): show two trainings running at once`

### Task 9: Verificação final

- [ ] `dotnet build` → 0 erros. `dotnet test` → PASS (com o Docker ligado, para os `[DockerFact]`).
- [ ] Em `src/Web/SipatOnline.Web`: `npm test` → PASS e `npm run build` → sem erros de tipo.
- [ ] No app real: abrir a empresa da demo. O menu diz "Treinamentos", e a lista mostra dois "Em andamento". Publicar um terceiro funciona. No painel, trocar de treinamento muda os números. `/admin/sipats` redireciona. Na tela do participante aparecem os dois chips, e o de incêndio mostra "Módulo 1".
