# Vídeo externo (YouTube, Vimeo) como bônus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operator can add a YouTube or Vimeo link as a library video; participants watch it inside the same player frame as a bonus that never counts for progress, completion, certificate or game unlocking.

**Architecture:** An external video is a catalog video with `Provider` + `ExternalId` and no file. When distributed it becomes a lesson flagged `IsBonus` with reference `youtube:<id>` / `vimeo:<id>`. Every count of lessons filters bonus out; the playback/progress endpoints refuse bonus lessons. The web swaps the inner player (`<video>` → provider iframe) by the lesson's provider.

**Tech Stack:** .NET (EF Core, PostgreSQL, minimal APIs), React + TypeScript (Vite, vitest), workspace package `@sipat/video-player` (`src/Web/SipatVideoPlayer`).

**Spec:** `docs/superpowers/specs/2026-11-15-video-externo-design.md`

## Global Constraints

- House videos must behave exactly as today: no existing test may be edited to pass (add tests, do not change old assertions). Go-live is 1/12.
- Provider values: `Sipat` (default), `YouTube`, `Vimeo`. Lesson references: `catalog:<guid:D>` (unchanged), `youtube:<id>`, `vimeo:<id>`.
- Embeds: YouTube `https://www.youtube-nocookie.com/embed/<id>`, Vimeo `https://player.vimeo.com/video/<id>?dnt=1`. No provider script is loaded, only the iframe.
- Accepted links: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`, `vimeo.com/<id>`, `player.vimeo.com/video/<id>` (with or without `www.`/`m.`, http or https, extra query ignored). YouTube id: 11 chars `[A-Za-z0-9_-]`. Vimeo id: digits only.
- A Day holds 1 to 5 house videos plus at most 3 extras; a Day with only extras is refused.
- `OwnerTenantId` on a catalog video is always null in this stage.
- User-facing text in Brazilian Portuguese, using SIPAT, Dia, Assunto, Vídeo; the badge text is `Extra`.
- New migrations start with a UTF-8 BOM and pass `dotnet format` (one member per line), like the existing ones.
- Commits: conventional prefix in English, ending with the `Co-Authored-By` trailer of the session.

## Review Focus

1. A link with tracking junk (`youtu.be/ID?si=...&t=30`, `watch?v=ID&list=...`) is accepted and stores only the id — Task 1.
2. A SIPAT in progress gets an extra inserted before a video with checkpoint games already answered: the answers stay attached to the same video — Task 5.
3. A Day or Assunto whose last item is an extra: the end game still opens after the last house video, and the track reaches 100 % — Tasks 4 and 8.
4. The company network blocks YouTube: the participant sees a message and a link, the list and "Próximo vídeo" keep working — Tasks 6 and 8.
5. The same external link added twice: the second attempt returns the existing library item instead of a duplicate — Task 2.

---

### Task 1: Link parsing and lesson reference helpers

**Files:**
- Create: `src/Modules/Learning/Application/SipatOnline.Learning.Application/Catalog/ExternalVideo.cs`
- Test: `tests/SipatOnline.Application.UnitTests/ExternalVideoTests.cs`

**Interfaces — Produces:**
```csharp
public enum VideoProvider { Sipat = 0, YouTube = 1, Vimeo = 2 }
public static class ExternalVideoLink
{
    public static bool TryParse(VideoProvider provider, string? url, out string externalId);
}
public static class LessonReference
{
    public static string For(PlatformCourseVideo video);              // catalog:<id:D> | youtube:<id> | vimeo:<id>
    public static bool IsBonus(string reference);                    // true for youtube: / vimeo:
    public static bool TryParseExternal(string reference, out VideoProvider provider, out string externalId);
}
```
(`LessonReference.For` compiles after Task 2 adds `Provider`/`ExternalId` to the record; in this task write it against two parameters `(Guid id, VideoProvider provider, string? externalId)` and add the record overload in Task 2.)

- [ ] **Step 1: Failing tests** — theory `Parses(provider, url, expectedId)` with: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, `https://youtu.be/dQw4w9WgXcQ?si=abc&t=30`, `https://m.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ`, `https://www.youtube.com/shorts/dQw4w9WgXcQ`, `https://www.youtube.com/embed/dQw4w9WgXcQ`, `http://youtube.com/watch?v=dQw4w9WgXcQ` → `dQw4w9WgXcQ`; `https://vimeo.com/76979871`, `https://player.vimeo.com/video/76979871?h=x` → `76979871`. Theory `Refuses(provider, url)`: null, `""`, `"dQw4w9WgXcQ"` (no host), `https://evil.com/watch?v=dQw4w9WgXcQ`, `https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ`, `https://www.youtube.com/watch?v=short`, `https://www.youtube.com/playlist?list=PL1`, `https://vimeo.com/channels/staff`, a YouTube link with `VideoProvider.Vimeo`, any link with `VideoProvider.Sipat`, `javascript:alert(1)`. Reference tests: `For(id, Sipat, null) == $"catalog:{id:D}"`, `For(id, YouTube, "abc") == "youtube:abc"`, `IsBonus("catalog:...") == false`, `IsBonus("development:x") == false`, `IsBonus("vimeo:1") == true`, `TryParseExternal` round-trips.
- [ ] **Step 2:** `dotnet test tests/SipatOnline.Application.UnitTests --filter ExternalVideo` → fails to compile.
- [ ] **Step 3:** Implement with `Uri.TryCreate` (absolute, http/https) and an exact host allow-list; no regex over the whole string.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(catalog): parse YouTube and Vimeo links`.

### Task 2: External video in the catalog

**Files:**
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/PlatformCourseEntity.cs` (`PlatformCourseVideoEntity`), `PlatformCourseEntityConfiguration.cs`, `EfPlatformCourseCatalogStore.cs`
- Create: migration `AddExternalCatalogVideos` in `src/Infrastructure/SipatOnline.Infrastructure/Migrations/`
- Modify: `Catalog/PlatformCourseCatalog.cs`, `Catalog/IPlatformCourseCatalogStore.cs`, `Catalog/PlatformCourseCatalogService.cs`, `Catalog/ExternalVideo.cs`
- Modify: `src/Api/SipatOnline.Api/Endpoints/PlatformCourseCatalogEndpoints.cs`
- Modify: the conversion queue/processor and `CatalogVideoCopier.cs` (skip external)
- Test: `tests/SipatOnline.IntegrationTests/PlatformCourseCatalogApiTests.cs` (new tests only)

**Interfaces — Produces:**
- Entity columns: `Provider` (string, max 16, default `"Sipat"`), `ExternalId` (string?, max 32), `OwnerTenantId` (Guid?, null). Unique index on `(Provider, ExternalId)` filtered to `ExternalId IS NOT NULL`.
- `PlatformCourseVideo` gains trailing optional params `VideoProvider Provider = VideoProvider.Sipat, string? ExternalId = null`; `LessonReference.For(PlatformCourseVideo video)`.
- Store: `Task<PlatformCourseVideo> AddExternalVideoAsync(VideoProvider provider, string externalId, string title, long durationMilliseconds, DateTimeOffset createdAt, CancellationToken token)` and `Task<PlatformCourseVideo?> FindExternalVideoAsync(VideoProvider provider, string externalId, CancellationToken token)`.
- Service: `Task<Result<PlatformCourseVideo>> CreateExternalVideoAsync(string? provider, string? url, string? title, long? durationMilliseconds, CancellationToken token)`. Errors: `learning.catalog.external_provider_invalid` ("Escolha YouTube ou Vimeo."), `learning.catalog.external_link_invalid` ("Não reconhecemos este link. Cole o endereço do vídeo no YouTube ou no Vimeo."), title rules = the existing upload title rules; duration null or `< 0` → 0. An existing `(provider, externalId)` returns that item (success, no duplicate). Stored: `Status = Ready`, `ContentType = "external"`, `SizeBytes = 0`, `HasSd480 = false`.
- Endpoint: `POST /api/platform/catalog/videos/external`, body `{ provider, url, title, durationMilliseconds }`, same policy/antiforgery as the upload route, 201 with the video DTO. Video DTO gains `provider` (`"Sipat" | "YouTube" | "Vimeo"`) and `externalId`; `fileUrl` is `""` for external.
- `GET .../videos/{id}/file` → 404 for external. Checkpoints route → 409 `learning.catalog.external_no_checkpoints` ("Vídeo externo não recebe jogos no meio."). Conversion enqueue (`EnqueueMissingSd480Async` and re-convert) and the R2 copier filter `Provider == "Sipat"`.

- [ ] **Step 1: Failing integration tests** — `Creates_an_external_youtube_video` (201; `provider == "YouTube"`, `externalId == "dQw4w9WgXcQ"`, `status == "Ready"`, appears in the library list); `Same_link_twice_returns_the_same_video` (ids equal, library count +1); `Refuses_an_unknown_link` (400, code `learning.catalog.external_link_invalid`); `External_video_has_no_file` (404); `External_video_refuses_checkpoints` (409); `Company_admin_cannot_create_external_video` (404, same as other platform routes on a company host); `Uploaded_video_reports_provider_sipat`.
- [ ] **Step 2:** `dotnet test tests/SipatOnline.IntegrationTests --filter PlatformCourseCatalogApiTests` → new tests FAIL.
- [ ] **Step 3:** Implement entity, configuration, migration (`dotnet ef migrations add AddExternalCatalogVideos` from the Infrastructure project, then BOM + format), store mapping (every place that builds `PlatformCourseVideo` passes provider/externalId), service, endpoint, skips.
- [ ] **Step 4:** Same command → PASS; then `dotnet test tests/SipatOnline.IntegrationTests --filter "VideoConversion|CatalogVideoCopier"` → PASS.
- [ ] **Step 5:** Commit `feat(catalog): external videos as library items`.

### Task 3: Day rules count extras apart

**Files:**
- Modify: `Catalog/SipatPrograms.cs` (`ProgramDayRules.CleanAsync`, `SipatProgramService`)
- Test: `tests/SipatOnline.Application.UnitTests` (file that already tests `ProgramDayRules`; if none, `ProgramDayRulesTests.cs`)

**Interfaces — Produces:** `SipatProgramService.MaximumExtrasPerDay = 3`. In `CleanAsync`, after loading each video: house = `Provider == Sipat`. Errors: house count 0 or > `MaximumVideosPerDay` → existing `learning.program.day_videos_invalid` with message `O dia "{title}" precisa ter de 1 a 5 vídeos nossos.` only when extras are present (keep today's message otherwise); extras > 3 → `learning.program.day_extras_invalid`, `O dia "{title}" pode ter até 3 vídeos extras.`

- [ ] **Step 1: Failing tests** — 5 house + 3 extras OK; 5 house + 4 extras → `day_extras_invalid`; 6 house → `day_videos_invalid`; 0 house + 1 extra → `day_videos_invalid`; order of `VideoIds` preserved with an extra in the middle.
- [ ] **Step 2–4:** run `--filter ProgramDayRules`, implement, pass.
- [ ] **Step 5:** Commit `feat(program): extras do not count in the five videos of a Day`.

### Task 4: Bonus lessons for the participant (server)

**Files:**
- Modify: `src/Modules/Learning/Domain/SipatOnline.Learning.Domain/Tracks/LearningLesson.cs`, `LearningTrackRevision.cs`
- Modify: `src/Infrastructure/SipatOnline.Infrastructure/Learning/LearningEntities.cs`, `LearningEntityConfigurations.cs`, migration `AddBonusLessons`
- Modify: `LearningDistributionService.cs`, `EfLearningStore.cs`, `EfLearningEngagementStore.cs`, `EfPlaybackQualityStore.cs`, `EfPlaybackQualityDashboardStore.cs`, `EfLessonMediaStore.cs`, `Identity/EfPlatformUserDirectoryStore.cs`, `EfPlatformCourseCatalogStore.cs:88`
- Modify: `Learning.Application/LearningTrackCard.cs`, `src/Api/SipatOnline.Api/Endpoints/LearningEndpoints.cs`
- Test: `tests/SipatOnline.IntegrationTests/LearningApiTests.cs`, `LearningEngagementApiTests.cs`, `tests/SipatOnline.Domain.UnitTests` (lesson)

**Interfaces:**
- Consumes: `LessonReference.For/IsBonus/TryParseExternal`, `PlatformCourseVideo.Provider`.
- Produces:
  - `LearningLessonEntity.IsBonus` (bool, default false). Domain: `LearningLesson.IsBonus`; `LearningLesson.Create(..., bool isBonus = false)` and `LearningTrackRevision.AddLesson(title, description, reference, durationMilliseconds, bool isBonus = false)`; duration 0 is valid only when `isBonus`.
  - `LearningLessonProgress` gains trailing `bool IsBonus = false, string? Provider = null, string? ExternalId = null`; the participant lesson DTO gains `isBonus`, `provider`, `externalId` (provider/externalId null for house lessons).
  - Distribution (`CreateTrackFromCourseAsync`, `RefreshDayTrackAsync`): reference = `LessonReference.For(video)`, `IsBonus = video.Provider != Sipat`. `SectionTitle` is looked up by the video's index in `course.Videos` (today it does `Guid.Parse(reference.Replace("catalog:", ""))`, which throws for `youtube:`). `DistributeAsync` and `ApplyDaysAsync` refuse a course whose videos are all external with the existing "curso publicado com vídeos" / `program_day_empty` errors.
  - **Counting:** every query that counts or sums lessons for progress, completion, "X de Y", duration, reports, dashboards or the certificate uses only `!IsBonus` lessons. Sites (grep `LearningLessons` and `Lessons.All`/`Lessons.Count`): `EfLearningStore.cs` 82, 151, 158, 179, 279–330, 376–410, 461, 519; `EfLearningEngagementStore.cs` 90–92 (certificate: duration and `All(IsCompleted)` over non-bonus; a track with only bonus lessons never certifies); `EfPlatformUserDirectoryStore.cs` 193, 220; `EfPlaybackQualityDashboardStore.cs` 168. The participant experience still **lists** bonus lessons (in position order); only the numbers skip them.
  - **Refusal:** `POST .../lessons/{id}/playback`, `PUT .../position`, `POST .../ranges` and playback-quality for a bonus lesson → 409 `learning.lesson.bonus` ("Este vídeo é um extra e não registra progresso."). `EfLessonMediaStore` returns not found for bonus.
  - **Activities:** in `EfLearningEngagementStore.GetActivitiesAsync`, a placement's `AfterVideoCount` is returned as the position of the last non-bonus lesson at or before it (0 if none). The checkpoint loop keeps index pairing (`content.Videos[i]` ↔ `Lessons[i]`, bonus included; bonus videos have no checkpoints).

- [ ] **Step 1: Failing tests** — domain: `Bonus_lesson_accepts_zero_duration`, `House_lesson_still_refuses_zero_duration`. Integration (build a course `[house A, youtube X, house B]` through the API, distribute, log in as participant): `Experience_lists_the_extra_in_position` (3 lessons, second has `isBonus`, `provider == "YouTube"`, `externalId`); `Track_counts_only_house_videos` (`lessonCount == 2`; after completing A and B: `progressPercentage == 100`, `isCompleted`); `Extra_refuses_playback_and_ranges` (409 `learning.lesson.bonus` on the three routes); `Certificate_is_ready_without_watching_the_extra`; `Company_report_counts_two_lessons`; `End_game_after_a_trailing_extra_is_due_after_the_last_house_video` (course `[A, X]` with a placement `AfterVideoCount = 2` → activity returned with `afterVideoCount == 1`); `Section_title_survives_an_extra` (lesson groups keep their titles).
- [ ] **Step 2:** `dotnet test tests/SipatOnline.IntegrationTests --filter "LearningApiTests|LearningEngagementApiTests"` → new tests FAIL.
- [ ] **Step 3:** Implement. Migration `AddBonusLessons` (BOM, format).
- [ ] **Step 4:** Full `dotnet test` → PASS (all old tests untouched).
- [ ] **Step 5:** Commit `feat(learning): bonus lessons never count for progress or certificate`.

### Task 5: Safe refresh of a SIPAT already in progress

**Files:**
- Modify: `LearningDistributionService.cs` (`RefreshDayTrackAsync`, `DistributeAsync`)
- Test: `tests/SipatOnline.IntegrationTests/SipatEventApiTests.cs` or `LearningApiTests.cs` (new tests)

**Interfaces — Produces:** private `Task<bool> MergeBonusLessonsAsync(LearningTrackEntity track, Guid revisionId, PlatformCourse course, CancellationToken token)`.

Rule, used when the track **has progress** (today such a track is left untouched):
- Let `old` = current lessons by position, `next` = `course.Videos`. If the sequence of non-bonus references of `old` differs from that of `next` → return false, change nothing (today's behaviour).
- Otherwise: every house lesson entity is kept (same `Id`), bonus lessons are matched by reference (kept), missing ones are inserted, bonus lessons no longer in `next` are removed; all get `Position` = index in `next` + 1; the content snapshot JSON, track title/description are updated.
- The unique index `(TenantId, RevisionId, Position)` (`LearningEntityConfigurations.cs:74`) forbids transient duplicates: renumber in two saves (first to negative positions) inside one transaction.
- Checkpoint outcomes are keyed `checkpoint-{index}-{n}` by 0-based lesson index: for each kept house lesson whose index changed, rewrite `LearningActivityOutcomes.ActivityId` for that `RevisionId` from `checkpoint-{oldIndex}-` to `checkpoint-{newIndex}-`, in an order that cannot collide (descending when shifting up, ascending when shifting down).
- `RefreshDayTrackAsync`: when progress exists, call the merge instead of returning false. Tracks without progress keep the current replace path. `DistributeAsync`: when the track already exists, load the course and call the merge (ignore a false result), then return the track id as today.

- [ ] **Step 1: Failing tests** — `Extra_added_to_a_day_in_progress_keeps_progress`: apply a day `[A, B]`; participant completes A (and has a `completed` outcome on a checkpoint of B, index 1); change the day to `[A, X, B]`, apply again → result `Updated == 1`; lesson ids of A and B unchanged; A still completed with the same `completedAt`; B's checkpoint activity still has outcome `completed`; positions are 1, 2, 3. `Extra_removed_from_a_day_in_progress_keeps_progress` (reverse). `House_change_in_a_day_in_progress_is_still_kept` (`[A, B]` → `[A, C]` with progress → `Kept == 1`, lessons unchanged). `Certificate_already_issued_is_unchanged_after_an_extra`. `Distribute_again_adds_the_extra_to_a_live_assunto`.
- [ ] **Step 2–4:** run the filter → FAIL; implement; full `dotnet test` → PASS.
- [ ] **Step 5:** Commit `feat(learning): add extras to a SIPAT in progress without touching progress`.

### Task 6: External player in the package

**Files:**
- Create: `src/Web/SipatVideoPlayer/src/core/external.ts`, `src/react/ExternalVideoPlayer.tsx`
- Modify: `src/react/SipatVideoPlayer.css`, `src/react/texts.ts`, `src/index.ts`, `playground/` (one external example)
- Test: `src/Web/SipatVideoPlayer/test/external.test.ts`, `test/ExternalVideoPlayer.test.tsx`

**Interfaces — Produces:**
```ts
export type ExternalProvider = 'YouTube' | 'Vimeo';
export function externalEmbedUrl(provider: ExternalProvider, externalId: string): string;
export function externalWatchUrl(provider: ExternalProvider, externalId: string): string; // youtu.be/<id> | vimeo.com/<id>
export interface ExternalVideoPlayerProps {
  provider: ExternalProvider; externalId: string; title: string;
  /** ms without the iframe `load` event before the blocked message shows. Default 8000. */
  blockedAfterMs?: number;
}
export default function ExternalVideoPlayer(props: ExternalVideoPlayerProps): JSX.Element;
```
The component renders the same outer frame element/classes as `PlayerChrome` (same radius, 16:9, background) with an `<iframe title={title} src={externalEmbedUrl(...)} allow="fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy">`. No rules, no events, no save. If `load` has not fired after `blockedAfterMs`, the frame shows `texts.externalBlocked` = "Este vídeo não abriu na sua rede." and a link `texts.externalOpenOutside` = "Abrir no {provider}" (`target="_blank" rel="noopener noreferrer"`, `externalWatchUrl`). `externalEmbedUrl` throws on an id that does not match the Global Constraints patterns (defence against a crafted id reaching `src`).

- [ ] **Step 1: Failing tests** — URLs exact per Global Constraints; throws for `"a/b"` and `"x?y"`; component: iframe `src` and `title`; with fake timers, no `load` after 8000 ms → message + link `href`; `load` fired before → no message; link has `rel="noopener noreferrer"`.
- [ ] **Step 2–4:** `npm test -w @sipat/video-player` → FAIL, implement, PASS.
- [ ] **Step 5:** Commit `feat(player): external provider player in the same frame`.

### Task 7: Operator screens — provider choice and "Extra" marks

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/api.ts` (+ `api.test.ts`), `courseEditor/AddVideoDialog.tsx`, `courseEditor/CourseEditor.tsx`, `courseEditor/CourseOutlinePanel.tsx`, `courseEditor/CoursePreviewCanvas.tsx`, `courseEditor/courseFormat.ts`, `VideoPreview.tsx`, the library list in `courseCatalog/`, `sipatBuilder/model.ts`, `sipatBuilder/ThemeCards.tsx`, `sipatBuilder/SipatBuilderPage.tsx`
- Test: `PlatformCoursesPage.test.tsx` (new tests), `sipatBuilder/model.test.ts`, `sipatBuilder/SipatBuilderPage.test.tsx` (new tests)

**Interfaces:**
- Consumes: `POST /api/platform/catalog/videos/external`; `ExternalVideoPlayer`.
- Produces: `PlatformCourseVideo` type gains `provider: 'Sipat' | 'YouTube' | 'Vimeo'` and `externalId: string | null` (missing in old payloads reads as `'Sipat'`/`null`); `createExternalPlatformVideo(data: { provider: 'YouTube' | 'Vimeo'; url: string; title: string; durationMilliseconds: number | null }): Promise<PlatformCourseVideo>`; helper `isExtra(video: { provider?: string }): boolean` exported from `api.ts`.

Behaviour:
- `AddVideoDialog`: a three-option segmented choice at the top, labels `Nosso vídeo` (default) · `YouTube` · `Vimeo`. `Nosso vídeo` shows today's content unchanged. YouTube/Vimeo show: `Link do vídeo` (required), `Título` (required), `Duração (min)` (optional, whole minutes), a preview (`ExternalVideoPlayer`) once the link parses on the client (same accepted shapes; the server remains the authority), the line "Vídeo extra: não conta no progresso nem no certificado.", and the button `Adicionar`. On success the new video is linked to the lesson the dialog was opened for (same path as picking a library video). Server error messages show under the link field.
- Outline, properties panel, library list, builder `DayBox` and theme cards: an external video shows a small muted `Extra` badge after the title and the provider name where the duration normally is when duration is 0. Editor previews use `ExternalVideoPlayer`. Checkpoint/game-in-video controls are hidden for external videos.
- Counts and totals ("N vídeos · mm:ss", Day total, SIPAT total) use only house videos; when extras exist the summary appends ` + N extra(s)`.
- Builder limits: `maxVideoRows` allows 5 house + 3 extras per Day; the client blocks a sixth house video and a fourth extra with the server's messages.

- [ ] **Step 1: Failing tests** — dialog: choosing YouTube shows the link field and hides the library list; a valid link + title calls `createExternalPlatformVideo` with `{ provider: 'YouTube', url, title, durationMilliseconds: null }` and then links the video; an invalid link keeps `Adicionar` disabled; outline shows `Extra` for an external video; summary `2 vídeos · 10:00 + 1 extra`; builder: day with 5 house + 1 extra is valid and saves all 6 ids in order; `api.test.ts`: old payload without `provider` reads as `Sipat`.
- [ ] **Step 2–4:** `npm test -w SipatOnline.Web` → new FAIL; implement; PASS with every old test untouched.
- [ ] **Step 5:** Commit `feat(web): add YouTube and Vimeo videos as extras in an Assunto`.

### Task 8: Participant screen

**Files:**
- Modify: `src/Web/SipatOnline.Web/src/learning/LearningTrackPage.tsx`, `api.ts` (lesson type), `LearningActivitiesPanel.tsx` only if needed for a null `videoRef`
- Test: `src/Web/SipatOnline.Web/src/LearningPage.test.tsx` (new tests)

**Interfaces — Consumes:** lesson fields `isBonus`, `provider`, `externalId`; `ExternalVideoPlayer`. Activities already arrive with the effective `afterVideoCount` (Task 4).

Behaviour:
- Selecting a bonus lesson renders `ExternalVideoPlayer` in the place of `SipatVideoPlayer` (same container, title and "Próximo vídeo"). No call to playback session, position, ranges or quality; no resume request; leaving it triggers no save.
- List: a bonus lesson shows the title, a muted `Extra · YouTube` (or `Vimeo`) where the duration/percentage is, no progress ring and no check. It is always selectable.
- `completedLessonCount`, `progressPercentage`, the "X de Y" label and durations (the local recompute at `LearningTrackPage.tsx:239-266` and line 489) use only non-bonus lessons.
- Initial/resume selection never picks a bonus lesson on its own unless asked by URL; "next lesson" after a house video may be a bonus lesson and "next" after a bonus goes on to the following lesson.

- [ ] **Step 1: Failing tests** — track `[A, X(bonus YouTube), B]`: list shows `Extra · YouTube` on X and no check; header `0 de 2`; clicking X renders an iframe with the nocookie URL and makes **no** request to `/playback`, `/position`, `/ranges` or `/playback-quality`; with A and B completed the header shows `2 de 2` and 100 %; "Próximo vídeo" from A goes to X and from X to B; opening the track with no progress selects A when the first lesson is a bonus `[X, A]`.
- [ ] **Step 2–4:** `npm test -w SipatOnline.Web -- LearningPage` → FAIL; implement; full web suite PASS.
- [ ] **Step 5:** Commit `feat(web): participants watch extras in the same player frame`.

### Task 9: Site security header and records

**Files:**
- Modify: `deploy/nginx/security-headers.conf`, `docs/architecture/ADR-001-player-e-entrega-de-video.md`, `docs/superpowers/specs/2026-11-15-video-externo-design.md` (status → implemented)

- [ ] **Step 1:** In the `Content-Security-Policy-Report-Only` value add `frame-src https://www.youtube-nocookie.com https://player.vimeo.com;` (nothing else changes; `script-src` stays `'self'`).
- [ ] **Step 2:** ADR-001: add a dated note "2026-11-15 — vídeos extras": the rule "nada vai para terceiros" now has one exception, the provider iframe of an extra video (nocookie / `dnt=1`), never for house videos; no progress or quality data is sent about it.
- [ ] **Step 3: Verify in the running app** — start the stack, as operator add a YouTube extra to an Assunto between two house videos, apply to a SIPAT, as participant: the extra plays in the frame, the count ignores it, completing the two house videos gives 100 %, the browser console shows no CSP report for the iframe. Capture a screenshot of the participant screen.
- [ ] **Step 4:** Full `dotnet test` and `npm test` (from `src/Web`) → PASS.
- [ ] **Step 5:** Commit `chore: allow provider iframes in the CSP and record the exception in ADR-001`.
