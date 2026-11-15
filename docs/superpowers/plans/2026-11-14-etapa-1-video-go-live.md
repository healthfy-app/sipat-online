# Etapa 1 — Vídeo pronto para o go-live (1º/12/2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o vídeo funcionar em produção, sair da VM (R2), ter backup externo do banco e registrar a qualidade de cada sessão de vídeo desde o primeiro dia da SIPAT.

**Architecture:** Um provedor de reprodução de produção (`CatalogVideoPlaybackProvider`) substitui o `UnconfiguredVideoPlaybackProvider`, guardando as sessões de vídeo no Postgres. Os arquivos ficam atrás de `IPlatformCourseVideoStorage`, com duas implementações: arquivo (dev/plano B) e R2 (links assinados). A qualidade é medida no navegador por um módulo TypeScript puro, ligado ao `<video>` atual, e gravada numa tabela própria. O player atual não é reestruturado.

**Tech Stack:** .NET 10, EF Core + Npgsql, xUnit + Testcontainers, AWSSDK.S3 (R2), React 19 + Vite + Vitest + Testing Library, ffmpeg (script), rclone (backup).

**Spec:** `docs/superpowers/specs/2026-11-14-sipat-video-player-design.md` (seção 5.7, Etapa 1)

## Global Constraints

- Prazo: Etapa 1 pronta até **25/11/2026**; depois disso só correções.
- **Não reestruturar o player atual** (`src/Web/SipatOnline.Web/src/player/SipatPlayer.tsx`, `src/learning/LearningTrackPage.tsx`). Só acrescentar.
- Anti-meta: a medição de qualidade **nunca** pode atrapalhar o vídeo. Falha no envio é ignorada, sem mensagem.
- Anti-meta: a conclusão continua validada no servidor (`IPlaybackEvidenceVerifier`, `LearningProgress`).
- Nenhum dado vai para analytics de terceiros.
- Empresa e participante vêm **sempre** do servidor (`ITenantContext`, `ICurrentActor`), nunca do corpo da requisição.
- Todo POST/PUT novo valida o antiforgery como os endpoints existentes (`ValidateAntiforgeryAsync`).
- Migrations novas têm ID **depois** de `20261120160000` (as existentes usam datas futuras): `20261121100000_AddPlaybackGrants`, `20261121110000_AddPlaybackQualitySessions`. O `dotnet ef` gera um ID com a data de hoje, que ordenaria antes; renomeie o arquivo, o `.Designer.cs` e o atributo `[Migration("…")]`.
- Textos para o usuário em português do Brasil, no vocabulário do produto (SIPAT, Dia, vídeo).
- Duração da sessão de vídeo em produção: **2 horas**.
- Chaves no R2: `videos/{videoId:N}/720p.mp4`.
- Script de conversão: H.264 High, 720p, ~2 Mbps (`-b:v 2M -maxrate 2500k -bufsize 4M`), AAC 128 kbps, `+faststart`.
- Backup: dump diário `pg_dump --format=custom` no R2, retenção de 30 dias.

## Review Focus

1. **A API reinicia no meio da SIPAT** (deploy, queda): as sessões de vídeo abertas continuam aceitando trechos, porque estão no banco. Teste na Task 3.
2. **O participante fecha a aba durante um travamento ou antes de o vídeo começar:** o resumo de qualidade ainda é enviado (`keepalive` com o token já em cache, sem buscar token novo na saída). Teste na Task 10.
3. **O envio de qualidade falha** (rede, 500): nada aparece para o participante e o vídeo continua. Teste na Task 10.
4. **Resumo forjado:** aula de outra empresa ou não atribuída devolve 404; `tenantId`/`participantId` no corpo são ignorados; `Id` já usado por outra pessoa é recusado (400). Teste na Task 8.
5. **O mesmo resumo chega várias vezes** (a cada 60 s e na saída): uma linha só, com os valores do último envio. Teste na Task 8.

---

### Task 1: Rede de segurança do player (testes de caracterização)

Fixa o comportamento atual que ainda não tem teste. Estes testes devem **passar sem mudar código**. Se algum falhar, é um defeito real: pare e reporte, não ajuste o teste.

**Files:**
- Create: `src/Web/SipatOnline.Web/src/player/SipatPlayer.test.tsx`
- Modify: `src/Web/SipatOnline.Web/src/LearningPage.test.tsx` (novo `it` no `describe('learning experience')`)

**Interfaces:**
- Consumes: `SipatPlayer` (`videoRef`, `lock: { furthest, onBlocked }`, `markers`), o setup de mocks já existente em `LearningPage.test.tsx`.
- Produces: nada.

- [ ] **Step 1: Write the tests**

Em `SipatPlayer.test.tsx` (montar `<SipatPlayer videoRef lock={{ furthest: { current: 10 }, onBlocked }}><video slot="media" ref={videoRef} /></SipatPlayer>`, com `duration = 60` e `currentTime = 5` definidos por `Object.defineProperty` e um `durationchange` disparado):
- `it('stops the End key at what was already watched and reports the block')`: foco no `role="slider"`, tecla `End` → `video.currentTime === 10`; tecla `ArrowRight` com `currentTime = 10` → `currentTime === 10` e `onBlocked` chamado.
- `it('lets the keyboard move freely without a lock')`: sem `lock`, `End` → `currentTime === 60`.
- `it('fills the page when the browser has no fullscreen')`: `document.fullscreenEnabled = false`; clique em "Tela cheia" → o elemento `.sipat-player` tem a classe `is-filling` e `document.documentElement` tem `sipat-player-filling`; `Escape` → as duas classes somem.

Em `LearningPage.test.tsx`:
- `it('saves the watched range when the tab is hidden')`: com o vídeo tocando e um trecho ≥ 1 s, `Object.defineProperty(document, 'visibilityState', { value: 'hidden' })` e `document.dispatchEvent(new Event('visibilitychange'))` → `recordLearningPlaybackRange` chamado com o `sessionId` da sessão.

- [ ] **Step 2: Run the tests**

Run: `npm test -- src/player/SipatPlayer.test.tsx src/LearningPage.test.tsx` (em `src/Web/SipatOnline.Web`)
Expected: PASS (todos)

- [ ] **Step 3: Commit**

```bash
git add src/Web/SipatOnline.Web/src/player/SipatPlayer.test.tsx src/Web/SipatOnline.Web/src/LearningPage.test.tsx
git commit -m "test(web): pin the player keyboard lock, fullscreen fallback and save on hidden tab"
```

---

### Task 2: Regra de evidência de reprodução no domínio

Extrai para o domínio a regra que hoje só existe no provedor de desenvolvimento (`DevelopmentSampleVideoProvider.VerifyRangeAsync`), para o provedor de produção usar a mesma.

**Files:**
- Create: `src/Modules/Learning/Domain/SipatOnline.Learning.Domain/Progress/PlaybackEvidencePolicy.cs`
- Test: `tests/SipatOnline.Domain.UnitTests/Learning/PlaybackEvidencePolicyTests.cs`

**Interfaces:**
- Consumes: `WatchedRange(long StartMilliseconds, long EndMilliseconds)` (já existe em `Progress/WatchedRange.cs`).
- Produces:
  ```csharp
  public static class PlaybackEvidencePolicy
  {
      // null = trecho recusado; senão, as faixas aceitas já juntadas (ordenadas, sem sobreposição)
      public static IReadOnlyList<WatchedRange>? Accept(
          IReadOnlyList<WatchedRange> accepted, long startMilliseconds, long endMilliseconds,
          long durationMilliseconds, DateTimeOffset startedAt, DateTimeOffset expiresAt, DateTimeOffset now);
  }
  ```

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact] Accepts_a_plausible_range_and_merges_it()
    // accepted [0..5000], novo 4000..9000, startedAt = now-10s → [0..9000]
[Fact] Rejects_after_expiry()                 // now > expiresAt → null
[Fact] Rejects_negative_empty_or_beyond_duration() // start<0; end<=start; end>duration → null
[Fact] Rejects_more_coverage_than_twice_the_elapsed_time_plus_two_seconds()
    // startedAt = now-10s; cobertura total 22_001 ms → null; 22_000 ms → aceito
[Fact] Merges_touching_ranges()               // [0..1000] + 1000..2000 → [0..2000]
```

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.Domain.UnitTests --filter PlaybackEvidencePolicyTests`
Expected: FAIL (o tipo `PlaybackEvidencePolicy` não existe)

- [ ] **Step 3: Implement `PlaybackEvidencePolicy.Accept`**

As mesmas regras e o mesmo limite de `DevelopmentSampleVideoProvider` (cobertura ≤ `(now - startedAt).TotalMilliseconds * 2 + 2000`). A junção segue o `Merge` privado desse provedor. Não altere o provedor de desenvolvimento.

- [ ] **Step 4: Run to verify they pass**

Run: `dotnet test tests/SipatOnline.Domain.UnitTests --filter PlaybackEvidencePolicyTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/Modules/Learning/Domain tests/SipatOnline.Domain.UnitTests/Learning/PlaybackEvidencePolicyTests.cs
git commit -m "feat(learning): playback evidence rule in the domain"
```

---

### Task 3: Reprodução em produção com sessões no banco

Hoje, fora do desenvolvimento, toda sessão de vídeo é recusada. Esta tarefa resolve o bloqueio do go-live.

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlaybackGrantEntity.cs` (entidade + `IEntityTypeConfiguration`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/CatalogVideoPlaybackProvider.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261121100000_AddPlaybackGrants.cs` (+ `.Designer.cs`, snapshot atualizado)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/PlatformDbContext.cs` (DbSet + configuração)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs:262-288` (escolha do provedor)
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/IPlatformCourseVideoStorage.cs` (novo método)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/FilePlatformCourseVideoStorage.cs` (implementa o novo método)
- Delete: `src/Infrastructure/SipatOnline.Infrastructure/Learning/UnconfiguredVideoPlaybackProvider.cs`
- Test: `tests/SipatOnline.IntegrationTests/CatalogPlaybackApiTests.cs`

**Interfaces:**
- Consumes: `PlaybackEvidencePolicy.Accept` (Task 2); `PlaybackSession(string Url, string? ContentType, DateTimeOffset ExpiresAt, Guid SessionId, bool IsDevelopmentDemo)`.
- Produces:
  ```csharp
  // IPlatformCourseVideoStorage
  Task<Uri?> GetPlaybackUrlAsync(Guid videoId, TimeSpan validFor, CancellationToken cancellationToken);
  // null = o arquivo é servido pela API (/api/learning/lessons/{lessonId}/media)

  public sealed class CatalogVideoPlaybackProvider(PlatformDbContext db, IPlatformCourseVideoStorage storage, TimeProvider clock)
      : IVideoPlaybackProvider, IPlaybackEvidenceVerifier
  {
      public static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(2);
  }

  // tabela learning."PlaybackGrants"
  PlaybackGrantEntity { Guid Id /* = SessionId */; Guid ParticipantId; Guid LessonId; Guid VideoId;
      long DurationMilliseconds; DateTimeOffset StartedAt; DateTimeOffset ExpiresAt;
      List<WatchedRange> WatchedRanges /* jsonb */ }
  ```
- Configuração: `SipatOnline:Learning:Playback:Provider` = `Development` | `Catalog`. Sem valor: `Development` quando `IsDevelopment()` e `SipatOnline:Learning:DevelopmentSampleEnabled`; senão `Catalog`.

- [ ] **Step 1: Write the failing integration test**

`CatalogPlaybackApiTests` (`[DockerFact]`), montado como `LearningEngagementApiTests.cs:20-170`: factory com `developmentSampleEnabled: true` (para os usuários de exemplo), mais `UseSetting("SipatOnline:Learning:Playback:Provider", "Catalog")`, vídeo gravado pelo `IPlatformCourseVideoStorage` e curso associado à SIPAT.
- `[DockerFact] Plays_a_catalog_video_outside_the_development_provider()`: `POST .../playback` → 200, `isDevelopmentDemo == false`, `url == "/api/learning/lessons/{lessonId}/media"`, `expiresAt` ≈ agora + 2 h (±1 min); `GET` da url com `Range: bytes=0-7` → 206.
- `[DockerFact] Accepts_plausible_ranges_and_refuses_impossible_ones()`: trecho 0..899 → 200; trecho de 1 h logo em seguida → 400 com `learning.evidence_invalid`.
- `[DockerFact] Refuses_a_session_of_another_participant()`: criar um segundo participante na empresa pela API do operador; ele envia o `sessionId` do primeiro → 400 `learning.evidence_invalid`.
- `[DockerFact] Keeps_sessions_across_an_api_restart()`: criar a sessão, descartar a factory, criar outra factory com o mesmo banco, autenticar de novo, enviar um trecho com o mesmo `sessionId` → 200.

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter CatalogPlaybackApiTests`
Expected: FAIL (`learning.video_provider_unavailable` / tipo inexistente)

- [ ] **Step 3: Add `GetPlaybackUrlAsync` to the storage contract; `FilePlatformCourseVideoStorage` returns `null`**

- [ ] **Step 4: Add `PlaybackGrantEntity`, the DbSet and the migration**

Schema `learning`; `WatchedRanges` em `jsonb`, como as faixas do progresso já são guardadas; índice em `ExpiresAt`. Gerar com `dotnet ef migrations add AddPlaybackGrants --project src/Infrastructure/SipatOnline.Infrastructure --startup-project src/Api/SipatOnline.Api` e renomear para `20261121100000_AddPlaybackGrants` (ver Global Constraints).

- [ ] **Step 5: Implement `CatalogVideoPlaybackProvider`**

- `CreateSessionAsync`: aceita só referências `catalog:{guid}`, senão falha `learning.video_asset_unavailable` com "Este vídeo não está disponível."; busca o vídeo em `PlatformCourseVideos`; grava o grant; a url é `await storage.GetPlaybackUrlAsync(videoId, SessionLifetime)` ou, se `null`, `/api/learning/lessons/{lessonId:D}/media`.
- `VerifyRangeAsync`: grant inexistente, de outro participante ou de outra aula → `Success(false)`; senão `PlaybackEvidencePolicy.Accept`; aceito → grava as faixas e devolve `Success(true)`.

- [ ] **Step 6: Switch provider selection and delete `UnconfiguredVideoPlaybackProvider`**

`GetVideoPlaybackProvider` e `GetPlaybackEvidenceVerifier` seguem a regra de configuração dos Interfaces. Registre `CatalogVideoPlaybackProvider` como scoped e resolva-o para as duas interfaces.

- [ ] **Step 7: Run the tests**

Run: `dotnet test SipatOnline.slnx`
Expected: PASS (inclusive `LearningApiTests` e `LearningEngagementApiTests`, que continuam no provedor de desenvolvimento)

- [ ] **Step 8: Commit**

```bash
git add src tests
git commit -m "feat(learning): catalog videos play in production, with playback sessions kept in the database"
```

---

### Task 4: Armazenamento no Cloudflare R2

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/R2PlatformCourseVideoStorage.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/R2StorageOptions.cs`
- Modify: `Directory.Packages.props` (`AWSSDK.S3`; `Testcontainers.Minio` na mesma versão do `Testcontainers.PostgreSql`, 4.16.0)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/SipatOnline.Infrastructure.csproj`, `tests/SipatOnline.IntegrationTests/SipatOnline.IntegrationTests.csproj`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs:200-210` (remover o registro **duplicado** de `IPlatformCourseVideoStorage`, `IPlatformCourseCatalogStore` e `PlatformCourseCatalogService`, que hoje aparecem duas vezes, e escolher a implementação)
- Modify: `src/Api/SipatOnline.Api/Endpoints/LearningEngagementEndpoints.cs:84-102` e `src/Api/SipatOnline.Api/Endpoints/PlatformCourseCatalogEndpoints.cs:313-328` (redirecionar quando houver link assinado)
- Test: `tests/SipatOnline.IntegrationTests/R2PlatformCourseVideoStorageTests.cs`

**Interfaces:**
- Consumes: `IPlatformCourseVideoStorage` com `GetPlaybackUrlAsync` (Task 3).
- Produces:
  ```csharp
  public sealed class R2StorageOptions   // seção "SipatOnline:VideoStorage:R2"
  { string ServiceUrl; string AccessKeyId; string SecretAccessKey; string Bucket; }
  // ServiceUrl em produção: https://<ACCOUNT_ID>.r2.cloudflarestorage.com

  public sealed class R2PlatformCourseVideoStorage(IAmazonS3 s3, R2StorageOptions options, TimeProvider clock)
      : IPlatformCourseVideoStorage
  {
      public static string KeyFor(Guid videoId) => $"videos/{videoId:N}/720p.mp4";
  }
  ```
- Configuração: `SipatOnline:VideoStorage:Provider` = `File` (padrão) | `R2`.

- [ ] **Step 1: Write the failing tests** (`[DockerFact]`, MinIO via `Testcontainers.Minio`, cliente S3 com `ForcePathStyle = true`)

- `Saves_opens_and_deletes_a_video()`: `SaveAsync` de 16 bytes → `OpenReadAsync` devolve os mesmos bytes → `DeleteAsync` → `OpenReadAsync` devolve `null`.
- `Rejects_a_declared_size_that_does_not_match()`: mesma regra que `FilePlatformCourseVideoStorage.SaveAsync` aplica hoje (mesmo código de erro).
- `Signs_a_playback_url_that_downloads_the_file()`: `GetPlaybackUrlAsync(id, 2h)` → `HttpClient.GetAsync(url)` com `Range: bytes=0-3` → 206 e os 4 primeiros bytes; a query contém `X-Amz-Expires=7200`.
- `Key_layout_is_stable()`: `KeyFor(Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e")) == "videos/0f8fad5bd9cb469fa16570867728950e/720p.mp4"`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter R2PlatformCourseVideoStorageTests`
Expected: FAIL (tipo inexistente)

- [ ] **Step 3: Implement `R2PlatformCourseVideoStorage`**

- `SaveAsync`: grava o stream num arquivo temporário, confere o tamanho declarado e faz `PutObject` a partir do arquivo com `DisablePayloadSigning = true`. Apaga o temporário em `finally`.
- `OpenReadAsync`: `GetObject` (404 → `null`).
- `DeleteAsync`: `DeleteObject`.
- `GetPlaybackUrlAsync`: `GetPreSignedURL` (verbo GET, `Protocol.HTTPS`, ou HTTP quando o `ServiceUrl` é `http://`, como no MinIO dos testes).
- Cliente S3 para o R2: `ServiceURL = options.ServiceUrl`, `ForcePathStyle = true`, `AuthenticationRegion = "auto"`, `RequestChecksumCalculation = WHEN_REQUIRED`, `ResponseChecksumValidation = WHEN_REQUIRED`. O R2 não aceita os checksums padrão dos SDKs AWS recentes.

- [ ] **Step 4: Register by configuration and redirect to signed urls**

Com `Provider=R2`, registre o `IAmazonS3` (singleton) e o `R2PlatformCourseVideoStorage`. Falta de qualquer campo de `R2StorageOptions` falha na inicialização, com a mensagem "Configure SipatOnline:VideoStorage:R2:<campo>.". Nas duas rotas de arquivo, depois da verificação de acesso que já existe: `GetPlaybackUrlAsync(videoId, TimeSpan.FromMinutes(10))` não nulo → `Results.Redirect(url)`; nulo → comportamento atual.

- [ ] **Step 5: Run the tests**

Run: `dotnet test SipatOnline.slnx`
Expected: PASS

- [ ] **Step 6: Add the production settings**

Em `deploy/compose.production.yaml` (`x-api-environment`): `SipatOnline__VideoStorage__Provider: ${VIDEO_STORAGE_PROVIDER:-File}` e as quatro chaves `SipatOnline__VideoStorage__R2__*` lidas de `R2_SERVICE_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_VIDEO_BUCKET`. Em `deploy/.env.production.example`: as mesmas variáveis, comentadas e explicadas em português. `File` continua sendo o plano B.

- [ ] **Step 7: Commit**

```bash
git add Directory.Packages.props src tests deploy
git commit -m "feat(video): library videos can live in Cloudflare R2 and play from signed links"
```

---

### Task 5: Levar os vídeos ao R2 e converter os novos

**Files:**
- Create: `deploy/scripts/convert-video.sh`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/CatalogVideoCopier.cs`
- Modify: `src/Api/SipatOnline.Api/Program.cs:84-90` (novo comando)
- Modify: `deploy/CLOUDFLARE-VM.md` (seção 5)
- Test: `tests/SipatOnline.IntegrationTests/CatalogVideoCopierTests.cs`

**Interfaces:**
- Consumes: `FilePlatformCourseVideoStorage` e `R2PlatformCourseVideoStorage` (Task 4).
- Produces:
  ```csharp
  public sealed record CatalogVideoCopyLine(Guid VideoId, string Title, bool Copied, double Mbps, bool TooHeavy);
  public sealed class CatalogVideoCopier(PlatformDbContext db, FilePlatformCourseVideoStorage source, IPlatformCourseVideoStorage target)
  {
      public const double HeavyMbps = 3.0;
      public Task<IReadOnlyList<CatalogVideoCopyLine>> CopyAllAsync(CancellationToken cancellationToken);
  }
  ```
  Comando: `--copy-videos-to-r2`, que imprime uma linha por vídeo e termina.

- [ ] **Step 1: Write the failing test**

`Copies_every_library_video_and_flags_heavy_ones()` (Postgres + MinIO): dois vídeos no armazenamento de arquivo, um de 1 MB com `DurationMilliseconds = 1000` (8 Mbps) e um de 100 KB com 10 s (0,08 Mbps) → os dois existem no destino; o primeiro tem `TooHeavy == true`. Rodar duas vezes copia de novo sem erro (idempotente).

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter CatalogVideoCopierTests`
Expected: FAIL

- [ ] **Step 3: Implement `CatalogVideoCopier` and the `--copy-videos-to-r2` command**

`Mbps = SizeBytes * 8 / (DurationMilliseconds / 1000.0) / 1_000_000`. Vídeo sem arquivo na origem → `Copied = false`. O comando só roda com `Provider=R2`; senão, imprime "Configure SipatOnline:VideoStorage:Provider=R2 antes de copiar." e sai com código 1.

- [ ] **Step 4: Write `deploy/scripts/convert-video.sh`**

Uso: `convert-video.sh entrada.mp4 saida.mp4`, com os parâmetros de Global Constraints e `-vf "scale=-2:'min(720,ih)'"` (não aumenta vídeos menores). Falha com mensagem clara se o `ffmpeg` não estiver instalado.

- [ ] **Step 5: Document in `deploy/CLOUDFLARE-VM.md`, section 5**

Explicar:
- criar o bucket de vídeos no R2 e a chave de API restrita a ele;
- preencher o `.env.production`;
- rodar `docker compose … run --rm api --copy-videos-to-r2`;
- reenviar os vídeos marcados como pesados, depois de passar por `convert-video.sh`;
- converter todo vídeo novo antes de enviar.

Incluir o aviso de confirmar os termos da Cloudflare para servir vídeo pelo R2 e o plano B (`VIDEO_STORAGE_PROVIDER=File`).

- [ ] **Step 6: Run the tests and commit**

Run: `dotnet test SipatOnline.slnx` → PASS

```bash
git add deploy src tests
git commit -m "feat(video): command to copy library videos to R2, with a report of heavy files, and a conversion script"
```

---

### Task 6: Backup diário do banco no R2

**Files:**
- Create: `deploy/scripts/backup-postgres.sh`
- Create: `deploy/scripts/restore-postgres.sh`
- Create: `deploy/systemd/sipat-backup.service`, `deploy/systemd/sipat-backup.timer`
- Modify: `deploy/CLOUDFLARE-VM.md` (seção 5)

**Interfaces:**
- Consumes: o serviço `postgres` do `deploy/compose.production.yaml`; um remote do rclone chamado `r2` (tipo S3, provedor Cloudflare).
- Produces:
  - `backup-postgres.sh`: grava `r2:${R2_BACKUP_BUCKET}/postgres/sipat-online-AAAAMMDD-HHMMSS.dump` e apaga do bucket os arquivos com mais de 30 dias;
  - `restore-postgres.sh <arquivo>`: restaura num banco **novo** `sipat_online_restore_test` e imprime a contagem de linhas de `"Tenants"`, `learning."LearningProgress"` e `"PlatformCourseVideos"`.

- [ ] **Step 1: Write `backup-postgres.sh`**

`docker compose --env-file deploy/.env.production -f deploy/compose.production.yaml exec -T postgres pg_dump --format=custom --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB" | rclone rcat "r2:$R2_BACKUP_BUCKET/postgres/<nome>"`, seguido de `rclone delete --min-age 30d "r2:$R2_BACKUP_BUCKET/postgres"`. `set -euo pipefail`, para que uma falha no `pg_dump` não grave um arquivo vazio.

- [ ] **Step 2: Write `restore-postgres.sh` and the systemd timer**

O timer roda diariamente às 03:00 com `Persistent=true`.

- [ ] **Step 3: Verify locally**

Run (com o Docker local de pé e um remote rclone `r2` apontando para uma pasta local: `rclone config create r2 local`):
`R2_BACKUP_BUCKET=/tmp/sipat-backup bash deploy/scripts/backup-postgres.sh`, depois `bash deploy/scripts/restore-postgres.sh <arquivo gerado>`
Expected: as três contagens são impressas e batem com o banco de origem.

Se o compose local não usar `deploy/.env.production`, aceite `COMPOSE_ARGS` como variável de ambiente para trocar os argumentos do `docker compose`, e documente isso no topo do script.

- [ ] **Step 4: Document in `deploy/CLOUDFLARE-VM.md`**

Documentar: instalar o rclone, criar o bucket de backup e a chave restrita a ele, `rclone config` com o provedor Cloudflare, instalar e ativar o timer, e **ensaiar a restauração antes de 25/11**.

- [ ] **Step 5: Commit**

```bash
git add deploy
git commit -m "feat(deploy): daily Postgres backup to R2 with 30-day retention and a restore drill"
```

---

### Task 7: Resumo de qualidade no domínio

**Files:**
- Create: `src/Modules/Learning/Domain/SipatOnline.Learning.Domain/Quality/PlaybackQualityReport.cs`
- Test: `tests/SipatOnline.Domain.UnitTests/Learning/PlaybackQualityReportTests.cs`

**Interfaces:**
- Produces:
  ```csharp
  public enum PlaybackErrorKind { Network, Decode, Source, Unknown }
  public enum PlaybackDevice { Phone, Tablet, Desktop }
  public sealed record PlaybackQualityReport(
      Guid Id, Guid LessonId, Guid PlaybackSessionId, DateTimeOffset StartedAt, int TimezoneOffsetMinutes,
      long? StartupMilliseconds, bool NeverStarted, int StallCount, long StallMilliseconds, long WatchedMilliseconds,
      PlaybackErrorKind? ErrorKind, string Quality, int QualitySwitches,
      string? ConnectionType, double? DownlinkMbps, PlaybackDevice Device)
  {
      public static Result<PlaybackQualityReport> Create(/* mesmos campos */, DateTimeOffset now);
  }
  ```
  Erro único: `learning.playback_quality_invalid`, "O resumo de qualidade do vídeo é inválido."

- [ ] **Step 1: Write the failing tests**

Um `[Theory]` `Rejects_values_out_of_bounds` com cada limite, mais `Accepts_a_typical_report`. Limites:
- `Id`, `LessonId` e `PlaybackSessionId` diferentes de `Guid.Empty`;
- `StartedAt` em `[now - 7 dias, now + 5 min]`;
- `TimezoneOffsetMinutes` em `[-840, 840]`;
- `StartupMilliseconds` nulo ou em `[0, 600_000]`;
- `StallCount` em `[0, 10_000]`;
- `StallMilliseconds` e `WatchedMilliseconds` em `[0, 21_600_000]`;
- `Quality` ∈ {`single`, `720p`, `480p`};
- `QualitySwitches` em `[0, 1000]`;
- `ConnectionType` nulo ou ∈ {`slow-2g`, `2g`, `3g`, `4g`};
- `DownlinkMbps` nulo ou em `[0, 10_000]`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.Domain.UnitTests --filter PlaybackQualityReportTests` → FAIL

- [ ] **Step 3: Implement `PlaybackQualityReport.Create`**

- [ ] **Step 4: Run to verify they pass, then commit**

Run: mesmo comando → PASS

```bash
git add src/Modules/Learning/Domain tests/SipatOnline.Domain.UnitTests
git commit -m "feat(learning): playback quality report with its limits"
```

---

### Task 8: Gravar o resumo de qualidade (API, tabela, serviço)

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/IPlaybackQualityStore.cs`
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Quality/PlaybackQualityService.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlaybackQualitySessionEntity.cs` (entidade + configuração)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/EfPlaybackQualityStore.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261121110000_AddPlaybackQualitySessions.cs` (+ `.Designer.cs`, snapshot)
- Modify: `PlatformDbContext.cs`, `InfrastructureServiceCollectionExtensions.cs` (registros)
- Modify: `src/Api/SipatOnline.Api/Endpoints/LearningEndpoints.cs` (rota no grupo `participant`)
- Test: `tests/SipatOnline.IntegrationTests/PlaybackQualityApiTests.cs`

**Interfaces:**
- Consumes: `PlaybackQualityReport.Create` (Task 7); `ILearningStore.FindAssignedLessonAsync(tenantId, participantId, trackId, lessonId, token)`.
- Produces:
  ```csharp
  public interface IPlaybackQualityStore
  {
      // false = o Id já pertence a outra pessoa ou empresa
      Task<bool> UpsertAsync(Guid tenantId, Guid participantId, PlaybackQualityReport report, CancellationToken cancellationToken);
  }
  public sealed class PlaybackQualityService(ITenantContext tenant, ICurrentActor actor, ILearningStore learning,
      IPlaybackQualityStore store, TimeProvider clock)
  {
      public Task<Result> RecordAsync(Guid trackId, PlaybackQualityRequest request, CancellationToken cancellationToken);
  }
  ```
  Rota: `POST /api/learning/tracks/{trackId:guid}/playback-quality` → 204. Os erros usam o `ToProblem` existente. `UpsertAsync` devolvendo `false` vira `learning.playback_quality_invalid`.
  `PlaybackQualityRequest` (record em `Application/Quality`, propriedades com os nomes do corpo abaixo, em PascalCase, `ErrorKind`/`Device` como `string?`/`string`) é convertido em `PlaybackQualityReport.Create`; valor de enum desconhecido → `learning.playback_quality_invalid`.
  Corpo (camelCase): `{ id, lessonId, playbackSessionId, startedAt, timezoneOffsetMinutes, startupMs, neverStarted, stallCount, stallMs, watchedMs, errorKind, quality, qualitySwitches, connectionType, downlinkMbps, device }`. `errorKind` e `device` em minúsculas, como no frontend.
  Tabela `learning."PlaybackQualitySessions"`: os campos do relatório + `TenantId`, `ParticipantId`, `TrackId`, `SipatEventId`, `DayPosition` (nulo), `VideoId` (nulo quando a referência não é `catalog:`), `ReceivedAt`. Índices (`TenantId`, `SipatEventId`) e (`StartedAt`).

- [ ] **Step 1: Write the failing integration tests** (setup de `CatalogPlaybackApiTests`)

- `Records_a_report_once_and_keeps_the_last_values()`: enviar o mesmo `id` duas vezes (`stallCount` 1 e depois 3) → 204 e 204; no banco, 1 linha com `StallCount == 3`, `SipatEventId` e `TrackId` da trilha e `VideoId` do vídeo do catálogo.
- `Ignores_tenant_and_participant_sent_in_the_body()`: corpo com `tenantId`/`participantId` falsos → a linha tem os do usuário logado.
- `Refuses_a_lesson_that_is_not_assigned()`: aula de outra trilha ou de outra empresa → 404 `learning.lesson_not_found`.
- `Refuses_an_id_already_used_by_someone_else()`: segundo participante com o mesmo `id` → 400 `learning.playback_quality_invalid`, e a linha original não muda.
- `Refuses_without_antiforgery()`: sem `X-CSRF-TOKEN` → o mesmo status que `POST .../ranges` devolve sem token.
- `Refuses_invalid_values()`: `stallMs = -1` → 400 `learning.playback_quality_invalid`.

- [ ] **Step 2: Run to verify they fail**

Run: `dotnet test tests/SipatOnline.IntegrationTests --filter PlaybackQualityApiTests` → FAIL

- [ ] **Step 3: Implement the service, store, entity, migration and route**

O serviço resolve participante e empresa como o `LearningService` (`GetParticipant`/`GetTenantId`), confirma a aula com `FindAssignedLessonAsync` e cria o relatório com `clock.GetUtcNow()`. O store preenche `SipatEventId`/`DayPosition` a partir de `LearningTracks` e o `VideoId` a partir de `ProviderAssetReference`. Gere a migration e renomeie para `20261121110000_AddPlaybackQualitySessions`.

- [ ] **Step 4: Run the tests**

Run: `dotnet test SipatOnline.slnx` → PASS (o teste de arquitetura também: Application não referencia Infrastructure)

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(learning): store a playback quality summary per video session"
```

---

### Task 9: Medidor de qualidade no navegador (TypeScript puro)

**Files:**
- Create: `src/Web/SipatOnline.Web/src/player/core/quality.ts`
- Test: `src/Web/SipatOnline.Web/src/player/core/quality.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type QualityLabel = 'single' | '720p' | '480p';
  export type PlaybackDevice = 'phone' | 'tablet' | 'desktop';
  export interface PlaybackEnvironment {
    connectionType: 'slow-2g' | '2g' | '3g' | '4g' | null; downlinkMbps: number | null;
    device: PlaybackDevice; timezoneOffsetMinutes: number;
  }
  export interface PlaybackQualitySummary {
    id: string; lessonId: string; playbackSessionId: string; startedAt: string; timezoneOffsetMinutes: number;
    startupMs: number | null; neverStarted: boolean; stallCount: number; stallMs: number; watchedMs: number;
    errorKind: 'network' | 'decode' | 'source' | 'unknown' | null; quality: QualityLabel; qualitySwitches: number;
    connectionType: PlaybackEnvironment['connectionType']; downlinkMbps: number | null; device: PlaybackDevice;
  }
  export type FlushReason = 'interval' | 'paused' | 'ended' | 'hidden' | 'leave' | 'stop';
  export interface QualityTracker { flush(reason: FlushReason): void; stop(): void }
  export function readPlaybackEnvironment(): PlaybackEnvironment;
  export function detectDevice(screenWidth: number, screenHeight: number, touch: boolean): PlaybackDevice;
  export function trackPlaybackQuality(video: HTMLVideoElement, options: {
    lessonId: string; playbackSessionId: string; quality: QualityLabel;
    environment?: PlaybackEnvironment; onReport: (summary: PlaybackQualitySummary, reason: FlushReason) => void;
  }): QualityTracker;
  ```
- Regras (do desenho, seção 5.3):
  - `id`: `crypto.randomUUID()`, um por chamada de `trackPlaybackQuality`.
  - `startupMs`: do primeiro `play` até o primeiro `playing`.
  - `neverStarted`: 30 s depois do `play` sem `playing`, ou `error` antes de `playing`. Nesse momento sai um `flush('interval')`.
  - Travamento: `waiting` depois do primeiro `playing`, fora de `seeking`, com duração ≥ 500 ms até o próximo `playing`. Conta em `stallCount` e `stallMs`.
  - `watchedMs`: relógio de parede entre `playing` e `pause`/`waiting`/`ended`.
  - `errorKind` a partir de `video.error.code`: 2 → network, 3 → decode, 4 → source, outro → unknown.
  - `startedAt`: ISO do primeiro `play`.
  - `flush`: a cada 60 s tocando; 30 s depois de um `pause` que continua pausado (`'paused'`); no `ended`. `stop()` faz `flush('stop')` e remove os listeners e timers.
  - Nenhum `flush` antes do primeiro `play`.
  - `detectDevice`: `touch && min(w,h) < 600` → phone; `touch && min(w,h) < 1100` → tablet; senão desktop.

- [ ] **Step 1: Write the failing tests** (`vi.useFakeTimers()`, um `HTMLVideoElement` real do jsdom, eventos disparados com `video.dispatchEvent(new Event('…'))`)

```ts
it('measures startup from play to playing')            // play, +1200ms, playing → startupMs 1200
it('counts a stall only after playback started and when it lasts 500 ms')
                                                        // playing, waiting, +400, playing → 0; waiting, +800, playing → 1, stallMs 800
it('does not count waiting while seeking')
it('marks never started after 30 seconds without playing and reports it')
it('reports every 60 seconds while playing, 30 seconds after a pause, and on ended')
it('reports nothing before the first play')
it('reads the error kind from the media error code')
it('stop reports once and removes its listeners')
it('classifies phones, tablets and desktops')           // detectDevice(390,844,true)=phone; (820,1180,true)=tablet; (1440,900,false)=desktop
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/player/core/quality.test.ts` → FAIL

- [ ] **Step 3: Implement `quality.ts`**

Sem imports de React, de `@/api` ou de qualquer coisa fora de `src/player/core`. O arquivo vai se mudar para o pacote `@sipat/video-player` na Etapa 2.

- [ ] **Step 4: Run to verify they pass, then commit**

Run: `npm test -- src/player/core/quality.test.ts` → PASS

```bash
git add src/Web/SipatOnline.Web/src/player/core
git commit -m "feat(player): measure startup, stalls and errors of a video session"
```

---

### Task 10: Ligar o medidor à tela do Dia

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (token em cache + envio)
- Modify: `src/Web/SipatOnline.Web/src/learning/LearningTrackPage.tsx` (efeito novo; nenhum comportamento existente muda)
- Test: `src/Web/SipatOnline.Web/src/LearningPage.test.tsx`, `src/Web/SipatOnline.Web/src/api.test.ts`

**Interfaces:**
- Consumes: `trackPlaybackQuality`, `PlaybackQualitySummary` (Task 9); rota da Task 8.
- Produces (api.ts):
  ```ts
  export function primeAntiforgeryToken(): Promise<void>;   // busca e guarda o token; erros engolidos
  export function sendPlaybackQuality(trackId: string, summary: PlaybackQualitySummary): Promise<void>;
  // fetch(`/api/learning/tracks/${trackId}/playback-quality`, { method: 'POST', keepalive: true,
  //   credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': <token em cache> }, body })
  // sem token em cache: busca um (getAntiforgeryToken) antes de enviar
  ```

- [ ] **Step 1: Write the failing tests**

`api.test.ts`:
- `it('sends the quality summary with keepalive and the cached token')`: `primeAntiforgeryToken()` uma vez; dois `sendPlaybackQuality` → o token foi buscado **uma** vez e os dois `fetch` têm `keepalive: true` e `X-CSRF-TOKEN`.

`LearningPage.test.tsx` (mockar `sendPlaybackQuality` e `primeAntiforgeryToken` no `vi.mock('./api')` existente):
- `it('reports video quality when the tab is hidden')`: tocar o vídeo e esconder a aba → `sendPlaybackQuality` chamado com o `trackId` e um resumo com o `playbackSessionId` da sessão.
- `it('keeps playing and shows nothing when the quality report fails')`: `sendPlaybackQuality` rejeitado → nenhum `role="alert"` novo, e `recordLearningPlaybackRange` continua sendo chamado.
- `it('reports video quality before leaving through a link')`: clique num link interno → `sendPlaybackQuality` chamado antes da navegação.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/api.test.ts src/LearningPage.test.tsx` → FAIL

- [ ] **Step 3: Implement `primeAntiforgeryToken` and `sendPlaybackQuality`**

- [ ] **Step 4: Wire `LearningTrackPage`**

- Num `useEffect` que depende de `playbackSession?.sessionId` e da aula selecionada: com o `videoRef.current` presente, `primeAntiforgeryToken()` e `trackPlaybackQuality(videoRef.current, { lessonId, playbackSessionId: playbackSession.sessionId, quality: 'single', onReport: (s) => { void sendPlaybackQuality(apiTrackId, s).catch(() => undefined); } })`. Na limpeza, `tracker.stop()`.
- No `visibility()` existente: `tracker.flush('hidden')` antes do `persistPlayback(true)`.
- No `leave()` existente: `tracker.flush('leave')` antes do `persistPlayback(true)`.
- Guardar o tracker num `useRef` para os handlers alcançarem.

- [ ] **Step 5: Run the whole web suite**

Run: `npm test && npm run lint && npm run build` (em `src/Web/SipatOnline.Web`)
Expected: tudo PASS; os testes antigos de `LearningPage.test.tsx` sem nenhuma mudança

- [ ] **Step 6: Commit**

```bash
git add src/Web/SipatOnline.Web/src
git commit -m "feat(learning): send the quality of each video session from the day page"
```

---

### Task 11: Verificação final e roteiro nos aparelhos

**Files:**
- Modify: `docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md` (seção nova "Qualidade e entrega do vídeo")

- [ ] **Step 1: Add the checks to the manual script**

O roteiro deve conferir:
1. Assistir um vídeo em Chrome (desktop), Safari no iPhone e Chrome no Android. Conferir o bloqueio de avanço, o 1x, a tela cheia, o jogo e o progresso salvo.
2. No Chrome, DevTools → Network → "Slow 4G": provocar travamentos e confirmar uma linha em `learning."PlaybackQualitySessions"` com `StallCount > 0` (`docker compose exec postgres psql …`).
3. Fechar a aba durante um travamento → a linha existe.
4. Com `VIDEO_STORAGE_PROVIDER=R2`: o vídeo vem de `*.r2.cloudflarestorage.com` (Network) e funciona até o fim.
5. Reiniciar o container da API no meio do vídeo → o progresso continua sendo salvo.

- [ ] **Step 2: Run everything**

Run: `dotnet test SipatOnline.slnx`, e em `src/Web/SipatOnline.Web`: `npm test && npm run lint && npm run build`
Expected: tudo PASS

Run: `./docker-local.ps1 up -Build` (PowerShell)
Expected: termina mostrando os endereços; a API registra "Application started".

- [ ] **Step 3: Commit**

```bash
git add docs/ROTEIRO-TESTE-PLAYER-E-JOGOS.md
git commit -m "docs: device checks for video delivery and quality"
```
