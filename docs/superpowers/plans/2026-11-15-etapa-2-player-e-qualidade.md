# Etapa 2 — Dashboard de qualidade, pacote do player, conversão 720p/480p Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar ao operador, por empresa e entre empresas, onde o vídeo trava; tirar o player do app para o pacote `@sipat/video-player` (core em TypeScript puro + React), com playground; converter cada vídeo enviado para 720p e 480p e deixar o player escolher a qualidade.

**Architecture:** O dashboard só lê `learning."PlaybackQualitySessions"` (gravada desde a Etapa 1): o Postgres agrega, a Application aplica os limites dos semáforos, a tela desenha com HTML/SVG próprios. O player muda para `src/Web/SipatVideoPlayer` (workspace npm em `src/Web`, consumido como código-fonte), primeiro sem mudar comportamento, depois com as regras extraídas para `core/` e as telas falando com ele por eventos. A conversão roda dentro da API (`BackgroundService` + fila em tabela + ffmpeg com prioridade baixa) e a sessão de vídeo passa a devolver as fontes 720p e 480p.

**Tech Stack:** .NET 10, EF Core + Npgsql, PdfSharp (já usado nos certificados), xUnit + Testcontainers, ffmpeg/ffprobe, React 19 + Vite 7 + Vitest 4 + Testing Library, Media Chrome 4, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-11-14-sipat-video-player-design.md` (seção 5.7, Etapa 2, itens 6 a 11; detalhes em 5.1 a 5.6). ADR: `docs/architecture/ADR-003-sipat-video-player.md`.

## Global Constraints

- Branch nova **`feat/video-etapa-2`**, criada a partir do fim de `feat/video-go-live` (`git switch -c feat/video-etapa-2 feat/video-go-live`). A Etapa 1 continua publicável sozinha; nada desta etapa entra em `feat/video-go-live`.
- Dashboard **só para o operador**: política `ManagePlatform` na API; na tela, rotas só para `PlatformOperator` no portal `platform`. O administrador da empresa não vê.
- Rotas da tela: `/platform/companies/:companyId/qualidade` (empresa) e `/platform/qualidade` (comparação). Menu: "Qualidade do vídeo" no `CompanyNav` e no menu da operação.
- Visual da operação: cabeçalho claro e compacto (`PageHeader`), cartões brancos arredondados (`Card`, `Stat`), **amarelo só na ação principal** (`Button`/`buttonVariants` variante `default`). Semáforo sempre com texto ("Bom", "Atenção", "Ruim"), nunca só cor.
- Gráficos em HTML/SVG escritos à mão. **Nenhuma biblioteca de gráficos nova.** Quem implementa uma tarefa com gráfico carrega a skill **`dataviz`** antes de escrever o primeiro gráfico.
- Limites dos semáforos, num só lugar (`PlaybackQualityThresholds`): % tempo travado bom `< 1`, atenção `1 a 3`, ruim `> 3`; % sessões com travamento bom `< 10`, atenção `10 a 25`, ruim `> 25`; tempo médio para começar bom `< 2 s`, atenção `2 a 5 s`, ruim `> 5 s`; % sessões que não começaram bom `< 1`, atenção `1 a 3`, ruim `> 3`. Os extremos (1, 3, 10, 25, 2 s, 5 s) são "Atenção".
- Linhas de qualidade guardam `ErrorKind` e `Device` em **PascalCase** (`"Phone"`, `"Network"`); `ConnectionType` e `Quality` em minúsculas; `DayPosition`, `VideoId`, `ConnectionType` e `StartupMilliseconds` podem ser nulos. A agregação normaliza as chaves para minúsculas e trata os nulos.
- Hora do dia = hora local de quem assistiu: `StartedAt` (UTC) + `TimezoneOffsetMinutes` (já gravado como `-getTimezoneOffset()`, Brasil = `-180`).
- Nenhuma lista bruta vai ao navegador, exceto "pessoas com problema" (máximo **50**).
- Rotas novas do backend não usam `PlatformDbContext` nos endpoints (teste de arquitetura na Task 1).
- Pacote `@sipat/video-player` em `src/Web/SipatVideoPlayer`, workspace npm com **um `package.json` e um lockfile em `src/Web`** (`workspaces: ["SipatOnline.Web", "SipatVideoPlayer"]`), `exports` apontando para `src` (sem build). O app depende de `"@sipat/video-player": "*"`.
- `core/` em TypeScript puro: sem React, sem Media Chrome, sem imports do app, sem DOM além de `HTMLVideoElement`/`document`/`navigator`/`window`. Media Chrome continua por baixo do componente React. CSS próprio com variáveis `--sipat-player-*`. Todos os textos do player em pt-BR num só objeto (`react/texts.ts`). **O player nunca chama a API** (só eventos). Jogos ficam fora (espaço de atividade). Um teste de arquitetura no app proíbe o pacote de importar o app.
- Comportamento que não pode mudar (spec 5.1): bloqueio de avanço (arrastar, clicar, teclado, `seeking` nativo → volta ao liberado e `seekBlocked`); velocidade 1x; salvar a cada 10 s (só faixas ≥ 8 s), ao pausar, terminar, esconder a aba e após `seeked`; faixa contínua (salto > 5 s ou voltar no tempo começa outra); tela cheia com nossos controles e, sem Fullscreen API, ocupando a página; rebobinar antes de um jogo reabre o jogo (prévia). Os testes atuais de `LearningPage.test.tsx`, `VideoPreview.test.tsx` e `LearningActivitiesPanel.test.tsx` passam **sem edição** do começo ao fim desta etapa.
- Anti-metas mantidas: a medição nunca atrapalha o vídeo; a conclusão continua validada no servidor; nada vai para terceiros (sem analytics, sem YouTube, sem Mux, sem cache local). **Fora desta etapa:** HLS, capítulos, próximo vídeo automático.
- Conversão: ffmpeg **dentro da imagem da API**; **uma conversão por vez**, prioridade baixa (`ProcessPriorityClass.Idle`, que no Linux é `nice 19`); `BackgroundService` + fila em tabela; vídeo "processando" não entra num Dia.
  - 720p: `-c:v libx264 -profile:v high -pix_fmt yuv420p -b:v 2M -maxrate 2500k -bufsize 4M -c:a aac -b:a 128k -movflags +faststart`, `-vf "scale=-2:'min(720,trunc(ih/2)*2)'"`.
  - 480p: `-c:v libx264 -profile:v main -pix_fmt yuv420p -b:v 1M -maxrate 1250k -bufsize 2M -c:a aac -b:a 96k -movflags +faststart`, `-vf "scale=-2:'min(480,trunc(ih/2)*2)'"`.
  - Sempre `-hide_banner -nostdin -y -preset veryfast`.
- Chaves no R2: `videos/{videoId:N}/720p.mp4` e `videos/{videoId:N}/480p.mp4`. Arquivo local: `{videoId:N}.video` (720p, como hoje) e `{videoId:N}.480p.video`.
- Escolha de qualidade (spec 5.4): preferência salva no navegador (`localStorage["sipat-player-quality"]`) → senão `navigator.connection`: `effectiveType` `slow-2g`/`2g`/`3g` ou `downlink < 2` → 480p, senão 720p → sem essa informação, 720p. Troca automática para baixo: **2 travamentos em 60 s em 720p** → 480p, mantendo posição e regras, **uma vez por sessão**, só no modo "Automática". Botão "Automática · 720p · 480p"; com uma fonte só, sem botão.
- Migration nova com ID **`20261122100000_AddVideoConversion`** (a mais nova hoje é `20261121110000_AddPlaybackQualitySessions`). O `dotnet ef` gera a data de hoje: renomeie o arquivo, o `.Designer.cs` e o atributo `[Migration("…")]`.
- Pendências da Etapa 1 que entram aqui, na tarefa que mexe no código: `DevelopmentSampleVideoProvider` usa `PlaybackEvidencePolicy.Accept` (Task 14); a verificação de acesso da rota `/media` sai do endpoint para um serviço da Application (Task 14); a imagem MinIO dos testes fixada por digest (Task 11); a rota de arquivo do operador não abre o objeto antes de redirecionar (Task 12).
- Textos para o usuário em pt-BR, no vocabulário do produto (SIPAT, Dia, vídeo). Todo POST/PUT novo valida antiforgery como os existentes.
- `src/Web/SipatOnline.Web/dist/` é versionado: depois de `npm run build`, `git checkout -- src/Web/SipatOnline.Web/dist` antes de commitar.
- Comandos do frontend: Tasks 3 a 5 em `src/Web/SipatOnline.Web` (`npm test -- <arquivo>`); da Task 6 em diante em `src/Web` (`npm test -w SipatOnline.Web -- <arquivo>`, `npm test -w @sipat/video-player -- <arquivo>`, e `npm run lint && npm test && npm run build` para tudo).

## Review Focus

1. **Linhas com `"Phone"`/`"Desktop"` em PascalCase, conexão nula, Dia nulo e vídeo nulo** devem cair nos grupos certos (`phone`, `unknown`, "Sem dia", título da aula) e não sumir. Teste: `Aggregates_the_company_indicators_in_the_database` (Task 1).
2. **Hora do dia no fuso de quem assistiu:** uma sessão às 13:30Z com offset `-180` conta às 10h, não às 13h. Teste: mesmo teste da Task 1 (`byHour[10]`).
3. **Trocar de qualidade no meio do vídeo** (manual ou automática) mantém posição, bloqueio e progresso: não conta o `waiting` da troca como travamento, não salva faixa começando em 0 e o resumo de qualidade sai com `quality: '480p'` e `qualitySwitches: 1`. Teste: `switches to 480p keeping position, lock and coverage` (Task 15).
4. **`localStorage` que lança exceção** (Safari privado, armazenamento bloqueado) não quebra o player: a escolha cai em "Automática". Teste: `falls back to automatic when storage throws` (Task 15).
5. **A API reinicia no meio de uma conversão, ou o arquivo está corrompido:** o trabalho volta para a fila e roda de novo; o arquivo corrompido vira "falhou" com a mensagem, sem derrubar o worker nem travar a fila. Testes: `Resumes_a_job_left_running_by_a_restart` e `Marks_a_corrupt_upload_as_failed_and_moves_on` (Task 12).

---

### Task 1: API do dashboard de qualidade (empresa e comparação)

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/PlaybackQualityDashboard.cs` (records, `QualityLevel`, `PlaybackQualityThresholds`, `IPlaybackQualityDashboardStore`)
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/PlaybackQualityDashboardService.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/EfPlaybackQualityDashboardStore.cs`
- Create: `src/Api/SipatOnline.Api/Endpoints/PlaybackQualityDashboardEndpoints.cs`
- Modify: `src/Api/SipatOnline.Api/Program.cs` (`app.MapPlaybackQualityDashboardEndpoints();`)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs` (registros scoped)
- Modify: `tests/SipatOnline.Application.UnitTests/SipatOnline.Application.UnitTests.csproj` (novo `ProjectReference` para `SipatOnline.Learning.Application`, que ainda não está lá)
- Test: `tests/SipatOnline.Application.UnitTests/Quality/PlaybackQualityThresholdsTests.cs`
- Test: `tests/SipatOnline.IntegrationTests/PlaybackQualityDashboardApiTests.cs`
- Test: `tests/SipatOnline.ArchitectureTests/EndpointDatabaseTests.cs`

**Interfaces:**
- Consumes: `PlaybackQualitySessionEntity` / `PlatformDbContext.PlaybackQualitySessions` (Etapa 1), `SipatEvents`, `Tenants`, `Users` (`DisplayName`, `UserName`), `PlatformCourseVideos`, `LearningLessons`.
- Produces:
  ```csharp
  namespace SipatOnline.Learning.Application.Quality;
  public enum QualityLevel { Good, Attention, Poor }
  public sealed record QualityIndicator(double? Value, QualityLevel? Level);
  public sealed record QualityTotals(int Sessions, int NeverStarted, int StalledSessions,
      long StallMilliseconds, long WatchedMilliseconds, double? AverageStartupMilliseconds);
  public sealed record QualityIndicators(int Sessions, int StartedSessions,
      QualityIndicator NeverStartedPercent, QualityIndicator StalledSessionsPercent,
      QualityIndicator AverageStartupMilliseconds, QualityIndicator StalledTimePercent);
  public static class PlaybackQualityThresholds
  {
      public static QualityIndicators Evaluate(QualityTotals totals);
      public static QualityLevel StalledTime(double percent);
      public static QualityLevel StalledSessions(double percent);
      public static QualityLevel Startup(double milliseconds);
      public static QualityLevel NeverStarted(double percent);
  }
  public sealed record HourBucket(int Hour, int Sessions, int StalledSessions);       // 24 itens, 0..23
  public sealed record QualityBucket(string? Key, QualityTotals Totals);              // chave minúscula; null = sem valor
  public sealed record VideoQualityRow(Guid? VideoId, string Title, QualityTotals Totals);
  public sealed record ProblemParticipant(Guid ParticipantId, string DisplayName, string LoginIdentifier,
      int Sessions, int NeverStarted, double StalledTimePercent);
  public sealed record SipatOption(Guid Id, string Title, DateTimeOffset StartsAt);
  public sealed record CompanyQualityScope(Guid CompanyId, string CompanyName, string CompanyKey,
      IReadOnlyList<SipatOption> Sipats, Guid? DefaultSipatId);
  public sealed record QualityAggregate(QualityTotals Totals, IReadOnlyList<HourBucket> ByHour,
      IReadOnlyList<QualityBucket> ByConnection, IReadOnlyList<QualityBucket> ByDevice,
      IReadOnlyList<QualityBucket> ByQuality, IReadOnlyList<QualityBucket> ByDay,
      IReadOnlyList<VideoQualityRow> Videos, IReadOnlyList<ProblemParticipant> People, IReadOnlyList<int> Days);
  public sealed record CompanyQualityTotals(Guid CompanyId, string Name, QualityTotals Totals);
  public interface IPlaybackQualityDashboardStore
  {
      Task<CompanyQualityScope?> FindScopeAsync(Guid companyId, CancellationToken cancellationToken);
      Task<QualityAggregate> AggregateAsync(Guid companyId, Guid sipatId, int? day, CancellationToken cancellationToken);
      Task<IReadOnlyList<CompanyQualityTotals>> CompareAsync(DateTimeOffset from, DateTimeOffset toExclusive, CancellationToken cancellationToken);
  }
  // resultado já avaliado, que vira o JSON
  public sealed record QualityBreakdownItem(string? Key, QualityIndicators Indicators);
  public sealed record VideoQualityItem(Guid? VideoId, string Title, QualityIndicators Indicators);
  public sealed record CompanyQualityItem(Guid CompanyId, string Name, QualityIndicators Indicators);
  public sealed record CompanyPlaybackQuality(Guid CompanyId, string CompanyName, string CompanyKey,
      IReadOnlyList<SipatOption> Sipats, Guid? SipatId, int? Day, IReadOnlyList<int> Days,
      QualityIndicators Indicators, IReadOnlyList<HourBucket> ByHour,
      IReadOnlyList<QualityBreakdownItem> ByConnection, IReadOnlyList<QualityBreakdownItem> ByDevice,
      IReadOnlyList<QualityBreakdownItem> ByQuality, IReadOnlyList<QualityBreakdownItem> ByDay,
      IReadOnlyList<VideoQualityItem> Videos, IReadOnlyList<ProblemParticipant> People);
  public sealed record CompanyQualityComparison(DateOnly From, DateOnly To, IReadOnlyList<CompanyQualityItem> Companies);
  public sealed class PlaybackQualityDashboardService(ITenantContext tenantContext, ICurrentActor currentActor,
      IPlaybackQualityDashboardStore store, TimeProvider timeProvider)
  {
      public Task<Result<CompanyPlaybackQuality>> GetCompanyAsync(Guid companyId, Guid? sipatId, int? day, CancellationToken cancellationToken);
      public Task<Result<CompanyQualityComparison>> CompareAsync(DateOnly? from, DateOnly? to, CancellationToken cancellationToken);
  }
  ```
- Rotas (grupo `/api/platform`, `.RequireAuthorization("ManagePlatform")`):
  - `GET /api/platform/companies/{companyId:guid}/playback-quality?sipatId=&day=` → `CompanyPlaybackQuality` (camelCase; enums como texto PascalCase, como no resto da API: `"Good"`).
  - `GET /api/platform/playback-quality?from=yyyy-MM-dd&to=yyyy-MM-dd` → `CompanyQualityComparison`.
- Erros: `learning.playback_quality.forbidden` (403, "Somente a operação pode ver a qualidade do vídeo."), `learning.playback_quality.company_not_found` (404, "A empresa não foi encontrada."), `learning.playback_quality.sipat_not_found` (404, "A SIPAT não foi encontrada nesta empresa."), `learning.playback_quality.period_invalid` (400, "Escolha um período de até um ano."). `ToProblem` próprio do arquivo: `*.forbidden` → 403, `*_not_found` → 404, resto 400.

Regras de cálculo (em `Evaluate`; `StartedSessions = Sessions - NeverStarted`):
- `NeverStartedPercent = NeverStarted / Sessions * 100`;
- `StalledSessionsPercent = StalledSessions / StartedSessions * 100` (`StalledSessions` = sessões que começaram com `StallCount > 0`);
- `AverageStartupMilliseconds` = média de `StartupMilliseconds` não nulos;
- `StalledTimePercent = StallMilliseconds / (WatchedMilliseconds + StallMilliseconds) * 100`;
- divisor zero → `Value = null`, `Level = null`.

Regras do serviço: operador = `currentActor.IsInRole(PlatformRoles.PlatformOperator) && tenantContext.CurrentTenantId is null` (como `SipatProgramService`). SIPAT padrão = a mais recente (por `StartsAt`) **que tem sessões**; sem nenhuma com sessões, a mais recente; sem SIPAT, resposta com totais zerados, `SipatId = null`. Comparação: padrão `to` = hoje (UTC), `from` = `to - 89 dias`; `from > to` ou mais de 366 dias → `period_invalid`; empresas com SIPAT que cruza o período (`StartsAt < toExclusive && EndsAt >= from`), com os totais das sessões cujo `StartedAt` está no período (empresa sem sessões aparece com `Sessions = 0`).

Regras do store (agregação **no Postgres**: `GroupBy`/`Count`/`Sum`/`Average` traduzidos pelo EF, ou `Database.SqlQuery` se alguma expressão não traduzir; não carregar as linhas na memória):
- `ByDevice` e `ByConnection`: chave `ToLowerInvariant()` do valor guardado; conexão nula → `"unknown"`. `ByQuality`: o valor guardado. `ByDay`: `DayPosition` (texto) ou `null`.
- `Videos`: agrupa por `VideoId ?? LessonId`; título do vídeo do catálogo (`LibraryTitle ?? Title`) ou da aula; só itens com ≥ 3 sessões; ordem por `StalledTimePercent` desc, depois sessões desc; máximo 10.
- `People`: participantes com alguma sessão `NeverStarted` ou com tempo travado > 10% (soma das sessões dele); ordem por `NeverStarted` desc, depois `StalledTimePercent` desc; máximo 50; nome e login de `Users`.
- `Days`: posições distintas presentes na SIPAT, em ordem.

- [ ] **Step 1: Create the branch**

Só depois que a revisão final da Etapa 1 estiver commitada (`git status` limpo em `feat/video-go-live`).
Run: `git switch -c feat/video-etapa-2 feat/video-go-live`
Expected: `Switched to a new branch 'feat/video-etapa-2'`

- [ ] **Step 2: Write the failing unit tests** (`PlaybackQualityThresholdsTests`)

```csharp
[Theory, InlineData(0.99, Good), InlineData(1.0, Attention), InlineData(3.0, Attention), InlineData(3.01, Poor)]
Classifies_stalled_time(double percent, QualityLevel expected)
[Theory, InlineData(9.99, Good), InlineData(10, Attention), InlineData(25, Attention), InlineData(25.01, Poor)]
Classifies_stalled_sessions(...)
[Theory, InlineData(1999, Good), InlineData(2000, Attention), InlineData(5000, Attention), InlineData(5001, Poor)]
Classifies_startup(...)
[Theory, InlineData(0.99, Good), InlineData(1, Attention), InlineData(3, Attention), InlineData(3.01, Poor)]
Classifies_never_started(...)
[Fact] Evaluates_the_four_indicators_from_totals()
    // Totals(Sessions 4, NeverStarted 1, StalledSessions 2, Stall 18_000, Watched 202_000, AvgStartup 2000)
    // → StartedSessions 3; NeverStarted 25 (Poor); StalledSessions 66.67±0.01 (Poor); Startup 2000 (Attention); StalledTime 8.18±0.01 (Poor)
[Fact] Has_no_value_or_level_without_sessions()   // Totals all zero, AvgStartup null → four Value == null, Level == null
```

- [ ] **Step 3: Write the failing integration tests** (`PlaybackQualityDashboardApiTests`, `[DockerFact]`, factory e login do operador como `CatalogPlaybackApiTests` — cliente em `ops.localhost`; linhas inseridas direto no `PlatformDbContext`)

Massa de dados de `Aggregates_the_company_indicators_in_the_database` (empresa padrão, SIPAT A; P1, P2 e P3 são participantes):

| linha | dono | começou | startup | stalls / stallMs | watchedMs | Device | Connection | Quality | Dia | StartedAt (offset -180) |
|---|---|---|---|---|---|---|---|---|---|---|
| r1 | P1 | sim | 1000 | 0 / 0 | 60 000 | `Phone` | `4g` | `720p` | 1 | 13:30Z |
| r2 | P1 | sim | 3000 | 2 / 3 000 | 57 000 | `Desktop` | null | `720p` | 1 | 13:40Z |
| r3 | P3 | sim | 2000 | 1 / 15 000 | 85 000 | `Phone` | `3g` | `480p` | 2 | 20:10Z |
| r4 | P2 | não (`ErrorKind = "Network"`) | null | 0 / 0 | 0 | `Phone` | `3g` | `single` | null | 20:20Z |

Mais uma linha de outra empresa e uma de outra SIPAT da mesma empresa (não podem aparecer).

- `Aggregates_the_company_indicators_in_the_database()`: `GET .../playback-quality?sipatId=A` → `indicators.sessions == 4`, `startedSessions == 3`, `neverStartedPercent.value == 25`, `stalledSessionsPercent.level == "Poor"`, `averageStartupMilliseconds.value == 2000`; `byHour[10] == { sessions 2, stalledSessions 1 }`, `byHour[17] == { sessions 2, stalledSessions 1 }`, `byHour` tem 24 itens; `byDevice` = `phone` (3) e `desktop` (1); `byConnection` tem `unknown` (1), `3g` (2), `4g` (1); `byQuality` tem `single`, `720p`, `480p`; `byDay` tem `"1"` (2), `"2"` (1) e `null` (1); `days == [1, 2]`; `people` = `[P2, P3]` nessa ordem (P1 com 2,5% fica fora).
- `Filters_by_day()`: `day=1` → `indicators.sessions == 2`.
- `Opens_on_the_latest_sipat_with_sessions()`: sem `sipatId` → `sipatId == A` mesmo havendo uma SIPAT B mais nova sem sessões; `sipats` lista as duas, mais nova primeiro.
- `Refuses_a_sipat_of_another_company()`: `sipatId` de outra empresa → 404 `learning.playback_quality.sipat_not_found`.
- `Refuses_company_administrators()`: administrador da empresa (`admin-root`, host da empresa) → 403 nas duas rotas.
- `Compares_companies_that_had_a_sipat_in_the_period()`: empresa 2 com SIPAT no período e sem sessões → linha com `indicators.sessions == 0` e valores nulos; empresa 3 com SIPAT fora do período → ausente; `from` > `to` → 400 `learning.playback_quality.period_invalid`.

- [ ] **Step 4: Write the failing architecture test** (`EndpointDatabaseTests`)

`[Fact] New_endpoint_files_do_not_use_the_database_context()`: sobe a partir de `AppContext.BaseDirectory` até achar `SipatOnline.slnx`; para cada arquivo da lista `["src/Api/SipatOnline.Api/Endpoints/PlaybackQualityDashboardEndpoints.cs"]`, `Assert.DoesNotContain("PlatformDbContext", File.ReadAllText(path))`. A lista recebe novos arquivos nas Tasks 2, 12 e 14.

- [ ] **Step 5: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.Application.UnitTests --filter PlaybackQualityThresholdsTests` e `dotnet test tests/SipatOnline.IntegrationTests --filter PlaybackQualityDashboardApiTests` e `dotnet test tests/SipatOnline.ArchitectureTests`
Expected: FAIL (tipos e arquivo inexistentes)

- [ ] **Step 6: Implement thresholds, service, store, endpoints and registrations** (regras acima)

- [ ] **Step 7: Run the tests**

Run: `dotnet test SipatOnline.slnx`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(quality): operator API with video quality per company and across companies"
```

---

### Task 2: Resumo em PDF de uma página

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/PlaybackQualityConclusion.cs`
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/IPlaybackQualityPdfRenderer.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlaybackQualityPdfRenderer.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/CertificateFontResolver.cs` (a classe aninhada privada de `CertificatePdfRenderer.cs` vira `internal sealed`, sem mudar comportamento)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/CertificatePdfRenderer.cs`, `PlaybackQualityDashboardService.cs`, `PlaybackQualityDashboardEndpoints.cs`, `InfrastructureServiceCollectionExtensions.cs`
- Test: `tests/SipatOnline.Application.UnitTests/Quality/PlaybackQualityConclusionTests.cs`, `tests/SipatOnline.IntegrationTests/PlaybackQualityDashboardApiTests.cs`

**Interfaces:**
- Consumes: `CompanyPlaybackQuality`, `QualityIndicators`, `HourBucket` (Task 1).
- Produces:
  ```csharp
  public static class PlaybackQualityConclusion
  {
      public static string For(QualityIndicators indicators, IReadOnlyList<HourBucket> byHour);
  }
  public sealed record PlaybackQualityPdfContent(string CompanyName, string SipatTitle, string DayLabel,
      QualityIndicators Indicators, IReadOnlyList<HourBucket> ByHour, string Conclusion, DateTimeOffset GeneratedAt);
  public interface IPlaybackQualityPdfRenderer { byte[] Render(PlaybackQualityPdfContent content); }
  // PlaybackQualityDashboardService
  public Task<Result<(byte[] Pdf, string FileName)>> RenderSummaryAsync(Guid companyId, Guid? sipatId, int? day, CancellationToken cancellationToken);
  ```
  Rota: `GET /api/platform/companies/{companyId:guid}/playback-quality/summary.pdf?sipatId=&day=` → `application/pdf`, arquivo `qualidade-video-{companyKey}.pdf`.
- Frase de conclusão (texto exato; nomes dos indicadores em minúsculas: "sessões que não começaram", "sessões com travamento", "tempo para começar", "tempo travado"; listas unidas com ", " e " e " no último):
  - sem sessões: `Ainda não há sessões de vídeo registradas nesta SIPAT.`
  - todos bons: `A entrega de vídeo funcionou bem: os quatro indicadores ficaram na faixa boa.`
  - pior = atenção: `A entrega de vídeo funcionou, com pontos de atenção em {lista}.`
  - pior = ruim: `Houve problemas na entrega de vídeo: {lista dos ruins} ficaram acima do limite. O horário com mais travamentos foi às {H}h.` (hora com mais `StalledSessions`; empate → a mais cedo; sem travamento, sem a segunda frase).
- Página A4 retrato: título "Qualidade do vídeo", empresa, SIPAT e Dia ("Todos os dias" ou "Dia N"); os 4 indicadores com valor e semáforo em texto; gráfico de barras por hora (24 barras desenhadas com `XGraphics`); a frase; "Gerado em dd/MM/yyyy". `document.Info.Title = $"Qualidade do vídeo - {CompanyName}"`. Fonte: `CertificateFontResolver`.

- [ ] **Step 1: Write the failing tests**

`PlaybackQualityConclusionTests`: `Says_there_is_no_data_yet`, `Says_all_good`, `Lists_the_attention_points` (dois em atenção → "... em sessões com travamento e tempo para começar."), `Names_the_poor_indicators_and_the_worst_hour` (`byHour[17].StalledSessions = 3`, `byHour[10] = 3` → "às 10h").

`PlaybackQualityDashboardApiTests`: `Downloads_a_one_page_summary()` → 200, `Content-Type: application/pdf`, corpo começa com `%PDF`, `PdfReader.Open(stream, PdfDocumentOpenMode.Import).PageCount == 1`, `Info.Title == "Qualidade do vídeo - Integration Test"`; sem sessões também gera o PDF (200).

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.Application.UnitTests --filter PlaybackQualityConclusionTests` e `dotnet test tests/SipatOnline.IntegrationTests --filter Downloads_a_one_page_summary`
Expected: FAIL

- [ ] **Step 3: Implement conclusion, renderer, service method and route**

- [ ] **Step 4: Run the tests, then commit**

Run: `dotnet test SipatOnline.slnx` → PASS (inclusive os testes de certificado)

```bash
git add src tests
git commit -m "feat(quality): one-page PDF summary of video quality for the client meeting"
```

---

### Task 3: Tela "Qualidade do vídeo" da empresa

Antes de escrever os gráficos, carregue a skill `dataviz`.

**Files:**
- Create: `src/Web/SipatOnline.Web/src/quality/PlaybackQualityPage.tsx`
- Create: `src/Web/SipatOnline.Web/src/quality/QualityCharts.tsx` (`HourChart`, `BarList`)
- Create: `src/Web/SipatOnline.Web/src/quality/qualityLabels.ts`
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (tipos e chamadas)
- Modify: `src/Web/SipatOnline.Web/src/App.tsx` (rota antes de `/platform/companies/:companyId/:section`)
- Modify: `src/Web/SipatOnline.Web/src/companies/CompanyNav.tsx` (entrada nova, depois de "Administradores")
- Modify: `src/Web/SipatOnline.Web/src/companies/CompanyPage.tsx` (lê `?busca=` como busca inicial)
- Test: `src/Web/SipatOnline.Web/src/quality/PlaybackQualityPage.test.tsx`, `src/Web/SipatOnline.Web/src/quality/QualityCharts.test.tsx`, `src/Web/SipatOnline.Web/src/companies/CompanyNav.test.tsx`, `src/Web/SipatOnline.Web/src/PlatformCompanyEmployeesPage.test.tsx`

**Interfaces:**
- Consumes: rotas das Tasks 1 e 2.
- Produces (api.ts):
  ```ts
  export type QualityLevel = 'Good' | 'Attention' | 'Poor';
  export interface QualityIndicator { value: number | null; level: QualityLevel | null }
  export interface QualityIndicators { sessions: number; startedSessions: number; neverStartedPercent: QualityIndicator;
    stalledSessionsPercent: QualityIndicator; averageStartupMilliseconds: QualityIndicator; stalledTimePercent: QualityIndicator }
  export interface QualityBreakdownItem { key: string | null; indicators: QualityIndicators }
  export interface CompanyPlaybackQuality { companyId: string; companyName: string; companyKey: string;
    sipats: { id: string; title: string; startsAt: string }[]; sipatId: string | null; day: number | null; days: number[];
    indicators: QualityIndicators; byHour: { hour: number; sessions: number; stalledSessions: number }[];
    byConnection: QualityBreakdownItem[]; byDevice: QualityBreakdownItem[]; byQuality: QualityBreakdownItem[]; byDay: QualityBreakdownItem[];
    videos: { videoId: string | null; title: string; indicators: QualityIndicators }[];
    people: { participantId: string; displayName: string; loginIdentifier: string; sessions: number; neverStarted: number; stalledTimePercent: number }[] }
  export function getCompanyPlaybackQuality(companyId: string, filter?: { sipatId?: string | null; day?: number | null }): Promise<CompanyPlaybackQuality>;
  export function playbackQualitySummaryUrl(companyId: string, filter?: { sipatId?: string | null; day?: number | null }): string;
  ```
  (query só com os filtros presentes; `day` omitido = todos os dias)
- `qualityLabels.ts`: `levelLabel(level)` → "Bom" | "Atenção" | "Ruim" | "Sem dados"; `connectionLabel(key)`: `slow-2g` "2G lenta", `2g` "2G", `3g` "3G", `4g` "4G ou melhor", `unknown` "Desconhecida"; `deviceLabel`: `phone` "Celular", `tablet` "Tablet", `desktop` "Computador"; `qualityLabel`: `single` "Única", `720p`, `480p`; `dayLabel(key)`: `"2"` → "Dia 2", `null` → "Sem dia"; `formatPercent(1.818)` → "1,8%"; `formatSeconds(2000)` → "2,0 s".
- Componentes:
  ```ts
  export function HourChart({ hours }: { hours: { hour: number; sessions: number; stalledSessions: number }[] }): JSX.Element;
  // barra = % das sessões da hora que travaram; hora sem sessões = sem barra; cada barra tem <title> "10h: 1 de 2 sessões com travamento"
  export function BarList({ title, items }: { title: string; items: { label: string; percent: number | null; sessions: number }[] }): JSX.Element;
  ```

Layout (spec 5.5): `PageHeader` "Qualidade do vídeo · {companyName}" com, à direita, `<select aria-label="SIPAT">`, `<select aria-label="Dia">` ("Todos os dias", "Dia N") e o link **amarelo** "Baixar resumo" (`buttonVariants({ variant: 'default' })`, `href = playbackQualitySummaryUrl(...)`). Quatro cartões: "Vídeos assistidos" (`startedSessions`, semáforo de `neverStartedPercent` com a linha "x% não começaram"), "Sessões com travamento", "Tempo médio para começar", "Tempo travado". Depois "Travamentos por hora do dia" (`HourChart`), os quatro `BarList` ("Por conexão", "Por aparelho", "Por qualidade", "Por Dia", barra = `stalledSessionsPercent`), a tabela "Vídeos que mais travam" e a lista "Pessoas com problema" (nome, login, "N não começaram" / "x% do tempo travado", link "Ver progresso" para `/platform/companies/{companyId}/participantes?busca={loginIdentifier}`). Sem sessões: `EmptyState` com título "Ainda não há dados de vídeo" e descrição "Quando a SIPAT começar, aqui aparecem os vídeos assistidos, onde o vídeo trava e quem teve problema para assistir, por hora, conexão, aparelho e Dia." (os seletores continuam visíveis).

- [ ] **Step 1: Write the failing tests**

```ts
// PlaybackQualityPage.test.tsx (vi.mock('@/api'), MemoryRouter em /platform/companies/c1/qualidade)
it('shows the four indicators with their traffic lights')
  // cartão "Sessões com travamento" mostra "66,7%" e "Ruim"; "Tempo médio para começar" mostra "2,0 s" e "Atenção"; "Vídeos assistidos" mostra "3" e "25,0% não começaram"
it('explains what will appear when the SIPAT has no data yet')   // sessions 0 → heading "Ainda não há dados de vídeo"
it('reloads for the chosen SIPAT and day')   // muda os selects → getCompanyPlaybackQuality chamado com ('c1', { sipatId: 's2', day: 2 })
it('offers the one-page summary as the main action')   // link "Baixar resumo" href "/api/platform/companies/c1/playback-quality/summary.pdf?sipatId=s1"
it('links each person with a problem to their progress')   // href "/platform/companies/c1/participantes?busca=joao.silva"
// QualityCharts.test.tsx
it('draws one bar per hour with the share of sessions that stalled')   // 24 colunas; título da barra 10h "10h: 1 de 2 sessões com travamento"; hora sem sessões sem barra
it('lists breakdown items with their share and session count')
// CompanyNav.test.tsx (no it existente ou novo)
it('links to the video quality of the company')   // link "Qualidade do vídeo" → "/platform/companies/c1/qualidade"
// PlatformCompanyEmployeesPage.test.tsx
it('opens with the search sent by the quality page')   // rota .../participantes?busca=joao.silva → getPlatformCompanyEmployees chamado com search 'joao.silva' e o campo preenchido
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/quality src/companies/CompanyNav.test.tsx src/PlatformCompanyEmployeesPage.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement api functions, labels, charts, page, route, nav entry and `?busca=`**

- [ ] **Step 4: Run the whole web suite, then commit**

Run: `npm test && npm run lint && npm run build`, depois `git checkout -- dist`
Expected: PASS

```bash
git add src/Web/SipatOnline.Web/src
git commit -m "feat(quality): company video quality screen for the operator"
```

---

### Task 4: Comparação entre empresas

Carregue a skill `dataviz` (semáforos em tabela).

**Files:**
- Create: `src/Web/SipatOnline.Web/src/quality/PlaybackQualityComparisonPage.tsx`
- Modify: `src/Web/SipatOnline.Web/src/api.ts`, `src/Web/SipatOnline.Web/src/App.tsx` (rota `/platform/qualidade` e link no menu da operação, depois de "Biblioteca")
- Test: `src/Web/SipatOnline.Web/src/quality/PlaybackQualityComparisonPage.test.tsx`, `src/Web/SipatOnline.Web/src/App.test.tsx`

**Interfaces:**
- Consumes: `QualityIndicators`, `qualityLabels.ts` (Task 3).
- Produces:
  ```ts
  export interface PlaybackQualityComparison { from: string; to: string;
    companies: { companyId: string; name: string; indicators: QualityIndicators }[] }
  export function getPlaybackQualityComparison(period?: { from?: string; to?: string }): Promise<PlaybackQualityComparison>;
  ```
- Tela: `PageHeader` "Qualidade do vídeo" com "De" e "Até" (`<input type="date">`, valores iniciais de `from`/`to` da resposta). Tabela: Empresa, Vídeos assistidos, % não começaram, % sessões com travamento, Tempo médio para começar, % tempo travado; cada indicador com o valor e o semáforo em texto; cabeçalhos ordenáveis (`aria-sort`), padrão "% tempo travado" desc com "sem dados" no fim; clicar na linha (ou no nome, que é um `Link`) abre `/platform/companies/{companyId}/qualidade`. Sem empresas: `EmptyState` "Nenhuma empresa teve SIPAT neste período".

- [ ] **Step 1: Write the failing tests**

```ts
it('lists one row per company with the four indicators')
it('sorts by an indicator when its header is clicked')   // clique em "% sessões com travamento" → ordem muda e aria-sort="descending"
it('opens the company when its row is clicked')   // navega para /platform/companies/c2/qualidade
it('reloads for another period')   // muda "De" → getPlaybackQualityComparison({ from: '2026-12-01', to: … })
// App.test.tsx, em 'routes platform operators to the company list'
expect(screen.getByRole('link', { name: 'Qualidade do vídeo' })).toHaveAttribute('href', '/platform/qualidade');
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/quality/PlaybackQualityComparisonPage.test.tsx src/App.test.tsx` → FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the whole web suite, then commit**

Run: `npm test && npm run lint && npm run build`, depois `git checkout -- dist` → PASS

```bash
git add src/Web/SipatOnline.Web/src
git commit -m "feat(quality): compare video quality across companies"
```

---

### Task 5: Rede de segurança antes de mexer no player

Testes de caracterização do que a spec 5.1 manda manter e que ainda não tem teste. Devem **passar sem mudar código**. Se algum falhar, é defeito real: pare e reporte.

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/LearningPage.test.tsx` (novos `it` no `describe('learning experience')`)
- Modify: `src/Web/SipatOnline.Web/src/player/SipatPlayer.test.tsx`

**Interfaces:** nenhuma.

- [ ] **Step 1: Write the tests**

`LearningPage.test.tsx` (com `playableCourse`, `atTime`; `vi.useFakeTimers({ shouldAdvanceTime: true })` onde precisar do intervalo):
- `it('saves every 10 seconds only once the range reaches 8 seconds')`: `playing` em 0; `atTime 5` + `timeUpdate`; avançar 10 s → `recordRange` não chamado; `atTime 9` + `timeUpdate`; avançar 10 s → `recordRange` chamado com `('track-1', 'lesson-1', 'session-lesson-1', 0, 9000, 9000)`.
- `it('starts a new range after a jump of more than five seconds')`: `playing` em 0; `timeUpdate` em 3; `timeUpdate` em 9.5 (salto 6,5 s); `timeUpdate` em 10; `pause` → `recordRange` chamado com início `9500` e fim `10000`; nenhuma chamada com início `0` e fim ≥ `9500`.
- `it('starts a new range when time goes backwards')`: `timeUpdate` 4 → 2 → 3; `pause` → faixa `2000..3000`.
- `it('stops a drag on the timeline at what was already watched')`: aula com posição 12 s, `duration` 60; `getBoundingClientRect` do `.sipat-scrubber-track` = `{ left: 0, width: 100 }`; `pointerDown` com `clientX: 90` → `video.currentTime === 12` e o aviso "não é possível avançar" visível.
- `it('saves when the video is paused and after a seek')`: `pause` → `recordRange`; `seeking` + `seeked` → `savePosition`.

`SipatPlayer.test.tsx`:
- `it('uses the real fullscreen on the player frame and keeps our controls')`: `document.fullscreenEnabled = true`; `requestFullscreen` do `.sipat-player` mockado resolvendo; clique em "Tela cheia" → chamado no `.sipat-player`; `document.fullscreenElement = frame` + `fullscreenchange` → botão "Sair da tela cheia" e o `role="slider"` continua no documento.

- [ ] **Step 2: Run them**

Run: `npm test -- src/LearningPage.test.tsx src/player/SipatPlayer.test.tsx`
Expected: PASS (todos, sem tocar em código de produção)

- [ ] **Step 3: Commit**

```bash
git add src/Web/SipatOnline.Web/src/LearningPage.test.tsx src/Web/SipatOnline.Web/src/player/SipatPlayer.test.tsx
git commit -m "test(web): pin interval saves, range continuity, drag lock and fullscreen before the player moves"
```

---

### Task 6: Workspace npm e o pacote `@sipat/video-player` (só mudança de lugar)

O player muda de pasta **sem mudar comportamento**. Nenhum teste existente muda de asserção; só caminhos de import.

**Files:**
- Create: `src/Web/package.json`, `src/Web/package-lock.json` (gerado), `src/Web/.dockerignore`
- Create: `src/Web/SipatVideoPlayer/package.json`, `tsconfig.json`, `vitest.config.ts`, `test/setup.ts`, `src/index.ts`
- Move (`git mv`): `src/Web/SipatOnline.Web/src/player/SipatPlayer.tsx` → `src/Web/SipatVideoPlayer/src/react/SipatPlayer.tsx`; `SipatPlayer.css`, `loadMediaChrome.ts`, `mediaChrome.d.ts` → `src/Web/SipatVideoPlayer/src/react/`; `player/core/quality.ts` → `src/Web/SipatVideoPlayer/src/core/quality.ts`; `player/SipatPlayer.test.tsx` → `src/Web/SipatVideoPlayer/test/react/SipatPlayer.test.tsx`; `player/core/quality.test.ts` → `src/Web/SipatVideoPlayer/test/core/quality.test.ts`
- Delete: `src/Web/SipatOnline.Web/package-lock.json`, `src/Web/SipatOnline.Web/.dockerignore`
- Modify: `src/Web/SipatOnline.Web/package.json` (dependência `"@sipat/video-player": "*"`; `media-chrome` sai do app), `src/Web/SipatOnline.Web/src/api.ts`, `src/learning/LearningTrackPage.tsx`, `src/VideoPreview.tsx` (imports)
- Modify: `deploy/nginx/Dockerfile`, `src/Web/SipatOnline.Web/Dockerfile`, `compose.yaml` (serviço `web`), `.dockerignore` (raiz: `src/Web` inteiro no lugar de `src/Web/SipatOnline.Web`), `.github/workflows/ci.yml` (job `frontend`)
- Test: `src/Web/SipatOnline.Web/src/playerBoundary.test.ts`

**Interfaces:**
- Produces:
  ```json
  // src/Web/package.json
  { "name": "sipat-online-web-workspace", "private": true,
    "workspaces": ["SipatOnline.Web", "SipatVideoPlayer"],
    "scripts": { "dev": "npm run dev -w SipatOnline.Web", "build": "npm run build -w SipatOnline.Web",
      "lint": "npm run lint --workspaces", "test": "npm test --workspaces" } }
  // src/Web/SipatVideoPlayer/package.json
  { "name": "@sipat/video-player", "private": true, "version": "0.1.0", "type": "module",
    "exports": { ".": "./src/index.ts" },
    "scripts": { "lint": "tsc --noEmit -p tsconfig.json", "test": "vitest run" },
    "peerDependencies": { "react": "^19.1.1", "react-dom": "^19.1.1" },
    "dependencies": { "media-chrome": "^4.19.5", "lucide-react": "^1.72.0" },
    "devDependencies": { /* mesmas faixas do app: vitest, jsdom, @testing-library/react, @testing-library/jest-dom,
      @testing-library/user-event, @vitejs/plugin-react, typescript, vite, @types/react, @types/react-dom */ } }
  ```
  ```ts
  // src/Web/SipatVideoPlayer/src/index.ts (nesta tarefa)
  export { default as SipatPlayer } from './react/SipatPlayer';
  export type { PlayerMarker, PlayerLock, SipatPlayerProps } from './react/SipatPlayer';
  export * from './core/quality';
  ```
  App: `import { SipatPlayer } from '@sipat/video-player'`; `import type { PlaybackQualitySummary } from '@sipat/video-player'`.
- `SipatPlayer.tsx` ganha na primeira linha `/// <reference path="./mediaChrome.d.ts" />`, para o `tsc` do app enxergar os elementos `media-*`.
- `tsconfig.json` do pacote: as mesmas opções do app, sem `paths`, `include: ["src", "test", "vitest.config.ts"]`. `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: './test/setup.ts'`, `css: true`, plugin react.
- Docker (contexto da raiz, `deploy/nginx/Dockerfile`): `WORKDIR /app`; copia `src/Web/package.json` e `src/Web/package-lock.json` para `./`, os dois `package.json` dos workspaces para as pastas deles; `npm ci`; copia `src/Web/SipatOnline.Web/` e `src/Web/SipatVideoPlayer/`; `npm run build`; o nginx copia de `/app/SipatOnline.Web/dist/`.
- Docker de desenvolvimento: `compose.yaml` `web.build` = `context: ./src/Web`, `dockerfile: SipatOnline.Web/Dockerfile`; o Dockerfile instala na raiz do workspace e termina com `WORKDIR /app/SipatOnline.Web` e o mesmo `CMD`. `src/Web/.dockerignore`: `**/node_modules`, `**/dist`, `**/.vite`.
- CI: `working-directory: src/Web`; `cache-dependency-path: src/Web/package-lock.json`; passos `npm ci`, `npm run lint`, `npm test`, `npm run build`.

- [ ] **Step 1: Write the failing boundary test** (`playerBoundary.test.ts`, lê arquivos com `node:fs`/`node:path` a partir de `process.cwd()`)

```ts
it('keeps the player package free of app imports')
  // todo .ts/.tsx em ../SipatVideoPlayer/src e ../SipatVideoPlayer/playground (se existir): nenhum import começa com '@/',
  // nenhum contém 'SipatOnline.Web', e todo import relativo resolve dentro de ../SipatVideoPlayer
it('keeps the player core free of React and Media Chrome')
  // arquivos de ../SipatVideoPlayer/src/core: nenhum import de 'react', 'react-dom', 'media-chrome', 'lucide-react' ou '../react'
it('uses the player only through its package entry')
  // arquivos do app: nenhum import de '@sipat/video-player/' (caminho profundo) nem de '../SipatVideoPlayer'
```

- [ ] **Step 2: Run to verify it fails**

Run (em `src/Web/SipatOnline.Web`): `npm test -- src/playerBoundary.test.ts`
Expected: FAIL (a pasta do pacote não existe)

- [ ] **Step 3: Create the workspace, move the files, fix imports**

Em `src/Web`: criar os `package.json`, `git mv` dos arquivos, apagar o lockfile antigo e rodar `npm install` (gera `src/Web/package-lock.json`).

- [ ] **Step 4: Run everything from the workspace root**

Run (em `src/Web`): `npm ci && npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist`
Expected: PASS; o número de testes do app + pacote é igual ao de antes da tarefa mais os 3 novos

- [ ] **Step 5: Update Docker and CI, and verify the images**

Run (na raiz): `docker build --file deploy/nginx/Dockerfile --tag sipat-online-web:etapa2 .` e `docker compose build web`
Expected: as duas imagens terminam sem erro

- [ ] **Step 6: Commit**

```bash
git add src/Web deploy/nginx/Dockerfile compose.yaml .dockerignore .github/workflows/ci.yml
git commit -m "build(web): npm workspace with the video player as its own package, same behaviour"
```

---

### Task 7: Core: cobertura, regras e agenda de salvamento

Regras tiradas de `LearningTrackPage.tsx` (`handlePlaying`, `handleTimeUpdate`, `handleSeeking`, `persistPlayback`) e do `Scrubber`, em TypeScript puro. A tela ainda não usa nada daqui.

**Files:**
- Create: `src/Web/SipatVideoPlayer/src/core/events.ts`, `coverage.ts`, `rules.ts`, `saveSchedule.ts`
- Modify: `src/Web/SipatVideoPlayer/src/index.ts`
- Test: `src/Web/SipatVideoPlayer/test/core/coverage.test.ts`, `rules.test.ts`, `saveSchedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // events.ts
  export type SaveReason = 'interval' | 'pause' | 'hidden' | 'leave' | 'seeked' | 'ended';
  export interface WatchedRange { startMs: number; endMs: number }
  export type PlayerErrorKind = 'network' | 'decode' | 'source';
  export type PlayerEvent =
    | { type: 'range'; range: WatchedRange }                    // um trecho contínuo terminou (informativo)
    | { type: 'save'; reason: SaveReason; positionMs: number; range: WatchedRange | null }
    | { type: 'seekBlocked' }
    | { type: 'checkpoint'; id: string }
    | { type: 'playing' } | { type: 'paused' } | { type: 'ended' }
    | { type: 'error'; kind: PlayerErrorKind };
  // a Task 9 acrescenta { type: 'quality'; summary: PlayerQualitySummary; reason: FlushReason }
  // a Task 15 acrescenta { type: 'qualityChange'; quality: SourceQuality; automatic: boolean }
  /** Para 'save', a tela devolve uma Promise: true = salvo (o core avança o início da faixa). */
  export type PlayerEventHandler = (event: PlayerEvent) => void | Promise<boolean>;
  // coverage.ts
  export interface Coverage {
    readonly furthestS: number;
    onPlaying(currentS: number): void;          // começa faixa se não há uma ou se o último ponto está a > 0,5 s
    onTimeUpdate(currentS: number): void;       // salto > 5 s ou volta no tempo: recomeça a faixa (sem salvar, como hoje); senão avança furthest
    onSeeking(currentS: number): WatchedRange | null;   // fecha a faixa no último ponto e recomeça em currentS
    open(positionS: number): WatchedRange | null;       // [início, posição] da faixa aberta
    commit(range: WatchedRange): void;          // depois de salvo: se o início ainda é range.startMs, passa a ser range.endMs
  }
  export function createCoverage(furthestS: number): Coverage;
  // rules.ts
  export interface PlayerRules { watchInOrder?: boolean; fixedSpeed?: boolean }
  export function clampSeek(targetS: number, unlockedS: number): { seconds: number; blocked: boolean };  // blocked = target > unlocked + 0.25
  export function unlockedSeconds(rules: PlayerRules, furthestS: number, currentS: number, durationS: number): number;
     // sem watchInOrder = duration; senão min(duration, max(furthest, current))
  export function bounceNativeSeek(rules: PlayerRules, currentS: number, furthestS: number): number | null;  // > furthest + 1 → furthest
  export function enforcedRate(rules: PlayerRules, rate: number): number;   // fixedSpeed → 1
  // saveSchedule.ts
  export const SAVE_INTERVAL_MS = 10_000;
  export const MIN_INTERVAL_RANGE_MS = 8_000;
  export function planSave(input: { reason: SaveReason; positionMs: number; range: WatchedRange | null; lastSavedPositionMs: number }):
    { positionMs: number; range: WatchedRange | null } | null;
  ```
  `planSave` repete `persistPlayback`: `force = reason !== 'interval'`; tem faixa se `end - start >= (force ? 1 : 1000)`; mudou a posição se `|pos - último| >= (force ? 1 : 1000)`; nem faixa nem posição → `null`; `!force` com faixa < 8000 ms → `null`; a faixa sai `null` quando não conta.

- [ ] **Step 1: Write the failing tests** (sem DOM)

```ts
// coverage.test.ts
it('advances what was watched only while playing continuously')       // furthest 0; onPlaying(0); onTimeUpdate(3) → furthestS 3
it('starts a new range after a jump of more than five seconds')        // 0 → 3 → 9.5: open(10) = { startMs: 9500, endMs: 10000 }
it('starts a new range when time goes backwards')                       // 4 → 2: open(3) = { 2000, 3000 }
it('closes the range at the last sample when seeking')                  // 0 → 4, onSeeking(1) → { 0, 4000 }; open(2) = { 1000, 2000 }
it('moves the range start forward only after a successful save')        // commit({0,9000}) → open(10).startMs 9000; commit de faixa velha não mexe
it('keeps the range when playing resumes near the last sample')         // onPlaying em 3.2 depois de 3 → mesmo início
// rules.test.ts
it('blocks a seek beyond what was unlocked')                            // clampSeek(40, 12) → { 12, true }; clampSeek(12.2, 12) → { 12.2, false }
it('unlocks the whole video without the watch-in-order rule')
it('sends a native seek back to what was watched')                      // bounceNativeSeek({watchInOrder:true}, 40, 2.4) → 2.4; (…, 3, 2.4) → null
it('keeps the speed at 1x when the rule is on')                         // enforcedRate({fixedSpeed:true}, 2) → 1; sem regra → 2
// saveSchedule.test.ts
it('skips interval saves until the range reaches 8 seconds')            // interval, range 0..5000 → null; 0..9000 → range 0..9000
it('saves any range when forced')                                       // pause, range 4700..5000 → range kept
it('saves only the position when there is no range')                    // seeked, range null, pos 1000, last 4000 → { 1000, null }
it('does nothing when nothing changed')                                 // interval, null, pos == last → null
```

- [ ] **Step 2: Run to verify they fail**

Run (em `src/Web`): `npm test -w @sipat/video-player -- test/core` → FAIL (módulos inexistentes)

- [ ] **Step 3: Implement the four modules and export them from `index.ts`**

- [ ] **Step 4: Run to verify they pass, then commit**

Run: `npm test -w @sipat/video-player && npm run lint` → PASS

```bash
git add src/Web/SipatVideoPlayer
git commit -m "feat(player): coverage, seek lock, fixed speed and save schedule as pure rules"
```

---

### Task 8: Componente `<SipatVideoPlayer>`, pontos de atividade e a prévia

**Files:**
- Create: `src/Web/SipatVideoPlayer/src/core/checkpoints.ts`, `src/Web/SipatVideoPlayer/src/core/attach.ts`
- Create: `src/Web/SipatVideoPlayer/src/react/SipatVideoPlayer.tsx`, `react/Scrubber.tsx`, `react/texts.ts`
- Move (`git mv`): `react/SipatPlayer.css` → `react/SipatVideoPlayer.css`
- Modify: `react/SipatPlayer.tsx` vira um invólucro fino sobre o novo `Scrubber` e `texts`, com as mesmas props de hoje, porque a tela do Dia ainda o usa; ele é apagado na Task 9
- Modify: `src/Web/SipatOnline.Web/src/VideoPreview.tsx` (usa `SipatVideoPlayer` com `checkpoints` + `activity`; apaga a lógica de pausa própria), `src/Web/SipatOnline.Web/src/learning/DayPage.css` (recebe as regras `.sipat-player-filling .learning-page`, `.portal-content`, `.learning-player-frame` que hoje estão no CSS do player)
- Test: `src/Web/SipatVideoPlayer/test/core/checkpoints.test.ts`, `test/core/attach.test.ts`, `test/react/SipatVideoPlayer.test.tsx`; `src/Web/SipatOnline.Web/src/playerBoundary.test.ts` (novo `it`)

**Interfaces:**
- Consumes: Task 7.
- Produces:
  ```ts
  // checkpoints.ts
  export interface Checkpoint { id: string; seconds: number; title: string; done: boolean }
  export interface CheckpointWatcher {
    due(checkpoints: Checkpoint[], currentS: number, playing: boolean, seeking: boolean): Checkpoint | null; // não feito, não disparado, seconds <= current
    fire(id: string): void;
    rewind(checkpoints: Checkpoint[], currentS: number): void;   // reopenOnRewind: desfaz os disparados com seconds > current + 1
    fired(): ReadonlySet<string>;
  }
  export function createCheckpointWatcher(options: { reopenOnRewind: boolean }): CheckpointWatcher;
  export function watchCheckpoints(video: HTMLVideoElement, options: { checkpoints: () => Checkpoint[];
    reopenOnRewind: boolean; onDue: (checkpoint: Checkpoint) => void }): () => void;   // liga em timeupdate; devolve o desligar
  // attach.ts
  export interface AttachOptions { rules?: PlayerRules; resumeAt?: number; furthest?: number;
    checkpoints?: () => Checkpoint[]; pauseAtCheckpoints?: boolean /* padrão true */; reopenOnRewind?: boolean /* padrão true */;
    onEvent: PlayerEventHandler; }
  export interface AttachedPlayer {
    unlocked(): number;                    // segundos liberados (Scrubber)
    seekTo(seconds: number): void;         // aplica clampSeek; bloqueado → emite seekBlocked
    requestSave(reason: SaveReason): Promise<boolean>;
    resumeAfterActivity(): void;           // fecha a atividade e volta a tocar
    detach(): void;
  }
  export function attachPlayer(video: HTMLVideoElement, options: AttachOptions): AttachedPlayer;
  // react/SipatVideoPlayer.tsx
  export interface VideoSource { src: string; quality?: '720p' | '480p'; type?: string }
  export interface SipatVideoPlayerHandle { requestSave(reason: SaveReason): Promise<boolean>; play(): Promise<void>; pause(): void }
  export interface SipatVideoPlayerProps {
    sources: VideoSource[]; title: string; rules?: PlayerRules; resumeAt?: number; furthest?: number;
    checkpoints?: Checkpoint[]; pauseAtCheckpoints?: boolean; activity?: ReactNode; onEvent?: PlayerEventHandler;
    preload?: 'none' | 'metadata'; videoRef?: RefObject<HTMLVideoElement | null>; ref?: Ref<SipatVideoPlayerHandle>;
  }
  export default function SipatVideoPlayer(props: SipatVideoPlayerProps): JSX.Element;
  // react/texts.ts — todos os textos atuais do player e da prévia, ex.:
  export const texts = { position: 'Posição do vídeo', watchToUnlock: 'Assista para liberar', fullscreen: 'Tela cheia',
    exitFullscreen: 'Sair da tela cheia', activitiesDone: 'atividades deste vídeo concluídas',
    unsupported: 'Seu navegador não oferece suporte à reprodução deste vídeo.',
    loadFailed: 'Não foi possível carregar o vídeo. Verifique sua conexão e tente novamente.', retry: 'Tentar de novo' } as const;
  ```
- Comportamento de `attachPlayer` (liga os eventos do `<video>` ao core; mesmos efeitos de hoje):
  - `loadedmetadata`: `0 < resumeAt < duration` → `currentTime = resumeAt`; `fixedSpeed` → `playbackRate = 1`. `ratechange` → `enforcedRate`.
  - `playing` → `coverage.onPlaying`, emite `playing`; `timeupdate` (tocando, sem `seeking`) → `coverage.onTimeUpdate` e pontos de atividade; `seeking` → `bounceNativeSeek` (volta e `seekBlocked`) ou fecha a faixa e `requestSave('seeked')` com ela; `seeked` → `requestSave('seeked')`; `pause` → `paused` + `requestSave('pause')`; `ended` → `requestSave('ended')` e, depois de resolvido, `ended`; `error` → `error` com `code` 2 network, 3 decode, outro source; `visibilitychange` para `hidden` → `requestSave('hidden')`; intervalo de 10 s → `requestSave('interval')`.
  - `requestSave(reason)`: `planSave` com a faixa aberta; `null` → resolve `true` sem evento; senão emite `save` e, se o handler devolver `true`, `coverage.commit(range)` e guarda a posição salva. Quando uma faixa contínua termina, emite também `range`.
  - Pontos de atividade (`pauseAtCheckpoints`): no ponto, `pause()`, `fire(id)`, emite `checkpoint`; o componente mostra `activity` por cima até a tela chamar o fechamento (`resumeAfterActivity`) — na prévia, pelo `onClose` do jogo.
  - Erro de carregamento: o componente mostra `texts.loadFailed` com o botão `texts.retry` (recarrega a fonte, `video.load()`).
- CSS: toda cor do `SipatVideoPlayer.css` vira variável `--sipat-player-*` declarada em `.sipat-player` (`--sipat-player-accent`, `--sipat-player-signal`, `--sipat-player-surface`, `--sipat-player-text`, `--sipat-player-track`, `--sipat-player-unlocked`, `--sipat-player-marker`), com os valores atuais como padrão; `--player-*` some.
- O `<video>` continua com `aria-label={title}`, `slot="media"`, `playsInline`, `disablePictureInPicture`, `preload`, sem `controls`.

- [ ] **Step 1: Write the failing tests**

```ts
// checkpoints.test.ts
it('is due once the video reaches the moment while playing')     // seconds 5: due(…, 5.1, true, false) → cp; seeking → null; pausado → null
it('does not fire again while playing on')                         // fire('a') → due(…, 8) null
it('fires again after rewinding before it, when asked to')         // reopenOnRewind true: rewind(…, 3) → due(…, 5.2) = cp
it('never reopens a done checkpoint')                              // done true → null mesmo depois de rewind
// attach.test.ts (HTMLVideoElement do jsdom, eventos com dispatchEvent, fake timers)
it('emits save with the watched range on pause and commits it when the page saved')
it('keeps the range when the page could not save')                 // handler → false; próxima pausa reenvia desde 0
it('sends a native seek beyond the unlocked point back and reports it')
it('pauses at a checkpoint and reports it')                        // pauseAtCheckpoints true
it('only reports checkpoints for markers when told not to pause')  // pauseAtCheckpoints false → nenhum checkpoint emitido
it('stops listening when detached')
// SipatVideoPlayer.test.tsx
it('renders our controls over the video with the title as its label')
it('shows the activity over the paused video at its checkpoint and resumes when it closes')
it('offers a retry when the video fails to load')                  // dispatch 'error' → texto loadFailed + botão "Tentar de novo"
it('stops the End key at what was already watched')                // rules.watchInOrder, furthest 10
// playerBoundary.test.ts
it('keeps colors in the player stylesheet as --sipat-player variables')   // fora das declarações --sipat-player-*, nenhum #hex nem rgb(
```

Os testes atuais da prévia (`VideoPreview.test.tsx`) e do `SipatPlayer` continuam passando sem edição.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @sipat/video-player -- test/core/checkpoints.test.ts test/core/attach.test.ts test/react/SipatVideoPlayer.test.tsx` → FAIL

- [ ] **Step 3: Implement checkpoints, attach, the component, Scrubber, texts and the CSS variables**

- [ ] **Step 4: Switch `VideoPreview` to `SipatVideoPlayer`**

`<SipatVideoPlayer sources={[{ src }]} title={title} preload={preload} checkpoints={…} activity={active && <GameStage …><GamePlayer …/></GameStage>} onEvent={…} />`: no `checkpoint`, a prévia guarda o jogo ativo; ao fechar o jogo, chama o fechamento do player. Sem `rules` (livre). Apagar `onTimeUpdate`, `fired` e a tela de erro própria.

- [ ] **Step 5: Run everything, then commit**

Run (em `src/Web`): `npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist` → PASS (inclusive `VideoPreview.test.tsx` sem edição)

```bash
git add src/Web
git commit -m "feat(player): SipatVideoPlayer component with checkpoints and an activity slot; the preview uses it"
```

---

### Task 9: A tela do Dia passa a usar o player por eventos

`LearningTrackPage` fica só com: buscar a sessão de vídeo, salvar na API, mensagens de "salvo"/erro, navegação, expiração da sessão e "salvar antes de sair por um link". A medição de qualidade se muda para dentro do player.

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/learning/LearningTrackPage.tsx`
- Modify: `src/Web/SipatOnline.Web/src/LearningActivitiesPanel.tsx` (detecção de atividade por tempo via `watchCheckpoints` do pacote)
- Modify: `src/Web/SipatVideoPlayer/src/core/quality.ts` (resumo sem dados do app), `src/core/attach.ts` (liga o medidor), `src/index.ts` (sai `SipatPlayer`; entram `SipatVideoPlayer` e os tipos)
- Delete: `src/Web/SipatVideoPlayer/src/react/SipatPlayer.tsx` (o invólucro da Task 8)
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`sendPlaybackQuality` recebe o resumo do app)
- Test: `src/Web/SipatVideoPlayer/test/core/attach.test.ts`, `test/core/quality.test.ts`, `test/react/SipatPlayer.test.tsx` → renomear para `test/react/Fullscreen.test.tsx` montando `SipatVideoPlayer` (mesmas asserções)

**Interfaces:**
- Consumes: Tasks 7 e 8.
- Produces:
  ```ts
  // core/quality.ts — o pacote não conhece aula nem sessão da API
  export type PlayerQualitySummary = Omit<PlaybackQualitySummary, 'lessonId' | 'playbackSessionId'>;
  export function trackPlaybackQuality(video: HTMLVideoElement, options: { quality: QualityLabel;
    environment?: PlaybackEnvironment; onReport: (summary: PlayerQualitySummary, reason: FlushReason) => void }): QualityTracker;
  // PlaybackQualitySummary (com lessonId e playbackSessionId) passa a ser declarado no app, em api.ts:
  export interface PlaybackQualitySummary extends PlayerQualitySummary { lessonId: string; playbackSessionId: string }
  ```
  `events.ts` ganha a variante `{ type: 'quality'; summary: PlayerQualitySummary; reason: FlushReason }`. `attachPlayer` cria o medidor (`quality: 'single'` com uma fonte), emite `{ type: 'quality', summary, reason }` a cada relatório e, em `requestSave('hidden' | 'leave')`, faz `tracker.flush(reason)` **antes** de emitir o `save`. `detach()` faz `tracker.stop()`.
- Tela do Dia:
  ```tsx
  <SipatVideoPlayer key={`${lesson.id}-${session.sessionId}`} ref={playerRef} videoRef={videoRef}
    sources={[{ src: session.url }]} title={lesson.title}
    rules={{ watchInOrder: true, fixedSpeed: true }}
    resumeAt={lesson.lastPlaybackPositionMilliseconds / 1000}
    furthest={lesson.isCompleted ? Number.POSITIVE_INFINITY : lesson.lastPlaybackPositionMilliseconds / 1000}
    checkpoints={markers} pauseAtCheckpoints={false} onEvent={handlePlayerEvent} />
  ```
  - `save` → o mesmo envio de hoje (`recordLearningPlaybackRange` com faixa, `saveLearningPosition` sem faixa), com o mesmo "um de cada vez" (`pendingSaveRef`), a mesma limitação à duração da aula (faixa que fica com menos de 1 ms depois de limitada vira só posição) e as mesmas mensagens; devolve `Promise<boolean>`. Para `reason === 'ended'`, ligar `advanceAfterCompletionRef` antes de enviar.
  - `ended` → a lógica atual de avançar depois de salvo (`handleVideoEnded` sem o `persistPlayback`).
  - `playing` → `setIsPlaying(true)` e a checagem de expiração atual; `paused` → `setIsPlaying(false)`; `seekBlocked` → `setSeekNotice(true)`; `error` → descarta a sessão e mostra a mensagem atual; `quality` → `sendPlaybackQuality(apiTrackId, { ...summary, lessonId, playbackSessionId })`, erros engolidos.
  - Sair por um link: `playerRef.current?.pause()` e `await playerRef.current?.requestSave('leave')` no lugar de `qualityTrackerRef.flush` + `persistPlayback(true)`. Trocar de vídeo: `requestSave('pause')`. O `visibilitychange` sai da tela (o player cuida).
  - Saem da tela: `rangeStartRef`, `lastSampleRef`, `furthestRef`, `handleTimeUpdate`, `handleSeeking`, `handleLoadedMetadata`, o `setInterval` de 10 s, `qualityTrackerRef` e o efeito do medidor.
- `LearningActivitiesPanel`: o efeito de `timeupdate` das atividades com tempo passa a usar `watchCheckpoints(video, { checkpoints: () => …, reopenOnRewind: false, onDue: item => open(…) })` com `done = !!outcome || opened.has(id)`. A lógica de "antes/depois do vídeo" (`afterVideoCount`) fica como está. Os jogos continuam abrindo pelo painel (o `activity` do player não é usado no Dia).

- [ ] **Step 1: Write the failing package tests**

```ts
// attach.test.ts
it('reports quality summaries without app data')                 // evento quality sem lessonId/playbackSessionId
it('flushes quality before saving when the tab is hidden or the page is left')   // ordem dos eventos: quality, save
// quality.test.ts: os testes existentes passam a criar o medidor sem lessonId/playbackSessionId; asserções iguais
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @sipat/video-player -- test/core` → FAIL

- [ ] **Step 3: Implement the package changes, then rewire `LearningTrackPage` and `LearningActivitiesPanel`**

- [ ] **Step 4: Run everything**

Run (em `src/Web`): `npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist`
Expected: PASS, com `LearningPage.test.tsx`, `LearningActivitiesPanel.test.tsx` e `VideoPreview.test.tsx` **sem nenhuma edição** (`git diff --stat feat/video-go-live -- src/Web/SipatOnline.Web/src/LearningPage.test.tsx` mostra só os `it` da Task 5)

- [ ] **Step 5: Commit**

```bash
git add src/Web
git commit -m "refactor(learning): the day page talks to the player through events; quality is measured inside the player"
```

---

### Task 10: Playground (`npm run player`)

**Files:**
- Create: `src/Web/SipatVideoPlayer/playground/index.html`, `playground/main.tsx`, `playground/PlaygroundApp.tsx`, `playground/samples.ts`, `src/Web/SipatVideoPlayer/vite.playground.config.ts`
- Modify: `src/Web/SipatVideoPlayer/package.json` (`"playground": "vite --config vite.playground.config.ts"`; `vitest.config.ts` inclui `playground/**/*.test.tsx`), `src/Web/package.json` (`"player": "npm run playground -w @sipat/video-player"`), `src/Web/SipatVideoPlayer/tsconfig.json` (`include` + `playground`)
- Test: `src/Web/SipatVideoPlayer/playground/PlaygroundApp.test.tsx`

**Interfaces:**
- Consumes: `SipatVideoPlayer`, `PlayerEvent` (Tasks 7-9).
- Produces: `export default function PlaygroundApp(): JSX.Element;` e `export const samples: { id: string; title: string; src: string }[]` com os vídeos públicos já usados pelo `DevelopmentSampleVideoProvider` (MDN `flower.mp4` e o `.webm` de ergonomia da Wikimedia), mais "Arquivo do computador" (`<input type="file" accept="video/*">` → `URL.createObjectURL`).
- Página: escolha do vídeo; caixas "Assistir em ordem" e "Velocidade fixa"; campos "Retomar em (s)" e "Liberado até (s)"; "Adicionar ponto de atividade" (segundos + título) com uma atividade de exemplo ("Atividade de exemplo" e o botão "Concluir" que fecha); registro dos eventos na tela (mais novo em cima, no máximo 200, com hora e JSON curto); o último resumo de qualidade em destaque; nota "Para provocar travamentos, use DevTools → Network → Slow 4G.". Servidor: `host 127.0.0.1`, porta `5199`, `strictPort`, `root: 'playground'`.

- [ ] **Step 1: Write the failing tests**

```ts
it('logs the events the player emits')                 // dispatch 'playing' no <video> → item "playing" no registro
it('turns the watch-in-order rule on and off')         // liberado 10 s, duration 60: com a regra, End → 10; sem a regra, End → 60
it('opens the sample activity at its checkpoint')      // ponto em 5 s; timeupdate em 5.1 tocando → "Atividade de exemplo" visível
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w @sipat/video-player -- playground` → FAIL

- [ ] **Step 3: Implement the playground**

- [ ] **Step 4: Verify it runs**

Run (em `src/Web`): `npm run player` (em segundo plano), abrir `http://127.0.0.1:5199`, tocar o vídeo da MDN e ver `playing`, `save` e `quality` no registro; parar o servidor.
Expected: página abre, o vídeo toca, os eventos aparecem

- [ ] **Step 5: Run everything, then commit**

Run: `npm run lint && npm test` → PASS (o teste de fronteira cobre `playground/`)

```bash
git add src/Web
git commit -m "feat(player): playground to develop the player without the app"
```

---

### Task 11: Armazenamento com duas versões (720p e 480p) e o conversor ffmpeg

**Files:**
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/IPlatformCourseVideoStorage.cs`
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/VideoRendition.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/FilePlatformCourseVideoStorage.cs`, `R2PlatformCourseVideoStorage.cs`, `CatalogVideoCopier.cs`, e os chamadores (`PlatformCourseCatalogService.OpenVideoAsync`, `LearningEngagementEndpoints.cs` `/media`, `PlatformCourseCatalogEndpoints.cs` `/file`, `CatalogVideoPlaybackProvider.CreateSessionAsync`) passando `VideoRendition.Hd720`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/FfmpegVideoTranscoder.cs`
- Create: `tests/SipatOnline.IntegrationTests/FfmpegFactAttribute.cs`
- Test: `tests/SipatOnline.IntegrationTests/R2PlatformCourseVideoStorageTests.cs`, `tests/SipatOnline.IntegrationTests/FilePlatformCourseVideoStorageTests.cs` (novo), `tests/SipatOnline.IntegrationTests/FfmpegVideoTranscoderTests.cs`, `CatalogVideoCopierTests.cs` (imagem MinIO)

**Interfaces:**
- Produces:
  ```csharp
  public enum VideoRendition { Hd720, Sd480 }
  // IPlatformCourseVideoStorage (SaveAsync continua igual e grava a 720p)
  Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken);
  Task<Uri?> GetPlaybackUrlAsync(Guid videoId, VideoRendition rendition, TimeSpan validFor, CancellationToken cancellationToken);
  Task SaveRenditionAsync(Guid videoId, VideoRendition rendition, string filePath, CancellationToken cancellationToken); // mp4 pronto, sem checagem de tamanho
  Task DeleteAsync(Guid videoId, CancellationToken cancellationToken);   // apaga as duas versões
  // R2PlatformCourseVideoStorage
  public static string KeyFor(Guid videoId, VideoRendition rendition); // videos/{N}/720p.mp4 | videos/{N}/480p.mp4
  // FfmpegVideoTranscoder (Infrastructure)
  public sealed class VideoConversionOptions   // seção "SipatOnline:VideoConversion"
  { bool Enabled; string WorkPath; string FfmpegPath = "ffmpeg"; string FfprobePath = "ffprobe";
    TimeSpan Timeout = 1h; bool RunInBackground = true; public const string SectionName = "SipatOnline:VideoConversion"; }
  public sealed record TranscodeResult(bool Succeeded, string? Error);
  public sealed class FfmpegVideoTranscoder(VideoConversionOptions options)
  {
      public static IReadOnlyList<string> ArgumentsFor(string inputPath, string outputPath, VideoRendition rendition);
      public Task<TranscodeResult> TranscodeAsync(string inputPath, string outputPath, VideoRendition rendition, CancellationToken cancellationToken);
      public Task<long?> ProbeDurationMillisecondsAsync(string path, CancellationToken cancellationToken); // ffprobe format=duration
  }
  ```
  `TranscodeAsync`: `Process` com `ArgumentList`, logo após `Start()` `PriorityClass = ProcessPriorityClass.Idle` (ignorar exceção se o SO recusar); `Timeout` → mata o processo e devolve falha; código ≠ 0 → falha com as últimas 500 letras do stderr; nunca lança.
- Arquivo local: `Hd720` → `{N}.video` (como hoje), `Sd480` → `{N}.480p.video`.
- Ajustes de teste da Etapa 1 que entram aqui: `MinioBuilder("cgr.dev/chainguard/minio@sha256:<digest>")` nos dois testes, com o digest obtido por `docker pull cgr.dev/chainguard/minio:latest` + `docker inspect --format '{{index .RepoDigests 0}}' cgr.dev/chainguard/minio:latest`, numa constante `TestImages.Minio` em `tests/SipatOnline.IntegrationTests/TestImages.cs`.

- [ ] **Step 1: Write the failing tests**

```csharp
// FfmpegVideoTranscoderTests ([Fact], sem ffmpeg)
Arguments_for_720p_match_the_library_format()
  // contém, em sequência: "-hide_banner","-nostdin","-y","-i",input; "-vf","scale=-2:'min(720,trunc(ih/2)*2)'";
  // "-c:v","libx264","-profile:v","high","-pix_fmt","yuv420p","-preset","veryfast","-b:v","2M","-maxrate","2500k","-bufsize","4M";
  // "-c:a","aac","-b:a","128k","-movflags","+faststart", output por último
Arguments_for_480p_are_lighter()   // "main", "1M", "1250k", "2M", "96k", "min(480,trunc(ih/2)*2)"
// FfmpegVideoTranscoderTests ([FfmpegFact]: pula se `ffmpeg -version` falhar)
Converts_a_small_video_to_both_renditions()
  // gera 2 s de vídeo 1280x720 com `ffmpeg -f lavfi -i testsrc=duration=2:size=1280x720:rate=25 -f lavfi -i sine=duration=2`;
  // 720p e 480p → Succeeded; ffprobe da 480p: height 480; ProbeDurationMillisecondsAsync ≈ 2000 (±150)
Reports_a_failure_without_throwing()   // entrada com bytes aleatórios → Succeeded false, Error não vazio
// R2PlatformCourseVideoStorageTests ([DockerFact])
Keeps_both_renditions_apart()   // SaveRenditionAsync 720p e 480p com bytes diferentes → cada OpenReadAsync devolve os seus; DeleteAsync apaga as duas
Signs_a_url_per_rendition()     // GetPlaybackUrlAsync(id, Sd480, 2h) termina em "/480p.mp4" antes da query
Key_layout_is_stable()          // KeyFor(0f8fad5b-…, Sd480) == "videos/0f8fad5bd9cb469fa16570867728950e/480p.mp4"
// FilePlatformCourseVideoStorageTests ([Fact], pasta temporária)
Keeps_both_renditions_apart()   // mesmos passos; arquivos "{N}.video" e "{N}.480p.video"
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter "FullyQualifiedName~FfmpegVideoTranscoderTests|FullyQualifiedName~PlatformCourseVideoStorageTests"` → FAIL

- [ ] **Step 3: Implement the rendition-aware storage, the transcoder and the pinned MinIO image; update the callers**

- [ ] **Step 4: Run the tests**

Run: `dotnet test SipatOnline.slnx` → PASS (os testes da Etapa 1 de R2, cópia e reprodução seguem verdes)

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(video): 720p and 480p renditions in storage and an ffmpeg transcoder at low priority"
```

---

### Task 12: Conversão automática no envio (fila, "processando", Dia) e ADR-002

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/IVideoConversionQueue.cs`
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/PlatformCourseCatalog.cs` (`PlatformVideoStatus`; campos novos em `PlatformCourseVideo`), `PlatformCourseCatalogService.cs` (`AddVideoAsync`, `GetVideoFileAsync`), `SipatPrograms.cs` (`ProgramDayRules.CleanAsync`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionJobEntity.cs` (+ configuração), `EfVideoConversionQueue.cs`, `VideoConversionProcessor.cs`, `VideoConversionWorker.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlatformCourseEntity.cs` e `PlatformCourseEntityConfiguration.cs` (colunas do vídeo), `EfPlatformCourseCatalogStore.cs` (mapeamento), `PlatformDbContext.cs`, `InfrastructureServiceCollectionExtensions.cs`, `CatalogVideoPlaybackProvider.cs` (vídeo que não está pronto → indisponível)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261122100000_AddVideoConversion.cs` (+ `.Designer.cs`, snapshot)
- Modify: `src/Api/SipatOnline.Api/Endpoints/PlatformCourseCatalogEndpoints.cs` (resposta com `status`/`processingError`; rota `/file` usa `GetVideoFileAsync`), `src/Api/SipatOnline.Api/Program.cs` (comando `--convert-catalog-videos`)
- Modify: `Dockerfile`, `Dockerfile.local` (`ffmpeg` no `apt-get install`), `compose.yaml`, `deploy/compose.production.yaml` (volume `video-work`, variáveis), `deploy/.env.production.example`, `deploy/CLOUDFLARE-VM.md` (seção 5: o envio converte sozinho; `--convert-catalog-videos` para os vídeos antigos)
- Create: `docs/architecture/ADR-002-entrega-de-video-r2.md`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/DevelopmentCatalogVideoProvider.cs` (mesma recusa de vídeo não pronto)
- Test: `tests/SipatOnline.IntegrationTests/VideoConversionApiTests.cs`

**Interfaces:**
- Consumes: `FfmpegVideoTranscoder`, `VideoConversionOptions`, `IPlatformCourseVideoStorage.SaveRenditionAsync` (Task 11).
- Produces:
  ```csharp
  public enum PlatformVideoStatus { Ready, Processing, Failed }
  public sealed record PlatformCourseVideo(/* campos atuais */, …,
      PlatformVideoStatus Status = PlatformVideoStatus.Ready, string? ProcessingError = null, bool HasSd480 = false);
  public interface IVideoConversionQueue
  {
      bool IsEnabled { get; }
      Task<Result<StoredPlatformVideo>> SaveSourceAsync(Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken);
      Task EnqueueAsync(Guid videoId, CancellationToken cancellationToken);      // grava a linha da fila (na transação de quem chama)
      Task DiscardSourceAsync(Guid videoId, CancellationToken cancellationToken);
  }
  // PlatformCourseCatalogService
  public Task<Result<PlatformVideoFile>> GetVideoFileAsync(Guid videoId, CancellationToken cancellationToken);
  public sealed record PlatformVideoFile(Uri? RedirectTo, Stream? Content, string ContentType);  // pergunta o link antes de abrir o objeto
  // Infrastructure
  public sealed class VideoConversionProcessor(PlatformDbContext db, IPlatformCourseVideoStorage storage,
      FfmpegVideoTranscoder transcoder, VideoConversionOptions options, TimeProvider clock, ILogger<VideoConversionProcessor> logger)
  {
      public Task<int> RequeueInterruptedAsync(CancellationToken cancellationToken); // Running → Pending (na partida)
      public Task<bool> ProcessNextAsync(CancellationToken cancellationToken);        // false = fila vazia
      public Task<int> EnqueueMissingSd480Async(CancellationToken cancellationToken); // comando --convert-catalog-videos
  }
  public sealed class VideoConversionWorker(IServiceScopeFactory scopes, VideoConversionSignal signal, ILogger<VideoConversionWorker> logger) : BackgroundService;
  public sealed class VideoConversionSignal { public void Notify(); public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken); }
  ```
- Tabela `learning."VideoConversionJobs"`: `Id` (Guid), `VideoId`, `Status` (texto ≤ 16: `Pending`/`Running`/`Done`/`Failed`), `Attempts` (int), `Error` (≤ 2000, nulo), `CreatedAt`, `StartedAt?`, `FinishedAt?`; índice (`Status`, `CreatedAt`). Colunas novas em `learning."PlatformCourseVideos"`: `Status` (texto ≤ 16, padrão `'Ready'`), `ProcessingError` (≤ 500, nulo), `HasSd480` (bool, padrão `false`). Migration `20261122100000_AddVideoConversion`.
- `AddVideoAsync` com `queue.IsEnabled`: `SaveSourceAsync` (pasta `WorkPath`, mesma validação de tipo, tamanho e assinatura do armazenamento em arquivo — implementar com um `FilePlatformCourseVideoStorage` apontado para `WorkPath`), vídeo com `Status = Processing`, `EnqueueAsync` dentro da transação junto do vídeo e da auditoria; falha → `DiscardSourceAsync`; depois do commit, `VideoConversionSignal.Notify()`. Sem conversão ligada: o fluxo atual, vídeo `Ready`.
- `ProcessNextAsync`: pega o `Pending` mais antigo, `Running` + `Attempts++`; converte 720p e depois 480p em `WorkPath/{N}/`; `SaveRenditionAsync` das duas; vídeo `Ready`, `HasSd480 = true`, `ContentType = "video/mp4"`, `SizeBytes` = tamanho da 720p, `DurationMilliseconds` = `ProbeDurationMillisecondsAsync` (se nulo, mantém); trabalho `Done`; apaga a origem e a pasta de trabalho. Falha: trabalho `Failed` com o erro; vídeo que estava `Processing` fica `Failed` com `ProcessingError` (≤ 500 letras); vídeo já `Ready` (reconversão) continua `Ready`; nunca lança para o worker.
- Worker: na partida `RequeueInterruptedAsync`; laço: `ProcessNextAsync` até `false`, depois `signal.WaitAsync(30 s)`. Registrado só com `Enabled && RunInBackground`.
- `--convert-catalog-videos`: com conversão ligada, copia a 720p atual de cada vídeo `Ready` sem `HasSd480` para a origem em `WorkPath` e enfileira; imprime "N vídeos na fila de conversão." e sai (a API em execução converte). Sem conversão ligada: "Ligue SipatOnline:VideoConversion:Enabled antes de converter." e código 1.
- Dia: em `ProgramDayRules.CleanAsync`, vídeo com `Status != Ready` → `learning.program.video_processing`, "O vídeo \"{título}\" ainda está sendo preparado e não pode entrar num Dia." (vale para programas e planos, que usam a mesma regra). `CatalogVideoPlaybackProvider`: vídeo não pronto → `learning.video_asset_unavailable` "Este vídeo ainda está sendo preparado.".
- Rota `/file` do operador: `GetVideoFileAsync` pergunta `GetPlaybackUrlAsync` **antes** de abrir o objeto (fim do `GetObject` a mais); vídeo `Processing` → 409 `learning.platform_course.video_processing` "O vídeo ainda está sendo preparado.".
- Configuração: `SipatOnline__VideoConversion__Enabled: "true"` e `SipatOnline__VideoConversion__WorkPath: /var/sipat/video-work` no `compose.yaml` e no `deploy/compose.production.yaml`, com o volume `video-work` montado nesse caminho; `.env.production.example` explica em português. Sem valor, `Enabled = false` (testes e `dotnet run` sem ffmpeg continuam como hoje).
- ADR-002 (Status: Aceito; Data: data do commit): substitui a parte de entrega do ADR-001. Contexto (custo por participante, 600 simultâneos, Azure Blob ~R$ 1.000 por SIPAT), decisão (VM pequena + R2 com links assinados de 2 h; conversão própria 720p/480p com os parâmetros de Global Constraints; uma por vez, `nice`; `File` como plano B), alternativas (VM servindo MP4, Azure Blob, Mux/Cloudflare Stream) e consequências (imagem da API maior com ffmpeg; HLS depois no próprio R2; confirmar os termos da Cloudflare antes de ligar o R2 em produção).

- [ ] **Step 1: Write the failing integration tests** (`VideoConversionApiTests`, Postgres; `[DockerFact]` + pulo sem ffmpeg nos que convertem; factory com `SipatOnline:VideoConversion:Enabled=true`, `WorkPath` temporário, `RunInBackground=false`; o teste chama `VideoConversionProcessor` por um escopo da factory)

- `Uploads_as_processing_then_converts_to_both_renditions()`: `POST /api/platform/catalog/videos` com o vídeo de 2 s gerado por ffmpeg → 200 com `status == "Processing"`; `GET /videos` lista "Processing"; `ProcessNextAsync` → `true`; agora `status == "Ready"`, `hasSd480 == true`, duração ≈ 2000 ms; `OpenReadAsync(id, Sd480)` não nulo; a pasta da origem em `WorkPath` não existe mais; `ProcessNextAsync` de novo → `false`.
- `Refuses_a_processing_video_in_a_day()`: programa com um Dia contendo o vídeo ainda "processando" → 400 `learning.program.video_processing`; depois de convertido → 200.
- `Resumes_a_job_left_running_by_a_restart()`: trabalho marcado `Running` direto no banco → `RequeueInterruptedAsync` == 1 → `ProcessNextAsync` converte.
- `Marks_a_corrupt_upload_as_failed_and_moves_on()`: envio de um MP4 com cabeçalho `ftyp` válido e o resto aleatório, depois um vídeo bom → o primeiro fica `Failed` com `processingError` não vazio; o segundo fica `Ready`; nenhuma exceção sai do processador.
- `Converts_older_videos_without_taking_them_offline()`: vídeo `Ready` sem 480p → `EnqueueMissingSd480Async` == 1; o vídeo continua `Ready` durante a fila; depois de `ProcessNextAsync`, `hasSd480 == true`.
- `Keeps_uploading_as_before_when_conversion_is_off()`: factory sem `Enabled` → `status == "Ready"` logo no envio.
- `Previews_a_processing_video_as_conflict()`: `GET /videos/{id}/file` de vídeo "processando" → 409.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter VideoConversionApiTests` → FAIL

- [ ] **Step 3: Implement entity, migration, queue, processor, worker, signal, upload flow, Day rule, file route and the command**

Gerar com `dotnet ef migrations add AddVideoConversion --project src/Infrastructure/SipatOnline.Infrastructure --startup-project src/Api/SipatOnline.Api` e renomear para `20261122100000_AddVideoConversion`.

- [ ] **Step 4: Add ffmpeg to the images, the compose settings and the docs; write ADR-002**

Run: `docker build --file Dockerfile --tag sipat-online-api:etapa2 .` e `docker run --rm --entrypoint ffmpeg sipat-online-api:etapa2 -version`
Expected: a imagem builda; `ffmpeg version …` impresso

- [ ] **Step 5: Run the tests**

Run: `dotnet test SipatOnline.slnx` → PASS

- [ ] **Step 6: Commit**

```bash
git add src tests Dockerfile Dockerfile.local compose.yaml deploy docs/architecture/ADR-002-entrega-de-video-r2.md
git commit -m "feat(video): convert every upload to 720p and 480p in the background; processing videos stay out of days"
```

---

### Task 13: Biblioteca mostra "processando" e o planejador não oferece o vídeo

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`PlatformCourseVideo.status`, `processingError`, `hasSd480`)
- Modify: `src/Web/SipatOnline.Web/src/courseCatalog/VideoLibraryPanel.tsx`, `src/Web/SipatOnline.Web/src/PlatformCoursesPage.tsx` (recarrega a biblioteca a cada 15 s enquanto houver vídeo "Processing"; para ao sair da tela)
- Modify: `src/Web/SipatOnline.Web/src/sipatBuilder/model.ts` (`buildCatalog` ignora vídeos que não estão `Ready`)
- Test: `src/Web/SipatOnline.Web/src/PlatformCoursesPage.test.tsx`, `src/Web/SipatOnline.Web/src/sipatBuilder/model.test.ts` (novo, ou no teste do builder que já existir)

**Interfaces:**
- Consumes: resposta da Task 12.
- Produces: `status: 'Ready' | 'Processing' | 'Failed'; processingError: string | null; hasSd480: boolean` em `PlatformCourseVideo`.
- Biblioteca: `Processing` → `Badge` "Processando" e, no lugar da prévia, o texto "Convertendo para 720p e 480p. O vídeo fica disponível para os Dias quando terminar."; `Failed` → `Badge` destrutivo "Falhou" e o `processingError`.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows a processing video without a preview')                 // "Processando" visível; nenhum <video> para ele
it('shows why a conversion failed')
it('refreshes the library while a video is processing')           // fake timers: +15 s → listPlatformLibraryVideos chamado 2 vezes; tudo Ready → para
it('leaves videos that are not ready out of the day planner')    // buildCatalog: vídeo Processing não está em catalog.videos nem em nenhum subject
```

- [ ] **Step 2: Run to verify they fail**

Run (em `src/Web`): `npm test -w SipatOnline.Web -- src/PlatformCoursesPage.test.tsx src/sipatBuilder` → FAIL

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run everything, then commit**

Run: `npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist` → PASS

```bash
git add src/Web
git commit -m "feat(library): show processing and failed conversions; the planner only offers ready videos"
```

---

### Task 14: Sessão de vídeo com as duas fontes; acesso à mídia num serviço

**Files:**
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/LearningTrackCard.cs` (`PlaybackSession.Sources`, `PlaybackSource`)
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/LessonMediaAccess.cs` (`ILessonMediaStore`, `LessonMedia`, `LessonMediaAccessService`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/EfLessonMediaStore.cs` (a consulta que hoje está no endpoint `/media`)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/CatalogVideoPlaybackProvider.cs`, `DevelopmentSampleVideoProvider.cs` (`CreateLocalSession` recebe as fontes), `DevelopmentCatalogVideoProvider.cs` (vídeos do catálogo no desenvolvimento: mesmas fontes `/media` e `/media?quality=480p` do provedor File), `InfrastructureServiceCollectionExtensions.cs`
- Create: `src/Api/SipatOnline.Api/Endpoints/LessonMediaEndpoints.cs` (a rota `/api/learning/lessons/{lessonId}/media` sai de `LearningEngagementEndpoints.cs`)
- Modify: `src/Api/SipatOnline.Api/Endpoints/LearningEngagementEndpoints.cs`, `src/Api/SipatOnline.Api/Program.cs`
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`LearningPlaybackSession.sources`)
- Test: `tests/SipatOnline.IntegrationTests/CatalogPlaybackApiTests.cs`, `tests/SipatOnline.Application.UnitTests/Learning/LessonMediaAccessServiceTests.cs`, `tests/SipatOnline.ArchitectureTests/EndpointDatabaseTests.cs` (+ `LessonMediaEndpoints.cs` na lista)

**Interfaces:**
- Consumes: `VideoRendition`, `HasSd480`, `PlatformVideoStatus` (Tasks 11-12); `PlaybackEvidencePolicy.Accept` (Etapa 1).
- Produces:
  ```csharp
  public sealed record PlaybackSource(string Url, string? Quality);   // "720p" | "480p" | null (versão única)
  public sealed record PlaybackSession(string Url, string? ContentType, DateTimeOffset ExpiresAt, Guid SessionId,
      bool IsDevelopmentDemo, IReadOnlyList<PlaybackSource>? Sources = null);
  public sealed record LessonMedia(Guid VideoId, string ContentType, bool HasSd480);
  public interface ILessonMediaStore
  {   // aula da empresa, da revisão atual da trilha, atribuída ao participante e não revogada; vídeo do catálogo pronto
      Task<LessonMedia?> FindAssignedCatalogMediaAsync(Guid tenantId, Guid participantId, Guid lessonId, CancellationToken cancellationToken);
  }
  public sealed class LessonMediaAccessService(ITenantContext tenantContext, ICurrentActor currentActor, ILessonMediaStore store)
  {
      public Task<Result<LessonMedia>> AuthorizeAsync(Guid lessonId, CancellationToken cancellationToken);
      // sem empresa/participante → learning.forbidden; não achou → learning.lesson_not_found
  }
  ```
  Rota: `GET /api/learning/lessons/{lessonId:guid}/media?quality=720p|480p` (padrão 720p; `480p` sem `HasSd480` → 404) → `AuthorizeAsync`, depois o link assinado (redirect) ou o arquivo, como hoje.
- `CatalogVideoPlaybackProvider`: `Sources` = `[720p, 480p]` quando `HasSd480`, senão `[(url, null)]`; com R2, cada uma é um link assinado de `SessionLifetime + StorageLinkMargin` (como a fonte única de hoje); com File, `/api/learning/lessons/{lessonId:D}/media` e `…/media?quality=480p`. `Url` = a primeira fonte.
- `DevelopmentSampleVideoProvider.VerifyRangeAsync`: a checagem e a junção passam a ser `PlaybackEvidencePolicy.Accept(grant.WatchedRanges, start, end, grant.DurationMilliseconds, grant.StartedAt, grant.ExpiresAt, now)` (mesmo `lock`); o `Merge` privado some. `Sources = [(url, null)]`.
- api.ts: `sources: { url: string; quality: '720p' | '480p' | null }[]` em `LearningPlaybackSession` (opcional na leitura: ausente = `[{ url, quality: null }]`).

- [ ] **Step 1: Write the failing tests**

```csharp
// LessonMediaAccessServiceTests (fakes de ITenantContext, ICurrentActor, ILessonMediaStore)
Refuses_without_a_company_or_participant()        // learning.forbidden
Refuses_a_lesson_that_is_not_assigned()           // store devolve null → learning.lesson_not_found
Returns_the_media_of_an_assigned_lesson()
// CatalogPlaybackApiTests ([DockerFact])
Offers_both_renditions_when_the_video_has_480p()  // HasSd480 = true → sources = [{…/media, "720p"}, {…/media?quality=480p, "480p"}]; GET da 480p com Range → 206
Offers_a_single_source_for_older_videos()         // HasSd480 = false → 1 fonte, quality null; GET …?quality=480p → 404
Refuses_media_of_a_revoked_assignment()           // atribuição revogada → 404 na rota /media
```

Os testes atuais de `LearningApiTests` (provedor de desenvolvimento) continuam passando.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.Application.UnitTests --filter LessonMediaAccessServiceTests` e `dotnet test tests/SipatOnline.IntegrationTests --filter CatalogPlaybackApiTests` → FAIL

- [ ] **Step 3: Implement service, store, route move, sources and the dev provider change**

- [ ] **Step 4: Run the tests, then commit**

Run: `dotnet test SipatOnline.slnx` e (em `src/Web`) `npm run lint && npm test` → PASS

```bash
git add src tests
git commit -m "feat(learning): playback session offers 720p and 480p; media access checked by an application service"
```

---

### Task 15: Escolha de qualidade no player

**Files:**
- Create: `src/Web/SipatVideoPlayer/src/core/sources.ts`
- Modify: `src/Web/SipatVideoPlayer/src/core/attach.ts` (troca de fonte), `src/core/quality.ts` (`setQuality`, `onStall`), `src/core/events.ts`, `src/react/SipatVideoPlayer.tsx` (botão), `src/react/texts.ts`, `src/index.ts`
- Modify: `src/Web/SipatOnline.Web/src/learning/LearningTrackPage.tsx` (passa `sources` da sessão)
- Modify: `src/Web/SipatVideoPlayer/playground/PlaygroundApp.tsx` (duas fontes de exemplo: o mesmo vídeo como "720p" e "480p", para exercitar o botão)
- Test: `src/Web/SipatVideoPlayer/test/core/sources.test.ts`, `test/core/attach.test.ts`, `test/core/quality.test.ts`, `test/react/QualityMenu.test.tsx`, `src/Web/SipatOnline.Web/src/LearningPage.test.tsx` (novo `it`)

**Interfaces:**
- Consumes: `VideoSource`, `attachPlayer`, `trackPlaybackQuality` (Tasks 8-9); `sources` da sessão (Task 14).
- Produces:
  ```ts
  // sources.ts
  export type SourceQuality = '720p' | '480p';
  export type QualityPreference = 'auto' | SourceQuality;
  export const QUALITY_PREFERENCE_KEY = 'sipat-player-quality';
  export interface ConnectionInfo { effectiveType?: string; downlink?: number }
  export function readQualityPreference(storage?: Pick<Storage, 'getItem'>): QualityPreference;   // erro ou valor estranho → 'auto'
  export function saveQualityPreference(value: QualityPreference, storage?: Pick<Storage, 'setItem'>): void; // erros engolidos
  export function chooseSource(sources: VideoSource[], preference: QualityPreference, connection: ConnectionInfo | null): VideoSource;
  export interface DowngradeWatch { recordStall(atMs: number, current: SourceQuality | undefined): boolean; }  // true = descer agora
  export function createDowngradeWatch(options?: { stalls?: number /* 2 */; windowMs?: number /* 60_000 */ }): DowngradeWatch; // dispara uma vez
  // quality.ts
  export interface QualityTracker { flush(reason: FlushReason): void; stop(): void; setQuality(quality: QualityLabel): void }
  // trackPlaybackQuality options ganham: onStall?: (durationMs: number) => void   (chamado ao fim de cada travamento contado)
  ```
  `events.ts` ganha `{ type: 'qualityChange'; quality: SourceQuality; automatic: boolean }`; `VideoSource.quality` passa a ser `SourceQuality`.
  `chooseSource`: uma fonte → ela; preferência disponível → ela; `connection` com `effectiveType` em `slow-2g`/`2g`/`3g` ou `downlink < 2` → 480p; senão 720p; sem `connection` → 720p; qualidade escolhida ausente → a primeira fonte.
- Troca de fonte (`attach.ts`, interno): guarda `currentTime` e se estava tocando; `requestSave('pause')`; `tracker.setQuality(nova)` (incrementa `qualitySwitches` e ignora `waiting`/`seeking`/`emptied` até o próximo `playing`); troca o `src`; no `loadedmetadata` volta para a posição guardada; volta a tocar se tocava; a faixa recomeça na posição guardada (nada de faixa desde 0); emite `qualityChange { quality, automatic }`. O liberado (`furthest`) não muda.
- Automática: só com preferência `'auto'`, tocando em 720p e havendo 480p; `onStall` alimenta o `DowngradeWatch`; ao disparar, troca para 480p com `automatic: true`, uma vez por sessão.
- Botão (só com 2+ fontes), na barra antes da tela cheia: `aria-label` "Qualidade: Automática (720p)" (ou "Qualidade: 480p"), abre um menu com `role="menuitemradio"` "Automática", "720p", "480p"; escolher salva a preferência e troca a fonte se mudou. Textos em `texts.ts`: `quality: 'Qualidade'`, `qualityAuto: 'Automática'`.
- Tela do Dia: `sources={(session.sources ?? [{ url: session.url, quality: null }]).map(s => ({ src: s.url, quality: s.quality ?? undefined }))}`; o medidor usa `'single'` com uma fonte e a qualidade da fonte em uso com duas.

- [ ] **Step 1: Write the failing tests**

```ts
// sources.test.ts
it('keeps the only source')
it('uses the saved preference when that quality exists')
it('starts in 480p on 2g, 3g or less than 2 Mbps')          // effectiveType '3g' → 480p; '4g' + downlink 1.5 → 480p; '4g' + 10 → 720p
it('starts in 720p without connection information')        // null → 720p (iPhone)
it('falls back to automatic when storage throws')          // getItem lança → 'auto'; setItem lança → não lança
it('steps down after two stalls within 60 seconds, once')  // recordStall(0,'720p') false; (59_000,'720p') true; depois sempre false
it('ignores stalls further apart than 60 seconds')         // (0) e (61_000) → false
// quality.test.ts
it('counts a quality switch and ignores the waiting it causes')   // setQuality('480p'); waiting +2 s; playing → stallCount 0, qualitySwitches 1, quality '480p'
// attach.test.ts
it('switches to 480p keeping position, lock and coverage')
  // furthest 30, tocando em 20 em 720p; dois travamentos ≥ 500 ms em 40 s → src termina em 480p; após loadedmetadata currentTime 20;
  // seeking para 45 continua bloqueado (seekBlocked); nenhum save com range.startMs 0 depois da troca; qualityChange { '480p', automatic: true }
it('does not step down automatically when the viewer chose 720p')
// QualityMenu.test.tsx
it('offers automatic, 720p and 480p only when there are two sources')
it('switches and remembers the choice')                     // clique "480p" → src 480p; localStorage['sipat-player-quality'] == '480p'
// LearningPage.test.tsx
it('passes both renditions of the session to the player')   // sessão com sources 720p/480p, localStorage '480p' → <video> com src da 480p
```

- [ ] **Step 2: Run to verify they fail**

Run (em `src/Web`): `npm test -w @sipat/video-player -- test/core test/react/QualityMenu.test.tsx` e `npm test -w SipatOnline.Web -- src/LearningPage.test.tsx` → FAIL

- [ ] **Step 3: Implement sources, the switch, the automatic step-down, the menu and the day page wiring**

- [ ] **Step 4: Run everything, then commit**

Run: `npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist` → PASS

```bash
git add src/Web
git commit -m "feat(player): choose 720p or 480p by preference and connection, and step down after repeated stalls"
```

---

### Task 16: Verificação final e roteiro nos aparelhos

**Files:**
- Modify: `docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md` (seções novas "G. Dashboard de qualidade" e "H. Conversão e qualidade 720p/480p")
- Modify: `docs/architecture/ADR-003-sipat-video-player.md` (Status "Aceito"; marcar os itens 1 a 7 do "Plano de implementação")

- [ ] **Step 1: Add the checks to the manual script**

1. Chrome com "Slow 4G": provocar travamentos num Dia e conferir, em `/platform/companies/{id}/qualidade`, a sessão em "Sessões com travamento", na hora certa do gráfico e em "Por conexão"; baixar o resumo e abrir o PDF (uma página).
2. `/platform/qualidade`: a empresa aparece com os quatro semáforos; clicar abre a tela da empresa.
3. Entrar como administrador da empresa: não há "Qualidade do vídeo" e `/api/platform/…/playback-quality` responde 403.
4. Enviar um vídeo na Biblioteca: aparece "Processando", não aparece no planejador do Dia, e fica pronto em poucos minutos; o player do Dia mostra o botão de qualidade.
5. Android com 3G simulado: começa em 480p. iPhone: começa em 720p. Escolher 480p e recarregar: continua 480p.
6. Em 720p com "Slow 4G": depois de 2 travamentos em 1 minuto, troca sozinho para 480p sem perder a posição nem liberar o avanço.
7. Repetir os itens de "A. Player" (bloqueio, 1x, tela cheia no iPhone, jogos, salvar ao sair).
8. `npm run player` em `src/Web`: o playground abre e mostra os eventos.

- [ ] **Step 2: Run everything**

Run: `dotnet test SipatOnline.slnx`; em `src/Web`: `npm ci && npm run lint && npm test && npm run build`, depois `git checkout -- SipatOnline.Web/dist`
Expected: tudo PASS

Run: `./docker-local.ps1 up -Build` (PowerShell)
Expected: termina mostrando os endereços; a API registra "Application started"; `docker compose exec api ffmpeg -version` imprime a versão

- [ ] **Step 3: Commit**

```bash
git add docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md docs/architecture/ADR-003-sipat-video-player.md
git commit -m "docs: device checks for the quality dashboard, conversion and quality selection"
```
