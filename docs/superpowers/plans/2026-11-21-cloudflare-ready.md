# API pronta para Cloudflare Containers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The API runs correctly as several Cloudflare Containers instances (ephemeral disk, ~100 MB request body cap at the edge) while the VM deployment (`deploy/compose.production.yaml` + nginx + Postgres + R2) and the local docker stack (`compose.yaml`) keep working unchanged.

**Architecture:** Every piece of per-instance state moves to Postgres or R2: Data Protection keys in `identity."DataProtectionKeys"`, login counters in `identity."LoginAttemptWindows"` (atomic upsert), conversion jobs claimed with `FOR UPDATE SKIP LOCKED` plus a renewed lease, conversion originals under `uploads/{videoId:N}/source` in R2 (File storage keeps today's work folder). Operator uploads go browser → R2 with a presigned PUT when the API says so (`mode: "direct"`), otherwise the existing multipart form. A Worker in `deploy/cloudflare/` serves the SPA as static assets and forwards `/api/*` and `/health` to a `SipatApi` Container class; conversion runs in a separate single-instance `SipatConverter` class.

**Tech Stack:** .NET 10 minimal API, EF Core 10 + Npgsql, ASP.NET Core Data Protection (`Microsoft.AspNetCore.DataProtection.EntityFrameworkCore`), AWSSDK.S3 (R2), xUnit + Testcontainers (PostgreSQL, MinIO), React + TypeScript (Vite, vitest), Cloudflare Workers + `@cloudflare/containers` + wrangler, GitHub Actions.

**Spec:** `docs/architecture/ADR-004-topologia-de-producao.md` (Ações 4, 5, 6, 7, 9; item 8 only as a recommendation in the runbook).

## Decisions

1. **One migration per task** (`20261125100000_AddDataProtectionKeys`, `20261125110000_AddLoginAttemptWindows`, `20261125120000_AddVideoConversionLease`) so each task ships and reverts alone.
2. **Data Protection:** `PersistKeysToDbContext<PlatformDbContext>()` + `SetApplicationName("SipatOnline")` (constant `DataProtectionSetup.ApplicationName`). Keys are not encrypted at rest: whoever reads the database already owns every account, and a certificate would be one more secret to rotate. `--initialize-database` creates the first key when none is active, so instances never race to create the ring on first boot (the db-init step always runs before `api` on the VM and before `wrangler deploy` in CI).
3. **Login limit in the database, not "lockout is enough":** Identity lockout is already in the DB, but `AccessFailedAsync` is read-modify-write guarded by `ConcurrencyStamp`; concurrent failures from several instances lose increments (`ConcurrencyFailure` is swallowed by `SignInManager`), and non-existent logins never lock. So the per-login counter becomes one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING "Count"` per attempt. The key is stored as SHA-256 hex of `host|LOGIN` (no registration numbers in a table). The per-address flood guard (`identity-auth`, 300/min) stays in memory per instance; the edge layer is a Cloudflare Rate Limiting rule.
4. **Claim only `Pending`; reclaim expired leases with a sweep.** `ClaimNextAsync` = one `UPDATE … WHERE "Id" = (SELECT … WHERE "Status"='Pending' ORDER BY "CreatedAt","Id" LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING …`. `RequeueInterruptedAsync` keeps its name and now requeues only `Running` jobs whose `LeaseUntil` is null or past (null = rows from before this version), and runs at the top of every worker loop, not only at start. This keeps `Resumes_a_job_left_running_by_a_restart` green unedited (it asserts `ConvertNext` is false before the requeue).
5. **Fencing by `LeasedBy`.** Every write a worker makes after claiming (renew, Done, Failed, graceful requeue) has `WHERE "Id"=@id AND "Status"='Running' AND "LeasedBy"=@me`. A worker that loses the lease cancels ffmpeg, deletes its job folder and writes nothing. Renditions it may already have uploaded go to the same R2 keys the new owner writes; same input, same encoder settings, so the overwrite is harmless.
6. **Lease defaults:** `LeaseDuration` 2 min, renewed every 30 s from a fresh DI scope (a `DbContext` is not thread-safe, so the renewal never touches the processor's context). Both are options so tests can shrink them. App clock (`TimeProvider`) everywhere; 2 min dwarfs NTP skew between containers.
7. **Worker switch = the existing `SipatOnline:VideoConversion:RunInBackground`** (already defaults to true and already gates the hosted service; the tests already set it). No second key with the same meaning. The VM keeps `true`; Cloudflare sets `false` on `SipatApi` and `true` on `SipatConverter`.
8. **Where the original lives depends on the storage provider, not on how it was uploaded:** `IVideoSourceStore` with `FileVideoSourceStore` (today's `WorkPath/{videoId:N}/{videoId:N}.video`, unchanged) and `R2VideoSourceStore` (`uploads/{videoId:N}/source`). With `Provider=R2` the multipart upload also writes the original to R2, so the VM on R2 stops needing `video-work` for originals (it stays as scratch). The 480p backfill on R2 copies the 720p server-side (`CopyObject`), no disk.
9. **Per-job scratch folder** `WorkPath/jobs/{jobId:N}/` for the downloaded source (R2) and both outputs (both providers); deleted in `finally`.
10. **Direct upload is opt-in:** `SipatOnline:VideoStorage:R2:DirectUpload` (default `false`). The VM on R2 keeps multipart until someone sets the bucket CORS rule and flips the flag; Cloudflare sets `true`. The web always asks first (`POST …/videos/uploads`) and follows `mode`.
11. **Stateless upload ticket.** The start call returns a new `videoId`; the object key is derived from it; `complete` HEADs the object and reads its first 12 bytes (ranged GET) to check size (1 B–250 MB), `Content-Type` (`video/mp4`|`video/webm`, signed into the URL) and signature (`ftyp` / EBML), then creates the catalog video. No pending-upload table: only the platform operator can call either endpoint, and an unknown or already-completed id fails (404 / 409). A presigned PUT cannot cap the size (R2 has no POST policy), so an oversized object is deleted at `complete`; abandoned ones are removed by an R2 lifecycle rule on `uploads/` (7 days; incomplete multipart 1 day). A job still Pending after 7 days fails with the existing "arquivo enviado não foi encontrado" message.
12. **Presigned PUT lifetime 1 h** (250 MB on a slow office uplink).
13. **Database for Containers:** Hyperdrive binds to Workers, not to a .NET process in a container, so the container gets a normal Npgsql connection string as a Worker secret passed through `envVars`. Options: (a) managed Postgres over public TLS (`SSL Mode=VerifyFull`), (b) Postgres behind Cloudflare Tunnel / Workers VPC, (c) Hyperdrive + a Worker-side SQL proxy (rewrite the data layer: no). **Pick (a), Neon direct (non-pooler) endpoint** with `Maximum Pool Size=10` per instance: few instances, and Neon's PgBouncer transaction mode interferes with Npgsql prepared statements. Latency measurement is ADR item 8 (out of scope).
14. **Load balancing** with `getRandom(env.SIPAT_API, API_INSTANCES)` from `@cloudflare/containers`; no stickiness needed once keys and counters are shared. The converter is one named instance (`getByName("converter")`) woken by the Worker after a `201` from `…/complete`, and by an hourly cron; it stays awake while `GET /health/conversion` says `busy`.
15. **Forwarded headers on Containers:** the container is reachable only through its Durable Object, so `SipatOnline:ForwardedHeaders:KnownNetworks` (`0.0.0.0/0`, `::/0`) is accepted as an alternative to `KnownProxies`; the Worker overwrites `X-Forwarded-For` with `CF-Connecting-IP` and sets `X-Forwarded-Proto: https`. The VM keeps `KnownProxies`.
16. **Migrations on Cloudflare** run from CI (`docker run … --initialize-database`) against the environment's database before `wrangler deploy`; containers never migrate at startup.

## Global Constraints

- The VM stack (`deploy/compose.production.yaml`, nginx, `VIDEO_STORAGE_PROVIDER=File|R2`) and the local stack (`compose.yaml`) keep working with their current `.env` files; new settings all have defaults that reproduce today's behaviour.
- `Provider=File` keeps the multipart upload and the `WorkPath/{videoId:N}` source folder exactly as today.
- No existing test assertion is edited. Intended behaviour changes and the tests that cover them: `RequeueInterruptedAsync` no longer touches `Running` jobs with a live lease (new tests; `Resumes_a_job_left_running_by_a_restart` and `Requeues_a_conversion_cancelled_by_a_graceful_shutdown` stay as they are); `LoginAttemptLimiter.TryAcquire` becomes `TryAcquireAsync` (only callers change, `Login_LimitsAttemptsPerAccount_NotPerAddress` stays as is).
- Migrations follow the existing files: generated with `dotnet ef migrations add`, migration `.cs` without BOM, Designer keeps EF's BOM, CRLF line endings, `PlatformDbContextModelSnapshot.cs` updated by EF, `dotnet format whitespace SipatOnline.slnx --verify-no-changes` passes.
- User-facing text in Brazilian Portuguese (error titles, runbook); code, logs and commit messages in English.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

1. **Two instances claim the same job** — the claim must be a single statement with `FOR UPDATE SKIP LOCKED`; the read-then-update in today's `ProcessNextAsync` must be gone (Task 3, `Parallel_claims_never_take_the_same_job`).
2. **A lease expiring mid-conversion** — the renewal must run on its own scope, survive a slow ffmpeg, and on a lost lease the old worker must stop and write nothing; the sweep must never requeue a job whose lease is live (Task 3, `Lease_is_renewed_and_reports_a_takeover`, `A_processor_that_lost_its_lease_leaves_the_job_alone`).
3. **A presigned upload abandoned or larger than allowed** — `complete` must HEAD before inserting, delete an oversized/invalid object, refuse a second `complete`, and the lifecycle rule must cover `uploads/` only, never `videos/` (Task 5).
4. **Keys table empty on first boot with two instances racing** — db-init creates the key; the two-instance cookie test must start both factories only after initialization, and a separate test proves two concurrent initializations leave one active key (Task 1).
5. **Login counters under concurrency** — the increment is one upsert returning the new count; 30 parallel attempts yield counts 1..30 with no gaps or duplicates (Task 2).

---

### Task 1: Data Protection keys in the database

**Files:**
- Modify: `Directory.Packages.props` (add `Microsoft.AspNetCore.DataProtection.EntityFrameworkCore` 10.0.13)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/SipatOnline.Infrastructure.csproj` (package reference)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/PlatformDbContext.cs` (implement `IDataProtectionKeyContext`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/DataProtectionSetup.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/InfrastructureServiceCollectionExtensions.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/DatabaseInitializer.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Migrations/20261125100000_AddDataProtectionKeys.cs` + `.Designer.cs`; Modify: `PlatformDbContextModelSnapshot.cs`
- Modify: `deploy/compose.production.yaml` (drop the `aspnet-data-protection` volume mount and declaration), `deploy/CLOUDFLARE-VM.md` §6 (one line: keys now live in the database; the old volume can be removed after the update)
- Create: `tests/SipatOnline.IntegrationTests/DataProtectionKeysTests.cs`

**Interfaces:**
- `public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();` → table `identity."DataProtectionKeys"` (default schema).
- `public static class DataProtectionSetup { public const string ApplicationName = "SipatOnline"; public static async Task EnsureKeyAsync(IKeyManager keys, TimeProvider clock, CancellationToken ct); }` — creates `CreateNewKey(now, now + 90 days)` when no key is unrevoked and unexpired; before creating, takes `pg_advisory_xact_lock(hashtext('sipat.dataprotection'))` inside a transaction on the context so two concurrent db-init runs do not both create one.
- Registration: `services.AddDataProtection().SetApplicationName(DataProtectionSetup.ApplicationName).PersistKeysToDbContext<PlatformDbContext>();`
- `DatabaseInitializer.InitializeAsync` calls `EnsureKeyAsync` after `MigrateAsync`.

**Failing tests first** (`[DockerFact]`, Postgres Testcontainer, `SipatOnlineApiFactory`):
- `Initialization_creates_one_data_protection_key` — after `InitializeAsync`, `db.DataProtectionKeys.CountAsync() == 1`, `FriendlyName` not null.
- `Initializing_twice_concurrently_keeps_one_active_key` — two `InitializeAsync` via `Task.WhenAll` on two factories → count == 1.
- `A_login_cookie_from_one_instance_is_accepted_by_another` — factories A and B on one database (both after init); operator logs in on A (`/api/platform/identity/login` → 204); copy the `__Host-SipatOnline.Auth` cookie into a B client; `GET /api/platform/identity/session` on B → 200.
- `An_antiforgery_token_from_one_instance_is_accepted_by_another` — token + cookie from A's `/api/identity/antiforgery`; a login POST on B with them → 401 (bad password), not 400.
- `A_cookie_survives_a_restart` — log in on A, dispose A, new factory C on the same database accepts the cookie.

**Steps:**
- [ ] Write the tests; run `dotnet test tests/SipatOnline.IntegrationTests --filter FullyQualifiedName~DataProtectionKeysTests` → fail (no `DataProtectionKeys`).
- [ ] Add package, `IDataProtectionKeyContext`, `DataProtectionSetup`, registration, initializer call.
- [ ] `dotnet ef migrations add AddDataProtectionKeys -p src/Infrastructure/SipatOnline.Infrastructure -s src/Api/SipatOnline.Api`, rename to timestamp `20261125100000`, strip the BOM from the migration `.cs`, keep CRLF.
- [ ] Remove the `aspnet-data-protection` volume from `deploy/compose.production.yaml` (the local `compose.yaml` never had one).
- [ ] Verify: the filtered tests pass; `dotnet test SipatOnline.slnx` green; `dotnet format whitespace SipatOnline.slnx --verify-no-changes`; `docker compose --env-file .env up --build -d` then log in at the local web.
- [ ] Commit: `feat(security): Data Protection keys in the database with a fixed application name`

### Task 2: Login counters shared by every instance

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/LoginAttemptWindowEntity.cs` (entity + configuration)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Identity/EfLoginAttemptCounter.cs`
- Modify: `PlatformDbContext.cs` (`DbSet<LoginAttemptWindowEntity> LoginAttemptWindows`), `InfrastructureServiceCollectionExtensions.cs` (`AddScoped<ILoginAttemptCounter, EfLoginAttemptCounter>()`)
- Modify: `src/Api/SipatOnline.Api/LoginAttemptLimiter.cs`, `src/Api/SipatOnline.Api/Program.cs` (singleton → scoped), `src/Api/SipatOnline.Api/Endpoints/IdentityEndpoints.cs`, `src/Api/SipatOnline.Api/Endpoints/PlatformEndpoints.cs`
- Create: migration `20261125110000_AddLoginAttemptWindows` (+ Designer, snapshot)
- Create: `tests/SipatOnline.IntegrationTests/LoginAttemptCounterTests.cs`

**Interfaces:**
- Table `identity."LoginAttemptWindows"`: `Key varchar(64)` (SHA-256 hex), `WindowStart timestamptz`, `Count int`; PK `(Key, WindowStart)`; index on `WindowStart`.
- `public interface ILoginAttemptCounter { Task<int> IncrementAsync(string key, DateTimeOffset windowStart, CancellationToken ct); Task<int> PurgeBeforeAsync(DateTimeOffset cutoff, CancellationToken ct); }`
- `EfLoginAttemptCounter.IncrementAsync` = `INSERT INTO identity."LoginAttemptWindows" ("Key","WindowStart","Count") VALUES (@k,@w,1) ON CONFLICT ("Key","WindowStart") DO UPDATE SET "Count" = "LoginAttemptWindows"."Count" + 1 RETURNING "Count"` (via `Database.SqlQuery<int>`).
- `LoginAttemptLimiter` (scoped): `public async Task<bool> TryAcquireAsync(HttpContext context, string? loginIdentifier, CancellationToken ct)` — key `SHA256(host|LOGIN)`, window = UTC minute floor, allowed when count ≤ `PerLoginPerMinute`; 1 in 100 calls (`Random.Shared`) also purges windows older than 1 h. `SectionName`, defaults and `TooManyAttempts()` unchanged. No `IDisposable` any more.

**Failing tests first:**
- `Parallel_increments_return_every_count_once` (`[DockerFact]`) — 30 parallel `IncrementAsync` (own scope each) for one key → sorted results == 1..30.
- `Different_windows_count_apart` — same key, two windows → both return 1.
- `Purge_removes_only_old_windows`.
- `Login_limit_per_account_is_shared_between_instances` (`[DockerFact]`, two factories, one DB) — 5 wrong logins for `Target-Employee` on A, 5 on B (all 401), 11th on A → 429 with title `Muitas tentativas.`.
- Existing `IdentityApiTests.Login_LimitsAttemptsPerAccount_NotPerAddress` must stay green untouched.

**Steps:**
- [ ] Tests → fail. Implement entity, counter, limiter, endpoint callers (`if (!await limiter.TryAcquireAsync(context, request.LoginIdentifier, cancellationToken))`).
- [ ] Migration as in Task 1.
- [ ] Add a "Proteção de login na borda" section to the Task 8 runbook draft notes (rule text lives in Task 8).
- [ ] Verify: filtered tests + full `dotnet test SipatOnline.slnx`; `dotnet format` check.
- [ ] Commit: `feat(security): per-login attempt counter in the database, shared by every API instance`

### Task 3: Conversion queue safe for several instances

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionJobEntity.cs` (`LeaseUntil`, `LeasedBy`; index `(Status, LeaseUntil)`)
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/FfmpegVideoTranscoder.cs` (`VideoConversionOptions.LeaseDuration`, `LeaseRenewInterval`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionLease.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionInstance.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionProcessor.cs`, `VideoConversionWorker.cs`, `InfrastructureServiceCollectionExtensions.cs`
- Create: migration `20261125120000_AddVideoConversionLease` (+ Designer, snapshot)
- Create: `tests/SipatOnline.IntegrationTests/VideoConversionLeaseTests.cs`

**Interfaces:**
- Columns: `LeaseUntil timestamptz null`, `LeasedBy varchar(100) null`.
- Options (section `SipatOnline:VideoConversion`): `TimeSpan LeaseDuration = 2 min`, `TimeSpan LeaseRenewInterval = 30 s`; `RunInBackground` documented as the worker switch.
- `public sealed class VideoConversionInstance { public string Id { get; } }` singleton, `"{Environment.MachineName}:{Guid.NewGuid():N}"` (≤ 100 chars).
- `public sealed record ClaimedConversionJob(Guid JobId, Guid VideoId, int Attempts);`
- `VideoConversionProcessor`:
  - `public Task<ClaimedConversionJob?> ClaimNextAsync(CancellationToken ct)` — the single `UPDATE … SKIP LOCKED … RETURNING "Id","VideoId","Attempts"` of Decision 4 (sets `Running`, `Attempts+1`, `StartedAt`, `LeaseUntil = now + LeaseDuration`, `LeasedBy = instance`, clears `FinishedAt`/`Error`).
  - `public Task<bool> ProcessNextAsync(CancellationToken ct)` — unchanged contract: claim, then `ProcessClaimedAsync`; false when nothing to claim.
  - `public Task ProcessClaimedAsync(ClaimedConversionJob job, CancellationToken ct)` — public for the takeover test.
  - `public Task<int> RequeueInterruptedAsync(CancellationToken ct)` — only `Running` with `LeaseUntil IS NULL OR LeaseUntil < now`; those with `Attempts >= MaximumAttempts` fail as today; requeue clears `StartedAt`, `LeaseUntil`, `LeasedBy`.
- `public sealed class VideoConversionLease : IAsyncDisposable { public static VideoConversionLease Start(IServiceScopeFactory scopes, Guid jobId, string instanceId, VideoConversionOptions options, TimeProvider clock, ILogger logger); public CancellationToken Lost { get; } public bool IsLost { get; } }` — a `PeriodicTimer` loop; each tick opens a scope and runs the fenced `ExecuteUpdateAsync(LeaseUntil = now + LeaseDuration)`; 0 rows → cancel `Lost`. A DB error on a tick is logged and retried next tick; it only declares the lease lost once `LeaseUntil` would already have passed.
- Processor run: `using var linked = CreateLinkedTokenSource(ct, lease.Lost)`; ffmpeg and R2 calls get `linked.Token`; new `catch (OperationCanceledException) when (lease.IsLost && !ct.IsCancellationRequested)` → log warning, delete job folder, no DB write. Done / Fail / graceful requeue all add `job.LeasedBy == instance` to their `Where`; a 0-row Done rolls back and **does not** call `storage.DeleteAsync` (the video is not deleted, someone else owns the job).
- Outputs move to `WorkPath/jobs/{jobId:N}/720p.mp4|480p.mp4` (Decision 9); `OutputPath` takes the job id.
- `VideoConversionWorker.ExecuteAsync` calls `RequeueInterruptedAsync` at the top of every loop iteration (drop the `requeued` flag).

**Failing tests first** (`[DockerFact]` unless noted; jobs inserted directly — `VideoConversionJobs` has no FK to videos):
- `Parallel_claims_never_take_the_same_job` — 20 Pending rows; 4 parallel loops (own scope each) call `ClaimNextAsync` until null → 20 distinct `JobId`s total; every row `Running` with non-null `LeasedBy` and `LeaseUntil`.
- `A_running_job_with_a_live_lease_is_not_requeued` — `Running`, `LeaseUntil = now + 5 min` → `RequeueInterruptedAsync` returns 0, status still `Running`.
- `A_job_whose_lease_expired_is_requeued` — `LeaseUntil = now - 1 min`, `Attempts = 1` → returns 1, `Pending`, `LeasedBy` null.
- `An_expired_job_out_of_attempts_fails_its_video` — `Attempts = 3`, expired → job `Failed`, video `Failed` with `A conversão foi interrompida várias vezes. Envie o vídeo de novo.`
- `Lease_is_renewed_and_reports_a_takeover` — options `LeaseDuration = 2 s`, `LeaseRenewInterval = 200 ms`; claim; start lease; wait 1 s → `LeaseUntil > now + 1 s`; set `LeasedBy = 'other'` → `Lost` cancelled within 1 s.
- `A_processor_that_lost_its_lease_leaves_the_job_alone` (`[DockerFfmpegFact]`) — upload a 2 s video (File storage); claim; set `LeasedBy = 'other'`; `ProcessClaimedAsync` → job still `Running` with `LeasedBy = 'other'`, video still `Processing`, `WorkPath/jobs` empty.
- `Converts_in_a_folder_per_job_and_removes_it` (`[DockerFfmpegFact]`) — after `ConvertNext`, `WorkPath/jobs` has no entries.
- `Does_not_start_the_worker_when_RunInBackground_is_false` (`[Fact]`) — `factory.Services.GetServices<IHostedService>()` has no `VideoConversionWorker`.
- All of `VideoConversionApiTests` stay green untouched.

**Steps:**
- [ ] Tests → fail. Entity, options, migration (as Task 1, `AddVideoConversionLease`).
- [ ] Claim SQL via `db.Database.SqlQuery<ClaimRow>($"…")` (interpolated → parameters); schema-qualified, quoted identifiers.
- [ ] Lease class, fencing, job folder, worker loop.
- [ ] Verify: `dotnet test tests/SipatOnline.IntegrationTests --filter "FullyQualifiedName~VideoConversion"` (needs Docker + ffmpeg), full suite, `dotnet format`.
- [ ] Commit: `feat(video): conversion jobs claimed with SKIP LOCKED and a renewed lease`

### Task 4: Conversion original in R2 when the storage is R2

**Files:**
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/IVideoSourceStore.cs` (interface + `FileVideoSourceStore` + `R2VideoSourceStore`)
- Modify: `EfVideoConversionQueue.cs` (delegates `SaveSourceAsync`/`DiscardSourceAsync` to `IVideoSourceStore`; keeps the static `WorkFolder`/`SourcePath` helpers for File)
- Modify: `VideoConversionProcessor.cs` (gets the source through the store; `EnqueueMissingSd480Async` uses `IVideoSourceStore.CopyFromRenditionAsync`)
- Modify: `R2PlatformCourseVideoStorage.cs` (extract the size/signature validation into `internal static class VideoUploadValidation` shared with `R2VideoSourceStore`)
- Modify: `InfrastructureServiceCollectionExtensions.cs` (register the store by provider)
- Create: `tests/SipatOnline.IntegrationTests/R2VideoSourceStoreTests.cs`, `tests/SipatOnline.IntegrationTests/R2VideoConversionApiTests.cs`, `tests/SipatOnline.IntegrationTests/MinioFixture.cs` (start MinIO + bucket + client, moved out of `R2PlatformCourseVideoStorageTests` private helpers; that file then calls it — no assertion changes)

**Interfaces:**
```csharp
public interface IVideoSourceStore
{
    Task<Result<StoredPlatformVideo>> SaveAsync(Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken ct);
    /// Null when the source is gone. File: returns the existing path, copies nothing. R2: downloads into jobFolder/source.
    Task<string?> GetLocalCopyAsync(Guid videoId, string jobFolder, CancellationToken ct);
    Task<bool> CopyFromRenditionAsync(Guid videoId, VideoRendition rendition, CancellationToken ct);
    Task DeleteAsync(Guid videoId, CancellationToken ct);
}
```
- `R2VideoSourceStore.KeyFor(Guid videoId) => $"uploads/{videoId:N}/source"`; `CopyFromRenditionAsync` = `CopyObjectAsync(videos/{id:N}/720p.mp4 → uploads/{id:N}/source)`.
- `FileVideoSourceStore` = today's behaviour bit for bit (`WorkPath/{videoId:N}/{videoId:N}.video`, folder deleted on discard/finish).
- Missing source message unchanged: `O arquivo enviado não foi encontrado para a conversão. Envie o vídeo de novo.`

**Failing tests first:**
- `R2VideoSourceStoreTests` (`[DockerFact]`, MinIO): `Saves_downloads_and_deletes_a_source`; `Refuses_a_declared_size_that_does_not_match` (code `learning.platform_course.video_content_invalid`, no object); `Copies_the_720p_into_the_source_key_inside_the_bucket`; `Key_layout_is_stable` (`[Fact]`, `uploads/0f8fad5bd9cb469fa16570867728950e/source`).
- `R2VideoConversionApiTests` (`[DockerFfmpegFact]`, Postgres + MinIO, `Provider=R2`):
  - `Multipart_upload_keeps_the_original_in_the_bucket_not_on_disk` — after upload: object `uploads/{id:N}/source` exists, `WorkPath/{id:N}` does not; after `ConvertNext`: `Ready`, both renditions in `videos/{id:N}/`, source object gone, `WorkPath/jobs` empty.
  - `Backfill_480p_copies_inside_the_bucket` — a Ready video without 480p; `EnqueueMissingSd480Async` returns 1 and writes nothing under `WorkPath`; `ConvertNext` adds `480p.mp4`, 720p bytes unchanged.
  - `A_missing_original_fails_the_video` — delete the source object before `ConvertNext` → video `Failed` with the message above.
- `VideoConversionApiTests` (File) stay green untouched.

**Steps:**
- [ ] Tests → fail. Implement stores and wiring; processor calls `GetLocalCopyAsync(videoId, jobFolder)` and deletes the source through the store after Done/Fail.
- [ ] Verify: filtered tests, full suite, `dotnet format`.
- [ ] Update `deploy/CLOUDFLARE-VM.md` "Conversão automática": with R2 the original waits in the bucket (`uploads/`), `video-work` is only scratch; the disk note for `--convert-catalog-videos` applies only to `File`.
- [ ] Commit: `feat(video): keep the conversion original in R2 when the storage is R2`

### Task 5: Direct upload API (presigned PUT + complete)

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/IDirectVideoUploadStore.cs`
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/R2DirectVideoUploadStore.cs`, `NoDirectVideoUploadStore.cs`
- Modify: `R2StorageOptions.cs` (`public bool DirectUpload { get; set; }`), `InfrastructureServiceCollectionExtensions.cs` (read `DirectUpload`; register R2 store only when `Provider=R2 && DirectUpload`, else `NoDirectVideoUploadStore`)
- Modify: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/PlatformCourseCatalogService.cs` (new methods; extract the title/duration/course/actor checks of `AddVideoAsync` into a private `ValidateNewVideoAsync` reused by both paths)
- Modify: `src/Api/SipatOnline.Api/Endpoints/PlatformCourseCatalogEndpoints.cs` (two routes + DTOs)
- Modify: `deploy/compose.production.yaml` (`SipatOnline__VideoStorage__R2__DirectUpload: ${R2_DIRECT_UPLOAD:-false}`), `deploy/.env.production.example` (commented `R2_DIRECT_UPLOAD=false` with the CORS prerequisite)
- Create: `tests/SipatOnline.IntegrationTests/R2DirectVideoUploadStoreTests.cs`, `tests/SipatOnline.IntegrationTests/DirectVideoUploadApiTests.cs`

**Interfaces:**
```csharp
public sealed record DirectUploadTicket(Guid VideoId, Uri UploadUrl, string ContentType, DateTimeOffset ExpiresAt);
public sealed record UploadedObject(long SizeBytes, string ContentType, byte[] Header);
public interface IDirectVideoUploadStore
{
    bool IsEnabled { get; }
    Task<DirectUploadTicket> CreateAsync(Guid videoId, string contentType, TimeSpan validFor, CancellationToken ct);
    Task<UploadedObject?> InspectAsync(Guid videoId, CancellationToken ct);      // HEAD + GET Range bytes=0-11
    Task PromoteAsync(Guid videoId, string contentType, CancellationToken ct);   // conversion off: CopyObject → videos/{id:N}/720p.mp4, delete upload
    Task DeleteAsync(Guid videoId, CancellationToken ct);
}
```
- Upload key = `R2VideoSourceStore.KeyFor(videoId)` (the conversion reads the same object; nothing is moved).
- Service: `Task<Result<DirectUploadStart>> StartDirectUploadAsync(string? contentType, long sizeBytes, CancellationToken ct)`; `Task<Result<PlatformCourseVideo>> CompleteDirectUploadAsync(Guid videoId, Guid? courseId, string? title, long durationMilliseconds, CancellationToken ct)`. `DirectUploadStart` is `Mode` (`"direct"|"multipart"`) + nullable ticket.
- Routes (group `/api/platform/catalog`, policy `ManagePlatform`, antiforgery as every POST):
  - `POST /videos/uploads` body `{ "contentType": "video/mp4", "sizeBytes": 123456 }` → `200 { "mode": "direct", "videoId": "…", "uploadUrl": "https://…", "method": "PUT", "headers": { "Content-Type": "video/mp4" }, "expiresAt": "…", "maxSizeBytes": 262144000 }` or `200 { "mode": "multipart", "maxSizeBytes": 262144000 }`. Name `StartPlatformVideoUpload`.
  - `POST /videos/uploads/{videoId:guid}/complete` body `{ "title": "Uso de EPI", "durationMilliseconds": 90000, "courseId": null }` → `201`, `Location: /api/platform/catalog/videos/{id:D}/file`, body = the same `PlatformCourseVideoResponse` the multipart route returns; calls `VideoConversionSignal.Notify()` when `Processing`. Name `CompletePlatformVideoUpload`.
- Errors (400 unless noted, Portuguese): `learning.platform_course.video_type_invalid` "Envie um vídeo MP4 ou WebM."; `learning.platform_course.video_size_invalid` "O vídeo deve ter entre 1 byte e 250 MB."; `learning.platform_course.upload_not_found` (404) "O envio não foi encontrado. Envie o vídeo de novo."; `learning.platform_course.upload_already_completed` (409) "Este envio já foi concluído."; `learning.platform_course.video_content_invalid` "O arquivo não corresponde ao formato de vídeo informado.". Size and content failures delete the object first. A DB failure after inspection deletes it too (mirror of `AddVideoAsync`'s `finally`).

**Failing tests first:**
- `R2DirectVideoUploadStoreTests` (`[DockerFact]`, MinIO): `Presigned_put_uploads_and_inspect_reports_size_type_and_header`; `Inspect_returns_null_for_a_missing_upload`; `A_put_with_another_content_type_is_refused_by_the_bucket` (403); `Promote_moves_the_upload_to_the_720p_key`; `Url_expires_after_one_hour` (`X-Amz-Expires` in [3600, 3602]).
- `DirectVideoUploadApiTests` (`[DockerFact]`, Postgres + MinIO via `MinioFixture`):
  - `Start_says_multipart_when_the_storage_is_file`; `Start_says_multipart_when_direct_upload_is_off` (R2, flag false).
  - `Start_refuses_a_type_other_than_mp4_or_webm`; `Start_refuses_more_than_250_MB`.
  - `Direct_upload_then_complete_creates_a_processing_video_and_queues_it` (conversion on) — `status == "Processing"`, one `Pending` job, object still at `uploads/{id:N}/source`.
  - `Direct_upload_then_complete_without_conversion_creates_a_ready_video` — `Ready`, `videos/{id:N}/720p.mp4` exists, upload gone, `sizeBytes` equals the PUT size.
  - `Complete_into_a_course_adds_the_video_to_it` (`courseId` set).
  - `Complete_without_an_uploaded_object_is_not_found` — 404 `upload_not_found`, no catalog row.
  - `Complete_twice_is_a_conflict` — second call 409, one catalog row.
  - `Complete_with_a_file_that_is_not_a_video_deletes_it` — 400 `video_content_invalid`, object gone.
  - `Complete_of_an_object_larger_than_250_MB_deletes_it` — a `FakeDirectVideoUploadStore` via `ConfigureTestServices` reports `MaximumVideoSizeBytes + 1` → 400 `video_size_invalid`, `DeleteAsync` called, no catalog row.
  - `A_company_admin_cannot_start_an_upload` — tenant host → 404 (platform routes on company hosts, see DECISOES-VIDEO Task 1 ruling).
- Multipart tests in `PlatformCourseCatalogApiTests` and `VideoConversionApiTests` stay green untouched.

**Steps:**
- [ ] Tests → fail. Implement store (`GetPreSignedURL` with `Verb = PUT`, `ContentType`, `Protocol` like the playback URL; `GetObjectMetadataAsync`; `GetObjectAsync` with `ByteRange(0, 11)`), service methods, routes.
- [ ] Verify: filtered tests, full suite, `dotnet format`.
- [ ] Commit: `feat(video): direct browser upload to R2 with a presigned PUT and a verified complete`

### Task 6: Web picks the upload path from the API

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (`uploadPlatformVideo` keeps its signature; new types + internal helpers)
- Modify: `src/Web/SipatOnline.Web/src/api.test.ts`
- Modify: `deploy/nginx/security-headers.conf` (`connect-src 'self' https://*.r2.cloudflarestorage.com` in the report-only CSP)

**Interfaces:**
- `type VideoUploadStart = { mode: 'direct'; videoId: string; uploadUrl: string; method: 'PUT'; headers: Record<string, string>; expiresAt: string; maxSizeBytes: number } | { mode: 'multipart'; maxSizeBytes: number };`
- `uploadPlatformVideo(title, durationMilliseconds, file, courseId?)`: `POST /api/platform/catalog/videos/uploads` with `{ contentType: file.type, sizeBytes: file.size }`; `multipart` → today's `FormData` request unchanged; `direct` → `fetch(uploadUrl, { method: 'PUT', body: file, headers, credentials: 'omit' })` (no `X-CSRF-TOKEN`, no cookies: the bucket is another origin) then `POST …/uploads/{videoId}/complete` with `{ title, durationMilliseconds, courseId: courseId ?? null }`. A non-2xx PUT throws `ApiError('Não foi possível enviar o vídeo. Verifique a conexão e tente de novo.', status)` and does not call complete.
- `CourseMediaForms.tsx` unchanged (it already calls `uploadPlatformVideo` and shows `getErrorMessage`).

**Failing tests first** (vitest, `describe('video upload')` in `api.test.ts`, mocking `fetch`):
- `uploads straight to storage when the API offers a direct upload` — order: antiforgery, POST `/uploads`, PUT to `uploadUrl` with `Content-Type: video/mp4`, `credentials: 'omit'`, no `X-CSRF-TOKEN`; POST `/uploads/{id}/complete` with the title, duration and `courseId: null`; resolves to the complete response.
- `sends the course id to complete when uploading into a course`.
- `falls back to the multipart form when the API says multipart` — POST `/api/platform/catalog/videos` with `FormData` holding `title`, `durationMilliseconds`, `video`.
- `reports a failed direct PUT in Portuguese and does not complete`.
- `PlatformCoursesPage.test.tsx` stays green untouched.

**Steps:**
- [ ] Tests → fail; implement; `cd src/Web && npm run lint -w sipat-online-web && npm test -w sipat-online-web`.
- [ ] Manual check on the local docker stack (File): upload in the operator library still works (one extra `/uploads` call answering `multipart`).
- [ ] Commit: `feat(web): operator video upload goes straight to R2 when the API offers it`

### Task 7: API settings for running behind the Worker

**Files:**
- Modify: `src/Api/SipatOnline.Api/Program.cs` (forwarded headers `KnownNetworks`; `GET /health/conversion`)
- Modify: `src/Api/SipatOnline.Api/TenantResolutionMiddleware.cs` (let `/health/conversion` through like `/health`)
- Create: `src/Infrastructure/SipatOnline.Infrastructure/Learning/VideoConversionActivity.cs` (singleton `IsBusy`, set/cleared by the processor around `ProcessClaimedAsync`)
- Modify: `tests/SipatOnline.IntegrationTests/HealthCheckTests.cs` (new tests only)
- Create: `tests/SipatOnline.IntegrationTests/ForwardedHeadersTests.cs`

**Interfaces:**
- `SipatOnline:ForwardedHeaders:KnownNetworks` (string[] of CIDR, parsed with `System.Net.IPNetwork.Parse`, added to `options.KnownIPNetworks`). Outside Development at least one of `KnownProxies` or `KnownNetworks` is required; the exception message names both. Invalid CIDR → `InvalidOperationException` naming the value.
- `GET /health/conversion` → `200 { "busy": false }`, anonymous, no tenant resolution, no rate limit.

**Failing tests first:**
- `HealthCheckTests.Conversion_health_reports_idle` (`[Fact]`) — 200, `busy == false`.
- `ForwardedHeadersTests.Accepts_a_known_network_instead_of_proxies` — Production environment, `KnownNetworks:0 = 0.0.0.0/0` → host builds; a request with `X-Forwarded-For: 203.0.113.9` is seen by the login limiter partition as `203.0.113.9` (assert via a test endpoint is overkill: assert `IOptions<ForwardedHeadersOptions>.Value.KnownIPNetworks` contains it).
- `ForwardedHeadersTests.Refuses_production_without_proxies_or_networks` — message contains `KnownNetworks`.
- `ForwardedHeadersTests.Refuses_an_invalid_network`.

**Steps:**
- [ ] Tests → fail; implement; verify full suite + `dotnet format`.
- [ ] Commit: `feat(api): trusted proxy networks and a conversion health probe for Cloudflare Containers`

### Task 8: Cloudflare deployment files, CI and runbook

**Files:**
- Create: `deploy/cloudflare/wrangler.jsonc`, `deploy/cloudflare/src/index.ts`, `deploy/cloudflare/package.json`, `deploy/cloudflare/package-lock.json`, `deploy/cloudflare/tsconfig.json`, `deploy/cloudflare/_headers`, `deploy/cloudflare/r2-cors.json`, `deploy/cloudflare/r2-lifecycle.json`
- Create: `.github/workflows/deploy-cloudflare.yml`
- Create: `deploy/CLOUDFLARE-CONTAINERS.md` (pt-BR)
- Modify: `docs/architecture/ADR-004-topologia-de-producao.md` (Ações 4, 5, 6, 7, 9 → `[x]` with "código pronto, falta ensaio em dev"), `deploy/README.md` (link to the runbook)

**Interfaces:**
- `wrangler.jsonc` (top level = shared; `env.dev` and `env.prod` repeat the non-inheritable keys):
  - `name` `sipat-online` / `sipat-online-dev` / `sipat-online-prod`; `main` `src/index.ts`; `compatibility_date` `2026-11-01`; `observability.enabled` true.
  - `assets`: `{ "directory": "../../src/Web/SipatOnline.Web/dist", "binding": "ASSETS", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*", "/health"] }`.
  - `containers`: `{ "class_name": "SipatApi", "image": "../../Dockerfile", "image_build_context": "../..", "instance_type": "standard-1", "max_instances": 5 }`, `{ "class_name": "SipatConverter", "image": "../../Dockerfile", "image_build_context": "../..", "instance_type": "standard-3", "max_instances": 1 }`.
  - `durable_objects.bindings`: `SIPAT_API` → `SipatApi`, `SIPAT_CONVERTER` → `SipatConverter`; `migrations`: `[{ "tag": "v1", "new_sqlite_classes": ["SipatApi", "SipatConverter"] }]`.
  - `triggers.crons`: `["0 * * * *"]`.
  - `vars` per env: `TENANT_BASE_DOMAIN`, `PLATFORM_HOST`, `R2_SERVICE_URL`, `R2_VIDEO_BUCKET` (`sipat-videos-dev` / `sipat-videos`), `API_INSTANCES` (`"2"` / `"3"`).
  - `routes` per env: `{ "pattern": "<PLATFORM_HOST>/*", "zone_name": "<zona>" }` and `{ "pattern": "*.<domínio>/*", "zone_name": "<zona>" }` (placeholders `ops.dev.exemplo.com.br` etc., replaced by the owner; wildcard needs a proxied `*` DNS record).
  - Worker secrets (`wrangler secret put --env <env>`): `DATABASE_CONNECTION_STRING`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- `src/index.ts`:
  - `class SipatApi extends Container<Env>`: `defaultPort = 8080`, `sleepAfter = "15m"`, `envVars = apiEnv(env, { worker: false })` set in the constructor.
  - `class SipatConverter extends Container<Env>`: `defaultPort = 8080`, `sleepAfter = "10m"`, `envVars = apiEnv(env, { worker: true })`; `override async onActivityExpired()` → `containerFetch` `/health/conversion`; `busy` → `renewActivityTimeout()`, else `stop()`.
  - `apiEnv(env, { worker })` → `ASPNETCORE_ENVIRONMENT=Production`, `ASPNETCORE_HTTP_PORTS=8080`, `ConnectionStrings__SipatOnline`, `SipatOnline__Tenant__BaseDomain`, `SipatOnline__Tenant__PlatformHost`, `SipatOnline__Tenant__Id=00000000-0000-0000-0000-000000000000`, `SipatOnline__VideoStorage__Provider=R2`, `SipatOnline__VideoStorage__R2__{ServiceUrl,AccessKeyId,SecretAccessKey,Bucket}`, `SipatOnline__VideoStorage__R2__DirectUpload=true`, `SipatOnline__VideoConversion__Enabled=true`, `SipatOnline__VideoConversion__WorkPath=/tmp/sipat-video-work`, `SipatOnline__VideoConversion__RunInBackground=<worker>`, `SipatOnline__ForwardedHeaders__KnownNetworks__0=0.0.0.0/0`, `SipatOnline__ForwardedHeaders__KnownNetworks__1=::/0`.
  - `fetch`: `/api/*` or `/health` → copy the request, delete incoming `X-Forwarded-*`, set `X-Forwarded-For = CF-Connecting-IP`, `X-Forwarded-Proto = https`, keep `Host`; `(await getRandom(env.SIPAT_API, Number(env.API_INSTANCES))).fetch(req)`; when `POST /api/platform/catalog/videos/uploads/*/complete` returns 201 → `ctx.waitUntil(wakeConverter(env))`. Everything else → `env.ASSETS.fetch(request)`.
  - `scheduled` → `wakeConverter(env)` = `env.SIPAT_CONVERTER.getByName("converter").fetch("http://converter/health")`.
- `_headers`: the nginx security headers (same values as `deploy/nginx/security-headers.conf`, incl. the report-only CSP with R2 in `connect-src`) for `/*`; `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.
- `r2-cors.json`: `AllowedOrigins: ["https://<PLATFORM_HOST>"]`, `AllowedMethods: ["PUT", "GET", "HEAD"]`, `AllowedHeaders: ["content-type"]`, `ExposeHeaders: ["ETag"]`, `MaxAgeSeconds: 3600` (applied with `wrangler r2 bucket cors set <bucket> --file r2-cors.json`).
- `r2-lifecycle.json`: prefix `uploads/` → delete objects after 7 days, abort incomplete multipart after 1 day; nothing on `videos/` (applied with `wrangler r2 bucket lifecycle set` or the dashboard).
- `.github/workflows/deploy-cloudflare.yml`: `on: push: branches: [main]` → environment `dev`; `push: tags: ['v*']` → environment `prod`; `workflow_dispatch`. Jobs: `verify` (`uses: ./.github/workflows/ci.yml`) → `deploy` (`environment: ${{ startsWith(github.ref, 'refs/tags/') && 'prod' || 'dev' }}`, `concurrency: cloudflare-<env>`, no cancel): checkout; setup .NET 10 and Node 22; `npm ci && npm run build -w sipat-online-web` in `src/Web`; copy `deploy/cloudflare/_headers` into `dist`; `docker build -t sipat-online-api:ci .`; `docker run --rm -e ConnectionStrings__SipatOnline="$DATABASE_CONNECTION_STRING" -e SipatOnline__Tenant__BaseDomain=… -e SipatOnline__Tenant__PlatformHost=… -e SipatOnline__ForwardedHeaders__KnownNetworks__0=0.0.0.0/0 -e ASPNETCORE_ENVIRONMENT=Production sipat-online-api:ci --initialize-database`; `npm ci` in `deploy/cloudflare`; `npx wrangler deploy --env <env>`. Secrets (names only): repository `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; per GitHub environment `DATABASE_CONNECTION_STRING`; per environment variables `TENANT_BASE_DOMAIN`, `PLATFORM_HOST`. The existing `deploy-production.yml` (VM) is untouched.
- `CLOUDFLARE-CONTAINERS.md` sections: O que é (Worker + Containers + Postgres gerenciado + R2); Pré-requisitos (Workers Paid, conta, zona, Docker no CI); Banco (Decision 13, recomendação Neon na região São Paulo — `sa-east-1` — **verificar disponibilidade**, endpoint direto, `SSL Mode=VerifyFull;Maximum Pool Size=10`; medir latência é o item 8); R2 (buckets `sipat-videos-dev`/`sipat-videos`, token por bucket, CORS, lifecycle); Segredos (`wrangler secret put` × 3, GitHub secrets); Primeiro deploy em `dev` (dono da plataforma: rodar o `--initialize-database` uma vez à mão com `PLATFORM_OPERATOR_*`, depois nunca mais); Proteção de login na borda (regra de Rate Limiting: expressão `http.request.method eq "POST" and http.request.uri.path in {"/api/identity/login" "/api/platform/identity/login"}`, por IP, 50 req / 10 s, bloqueio 10 s — o plano Free só permite período de 10 s; uma fábrica com 180 logins em 1–2 min fica em ~15–30 por 10 s); Conversão (instância `converter`, acordada pelo envio e de hora em hora); Limite de corpo (~100 MB no Free/Pro: por isso o envio vai direto ao R2; o formulário antigo só funciona na VM); Atualizar e voltar atrás (`wrangler rollback --env prod`; migrações só para frente); Voltar para a VM (o banco e o R2 são os mesmos; o runbook da VM vale). Itens "verificar" marcados: tamanhos de instância, `onActivityExpired`/`renewActivityTimeout` na versão instalada de `@cloudflare/containers`, preservação do `Host` no `containerFetch`.

**Tests / verification** (no account access from here):
- [ ] `cd deploy/cloudflare && npm ci && npx wrangler types --env dev && npx tsc --noEmit` — config parses and `index.ts` type-checks against the generated `Env`.
- [ ] `npx wrangler deploy --dry-run --env dev --outdir dist-dry` and the same for `prod` (needs Docker running for the container image build; if wrangler refuses offline, record the exact message in the runbook's "verificar" list and in the commit body).
- [ ] `npx wrangler check startup` if available in the installed version (optional).
- [ ] `actionlint .github/workflows/deploy-cloudflare.yml` if installed, otherwise a YAML parse (`python -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/deploy-cloudflare.yml`).
- [ ] Re-run the full .NET and web suites once more (nothing in this task should change them).
- [ ] Commit: `feat(deploy): Cloudflare Worker, Containers config, deploy workflow and runbook`

---

## Verification of the whole plan

- [ ] `dotnet test SipatOnline.slnx --configuration Release` green (Docker + ffmpeg available for the `DockerFfmpegFact` tests).
- [ ] `cd src/Web && npm test && npm run build` green.
- [ ] `dotnet format whitespace SipatOnline.slnx --verify-no-changes`.
- [ ] Local stack: `docker compose --env-file .env --profile tools run --rm db-init && docker compose --env-file .env up --build -d`; log in, upload a video (multipart, File), it converts; restart `api`, still logged in.
- [ ] VM compose renders: `docker compose --env-file deploy/.env.production.example -f deploy/compose.production.yaml config` (with placeholders filled) shows no `aspnet-data-protection` volume and `R2__DirectUpload` defaulting to `false`.
