using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class LearningApiTests
{
    [DockerFact]
    public async Task DevelopmentSample_PlaysAndPersistsVerifiedProgress()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var clock = new TestClock(DateTimeOffset.UtcNow);
        await using var baseFactory = new SipatOnlineApiFactory(
            postgres.GetConnectionString(),
            developmentSampleEnabled: true);
        await using var factory = baseFactory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services => services.AddSingleton<TimeProvider>(clock)));
        await InitializeDatabaseAsync(factory);
        await InitializeDatabaseAsync(factory);

        using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        await SignInAdminAsync(client);

        using var adminTracksResponse = await client.GetAsync("/api/learning/tracks");
        // the company admin also takes the trainings
        Assert.Equal(HttpStatusCode.OK, adminTracksResponse.StatusCode);

        using var tenantTracksResponse = await client.GetAsync("/api/admin/learning/tracks");
        Assert.Equal(HttpStatusCode.OK, tenantTracksResponse.StatusCode);
        using var tenantTracksJson = JsonDocument.Parse(await tenantTracksResponse.Content.ReadAsStringAsync());
        var tenantTracks = tenantTracksJson.RootElement.EnumerateArray().ToArray();
        Assert.Equal(4, tenantTracks.Length);
        Assert.All(tenantTracks, track => Assert.True(track.GetProperty("isPublished").GetBoolean()));

        using var participationResponse = await client.GetAsync("/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.OK, participationResponse.StatusCode);
        using var participationJson = JsonDocument.Parse(
            await participationResponse.Content.ReadAsStringAsync());
        Assert.Contains(
            participationJson.RootElement.EnumerateArray(),
            row => row.GetProperty("loginIdentifier").GetString() == "participant-demo");
        // every progress row says which training it belongs to
        var trainingOfTrack = tenantTracks.ToDictionary(track => track.GetProperty("id").GetGuid(), track => track.GetProperty("sipatEventId").GetGuid());
        Assert.All(participationJson.RootElement.EnumerateArray(), row =>
            Assert.Equal(trainingOfTrack[row.GetProperty("trackId").GetGuid()], row.GetProperty("sipatEventId").GetGuid()));
        // and enough of the training to pick it, for viewers who cannot list trainings (a Supervisor)
        Assert.All(participationJson.RootElement.EnumerateArray(), row =>
        {
            Assert.False(string.IsNullOrWhiteSpace(row.GetProperty("sipatTitle").GetString()));
            Assert.Equal("Published", row.GetProperty("sipatStatus").GetString());
            Assert.True(row.GetProperty("sipatEndsAt").GetDateTimeOffset() > row.GetProperty("sipatStartsAt").GetDateTimeOffset());
        });

        var sipatEventId = tenantTracks[0].GetProperty("sipatEventId").GetGuid();
        var token = await GetAntiforgeryTokenAsync(client);
        using var createTrackResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/sipats/{sipatEventId:D}/tracks",
            new { title = "Trilha criada pela administração", description = "Rascunho retomável" },
            token);
        Assert.Equal(HttpStatusCode.Created, createTrackResponse.StatusCode);
        using var createdTrackJson = JsonDocument.Parse(
            await createTrackResponse.Content.ReadAsStringAsync());
        var createdTrackId = createdTrackJson.RootElement.GetProperty("id").GetGuid();

        using var emptyDraftResponse = await client.GetAsync(
            $"/api/admin/learning/tracks/{createdTrackId:D}/draft");
        Assert.Equal(HttpStatusCode.OK, emptyDraftResponse.StatusCode);
        using var emptyDraftJson = JsonDocument.Parse(await emptyDraftResponse.Content.ReadAsStringAsync());
        Assert.Empty(emptyDraftJson.RootElement.GetProperty("lessons").EnumerateArray());

        token = await GetAntiforgeryTokenAsync(client);
        using var addLessonResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{createdTrackId:D}/lessons",
            new
            {
                title = "Vídeo autorizado",
                description = (string?)null,
                providerAssetReference = "development:mdn-flower-demo",
                durationMilliseconds = 5055
            },
            token);
        Assert.Equal(HttpStatusCode.Created, addLessonResponse.StatusCode);

        using var resumedDraftResponse = await client.GetAsync(
            $"/api/admin/learning/tracks/{createdTrackId:D}/draft");
        Assert.Equal(HttpStatusCode.OK, resumedDraftResponse.StatusCode);
        using var resumedDraftJson = JsonDocument.Parse(
            await resumedDraftResponse.Content.ReadAsStringAsync());
        var resumedLesson = Assert.Single(
            resumedDraftJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal("Vídeo autorizado", resumedLesson.GetProperty("title").GetString());
        Assert.Equal(
            "development:mdn-flower-demo",
            resumedLesson.GetProperty("providerAssetReference").GetString());

        using var participantsResponse = await client.GetAsync("/api/admin/users/participants");
        Assert.Equal(HttpStatusCode.OK, participantsResponse.StatusCode);
        var participants = await participantsResponse.Content.ReadFromJsonAsync<UserListResponse>();
        Assert.NotNull(participants);
        Assert.Equal("participant-demo", Assert.Single(participants.Items).LoginIdentifier);

        using var participantClient = factory.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://integration-test.localhost"),
                AllowAutoRedirect = false
            });
        await SignInParticipantAsync(participantClient);

        using var participantAdminReportResponse = await participantClient.GetAsync(
            "/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.Forbidden, participantAdminReportResponse.StatusCode);

        using var tracksResponse = await participantClient.GetAsync("/api/learning/tracks");
        Assert.Equal(HttpStatusCode.OK, tracksResponse.StatusCode);
        using var tracksJson = JsonDocument.Parse(await tracksResponse.Content.ReadAsStringAsync());
        var tracks = tracksJson.RootElement.EnumerateArray().ToArray();
        Assert.Equal(4, tracks.Length);
        Assert.Equal(
            new[]
            {
                "Ergonomia e atividade física",
                "Alimentação para uma vida saudável",
                "Comportamento seguro",
                "Demonstração técnica — vídeo e progresso"
            },
            tracks.Select(track => track.GetProperty("title").GetString()));
        Assert.Equal(4, tracks.Select(track => track.GetProperty("id").GetGuid()).Distinct().Count());
        var demoTrack = Assert.Single(
            tracks,
            track => track.GetProperty("title").GetString() == "Demonstração técnica — vídeo e progresso");
        var trackId = demoTrack.GetProperty("id").GetGuid();

        using var experienceResponse = await participantClient.GetAsync($"/api/learning/tracks/{trackId:D}");
        Assert.Equal(HttpStatusCode.OK, experienceResponse.StatusCode);
        using var experienceJson = JsonDocument.Parse(await experienceResponse.Content.ReadAsStringAsync());
        var lesson = Assert.Single(experienceJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal("Vídeo público de demonstração — flores (MDN)", lesson.GetProperty("title").GetString());
        var lessonId = lesson.GetProperty("id").GetGuid();

        token = await GetAntiforgeryTokenAsync(participantClient);
        using var playbackResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            HttpMethod.Post,
            $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/playback",
            new { },
            token);
        Assert.Equal(HttpStatusCode.OK, playbackResponse.StatusCode);
        using var playbackJson = JsonDocument.Parse(await playbackResponse.Content.ReadAsStringAsync());
        Assert.True(playbackJson.RootElement.GetProperty("isDevelopmentDemo").GetBoolean());
        Assert.Equal(
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            playbackJson.RootElement.GetProperty("url").GetString());
        Assert.Equal("video/mp4", playbackJson.RootElement.GetProperty("contentType").GetString());
        var sessionId = playbackJson.RootElement.GetProperty("sessionId").GetGuid();

        token = await GetAntiforgeryTokenAsync(participantClient);
        using var rangeResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            HttpMethod.Post,
            $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/ranges",
            new
            {
                sessionId,
                startMilliseconds = 0,
                endMilliseconds = 2000,
                positionMilliseconds = 2000
            },
            token);
        Assert.Equal(HttpStatusCode.OK, rangeResponse.StatusCode);
        using var progressJson = JsonDocument.Parse(await rangeResponse.Content.ReadAsStringAsync());
        Assert.Equal(39, progressJson.RootElement.GetProperty("watchedPercentage").GetInt32());

        using var refreshedResponse = await participantClient.GetAsync($"/api/learning/tracks/{trackId:D}");
        Assert.Equal(HttpStatusCode.OK, refreshedResponse.StatusCode);
        using var refreshedJson = JsonDocument.Parse(await refreshedResponse.Content.ReadAsStringAsync());
        var refreshedLesson = Assert.Single(refreshedJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal(39, refreshedLesson.GetProperty("watchedPercentage").GetInt32());
        Assert.Equal(2000, refreshedLesson.GetProperty("lastPlaybackPositionMilliseconds").GetInt64());

        using var updatedParticipationResponse = await client.GetAsync("/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.OK, updatedParticipationResponse.StatusCode);
        using var updatedParticipationJson = JsonDocument.Parse(
            await updatedParticipationResponse.Content.ReadAsStringAsync());
        Assert.Contains(
            updatedParticipationJson.RootElement.EnumerateArray(),
            row =>
                row.GetProperty("trackId").GetGuid() == trackId &&
                row.GetProperty("progressPercentage").GetInt32() == 39);

        clock.Now = clock.Now.AddSeconds(2);
        foreach (var (end, coverage, completion, coursePercentage) in new[]
                 {
                     (4549, 89, false, 89),
                     (4550, 90, true, 100)
                 })
        {
            token = await GetAntiforgeryTokenAsync(participantClient);
            using var boundaryResponse = await SendJsonWithAntiforgeryAsync(
                participantClient,
                HttpMethod.Post,
                $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/ranges",
                new { sessionId, startMilliseconds = 2000, endMilliseconds = end, positionMilliseconds = end },
                token);
            Assert.Equal(HttpStatusCode.OK, boundaryResponse.StatusCode);
            using var boundary = JsonDocument.Parse(await boundaryResponse.Content.ReadAsStringAsync());
            Assert.Equal(coverage, boundary.RootElement.GetProperty("watchedPercentage").GetInt32());
            Assert.Equal(completion, boundary.RootElement.GetProperty("isCompleted").GetBoolean());

            using var detailResponse = await participantClient.GetAsync($"/api/learning/tracks/{trackId:D}");
            Assert.Equal(HttpStatusCode.OK, detailResponse.StatusCode);
            using var detail = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
            Assert.Equal(coursePercentage, detail.RootElement.GetProperty("track").GetProperty("progressPercentage").GetInt32());
            Assert.Equal(completion ? 1 : 0, detail.RootElement.GetProperty("track").GetProperty("completedLessonCount").GetInt32());
            var persistedLesson = Assert.Single(detail.RootElement.GetProperty("lessons").EnumerateArray());
            Assert.Equal(coverage, persistedLesson.GetProperty("watchedPercentage").GetInt32());
            Assert.Equal(completion, persistedLesson.GetProperty("isCompleted").GetBoolean());

            using var listResponse = await participantClient.GetAsync("/api/learning/tracks");
            Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
            using var list = JsonDocument.Parse(await listResponse.Content.ReadAsStringAsync());
            var listedTrack = Assert.Single(list.RootElement.EnumerateArray(),
                item => item.GetProperty("id").GetGuid() == trackId);
            Assert.Equal(coursePercentage, listedTrack.GetProperty("progressPercentage").GetInt32());

            using var reportResponse = await client.GetAsync("/api/admin/learning/participation");
            Assert.Equal(HttpStatusCode.OK, reportResponse.StatusCode);
            using var report = JsonDocument.Parse(await reportResponse.Content.ReadAsStringAsync());
            var reportedTrack = Assert.Single(report.RootElement.EnumerateArray(),
                item => item.GetProperty("trackId").GetGuid() == trackId && item.GetProperty("progressPercentage").GetInt32() > 0);
            Assert.Equal(coursePercentage, reportedTrack.GetProperty("progressPercentage").GetInt32());
            Assert.Equal(completion, reportedTrack.GetProperty("isCompleted").GetBoolean());
        }
    }

    [DockerFact]
    public async Task Experience_lists_the_extra_in_position()
    {
        await using var scenario = await BonusLessonScenario.StartAsync();

        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray().ToArray();

        Assert.Equal(3, lessons.Length);
        Assert.Equal(["Vídeo A", "Extra do YouTube", "Vídeo B"], lessons.Select(item => item.GetProperty("title").GetString()));
        Assert.Equal([1, 2, 3], lessons.Select(item => item.GetProperty("position").GetInt32()));
        Assert.Equal([false, true, false], lessons.Select(item => item.GetProperty("isBonus").GetBoolean()));
        Assert.Equal("YouTube", lessons[1].GetProperty("provider").GetString());
        Assert.Equal(BonusLessonScenario.YouTubeId, lessons[1].GetProperty("externalId").GetString());
        Assert.Equal(JsonValueKind.Null, lessons[0].GetProperty("provider").ValueKind);
        Assert.Equal(JsonValueKind.Null, lessons[0].GetProperty("externalId").ValueKind);
    }

    [DockerFact]
    public async Task Track_counts_only_house_videos()
    {
        await using var scenario = await BonusLessonScenario.StartAsync();
        var lessonIds = await scenario.LessonIdsAsync();

        var track = (await scenario.Experience()).GetProperty("track");
        Assert.Equal(2, track.GetProperty("lessonCount").GetInt32());
        Assert.Equal(2 * BonusLessonScenario.HouseDuration, track.GetProperty("durationMilliseconds").GetInt64());

        await scenario.CompleteAsync(lessonIds[0]);
        track = (await scenario.Experience()).GetProperty("track");
        Assert.Equal(50, track.GetProperty("progressPercentage").GetInt32());

        await scenario.CompleteAsync(lessonIds[2]);
        track = (await scenario.Experience()).GetProperty("track");
        Assert.Equal(100, track.GetProperty("progressPercentage").GetInt32());
        Assert.Equal(2, track.GetProperty("completedLessonCount").GetInt32());
        var card = Assert.Single((await scenario.Participant.GetFromJsonAsync<JsonElement>("/api/learning/tracks")).EnumerateArray());
        Assert.Equal(2, card.GetProperty("lessonCount").GetInt32());
        Assert.Equal(100, card.GetProperty("progressPercentage").GetInt32());
        var row = Assert.Single(
            (await scenario.Admin.GetFromJsonAsync<JsonElement>("/api/admin/learning/participation")).EnumerateArray(),
            // the admin takes the trainings too and has its own row, still at zero
            item => item.GetProperty("trackId").GetGuid() == scenario.TrackId && item.GetProperty("completedLessonCount").GetInt32() > 0);
        Assert.True(row.GetProperty("isCompleted").GetBoolean());
        Assert.Equal(100, row.GetProperty("progressPercentage").GetInt32());
    }

    [DockerFact]
    public async Task Extra_refuses_playback_and_ranges()
    {
        await using var scenario = await BonusLessonScenario.StartAsync();
        var extraId = (await scenario.LessonIdsAsync())[1];
        var lessonPath = $"/api/learning/tracks/{scenario.TrackId}/lessons/{extraId}";

        var refusals = new[]
        {
            await scenario.Call(scenario.Participant, $"{lessonPath}/playback", HttpMethod.Post, new { }, HttpStatusCode.Conflict),
            await scenario.Call(scenario.Participant, $"{lessonPath}/position", HttpMethod.Put,
                new { positionMilliseconds = 1000 }, HttpStatusCode.Conflict),
            await scenario.Call(scenario.Participant, $"{lessonPath}/ranges", HttpMethod.Post,
                new { sessionId = Guid.NewGuid(), startMilliseconds = 0, endMilliseconds = 1000, positionMilliseconds = 1000 },
                HttpStatusCode.Conflict),
            await scenario.Call(scenario.Participant, $"/api/learning/tracks/{scenario.TrackId}/playback-quality", HttpMethod.Post,
                new Dictionary<string, object?>
                {
                    ["id"] = Guid.NewGuid(),
                    ["lessonId"] = extraId,
                    ["playbackSessionId"] = Guid.NewGuid(),
                    ["startedAt"] = DateTimeOffset.UtcNow.AddMinutes(-2),
                    ["timezoneOffsetMinutes"] = -180,
                    ["startupMs"] = 800,
                    ["neverStarted"] = false,
                    ["stallCount"] = 0,
                    ["stallMs"] = 0,
                    ["watchedMs"] = 1000,
                    ["errorKind"] = null,
                    ["quality"] = "720p",
                    ["qualitySwitches"] = 0,
                    ["connectionType"] = "4g",
                    ["downlinkMbps"] = 8.5,
                    ["device"] = "phone"
                }, HttpStatusCode.Conflict)
        };

        Assert.All(refusals, item =>
        {
            Assert.Equal("learning.lesson.bonus", item.GetProperty("code").GetString());
            Assert.Equal("Este vídeo é um extra e não registra progresso.", item.GetProperty("detail").GetString());
        });
        using var media = await scenario.Participant.GetAsync($"/api/learning/lessons/{extraId}/media");
        Assert.Equal(HttpStatusCode.NotFound, media.StatusCode);
    }

    [DockerFact]
    public async Task Company_report_counts_two_lessons()
    {
        await using var scenario = await BonusLessonScenario.StartAsync();
        var lessonIds = await scenario.LessonIdsAsync();
        await scenario.CompleteAsync(lessonIds[0]);

        var row = Assert.Single(
            (await scenario.Admin.GetFromJsonAsync<JsonElement>("/api/admin/learning/participation")).EnumerateArray(),
            item => item.GetProperty("trackId").GetGuid() == scenario.TrackId && item.GetProperty("completedLessonCount").GetInt32() > 0);
        Assert.Equal(2, row.GetProperty("lessonCount").GetInt32());
        Assert.Equal(1, row.GetProperty("completedLessonCount").GetInt32());
        Assert.Equal(50, row.GetProperty("progressPercentage").GetInt32());
        Assert.False(row.GetProperty("isCompleted").GetBoolean());

        var summary = Assert.Single(
            (await scenario.Admin.GetFromJsonAsync<JsonElement>("/api/admin/learning/tracks")).EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == scenario.TrackId);
        Assert.Equal(2, summary.GetProperty("lessonCount").GetInt32());

        var employees = await scenario.Platform.GetFromJsonAsync<JsonElement>(
            $"/api/platform/companies/{SipatOnlineApiFactory.DefaultTenantId:D}/employees?search=participant-demo");
        var employee = Assert.Single(employees.GetProperty("items").EnumerateArray(),
            item => item.GetProperty("loginIdentifier").GetString() == "participant-demo");
        Assert.Equal(2, employee.GetProperty("lessonCount").GetInt32());
        Assert.Equal(1, employee.GetProperty("completedLessonCount").GetInt32());
        Assert.Equal(50, employee.GetProperty("progressPercentage").GetInt32());
    }

    [DockerFact]
    public async Task Section_title_survives_an_extra()
    {
        await using var scenario = await BonusLessonScenario.StartAsync();

        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray();

        Assert.Equal(["Aula 1", "Aula 1", "Aula 2"], lessons.Select(item => item.GetProperty("sectionTitle").GetString()));
    }

    [DockerFact]
    public async Task Extra_added_to_a_day_in_progress_keeps_progress()
    {
        await using var scenario = await BonusLessonScenario.StartEmptyAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var b = await scenario.SeedHouseVideoAsync("Vídeo B");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 60_000);
        await scenario.PlaceCheckpointAsync(b);
        await scenario.ApplyDayAsync(a, b);
        var before = await scenario.LessonIdsAsync();
        await scenario.CompleteAsync(before[0]);
        await scenario.AnswerAsync("checkpoint-1-0");
        var completedAt = (await scenario.Experience()).GetProperty("lessons")[0].GetProperty("completedAt").GetDateTimeOffset();

        var applied = await scenario.ApplyDayAsync(a, x, b);

        Assert.Equal(1, applied.GetProperty("updated").GetInt32());
        Assert.Equal(0, applied.GetProperty("kept").GetInt32());
        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal(["Vídeo A", "Extra do YouTube", "Vídeo B"], lessons.Select(item => item.GetProperty("title").GetString()));
        Assert.Equal([1, 2, 3], lessons.Select(item => item.GetProperty("position").GetInt32()));
        Assert.Equal([false, true, false], lessons.Select(item => item.GetProperty("isBonus").GetBoolean()));
        Assert.Equal(before[0], lessons[0].GetProperty("id").GetGuid());
        Assert.Equal(before[1], lessons[2].GetProperty("id").GetGuid());
        Assert.True(lessons[0].GetProperty("isCompleted").GetBoolean());
        Assert.Equal(completedAt, lessons[0].GetProperty("completedAt").GetDateTimeOffset());
        Assert.Equal(50, (await scenario.Experience()).GetProperty("track").GetProperty("progressPercentage").GetInt32());
        // the answer given on B's game stays on B, now the third lesson
        var game = Assert.Single((await scenario.Activities()).GetProperty("items").EnumerateArray(),
            item => item.GetProperty("lessonId").ValueKind == JsonValueKind.String);
        Assert.Equal(before[1], game.GetProperty("lessonId").GetGuid());
        Assert.Equal("checkpoint-2-0", game.GetProperty("id").GetString());
        Assert.Equal("completed", game.GetProperty("outcome").GetString());

        var again = await scenario.ApplyDayAsync(a, x, b);

        Assert.Equal(1, again.GetProperty("kept").GetInt32());
        Assert.Equal(lessons.Select(item => item.GetProperty("id").GetGuid()), await scenario.LessonIdsAsync());
        Assert.Equal("completed", Assert.Single((await scenario.Activities()).GetProperty("items").EnumerateArray()).GetProperty("outcome").GetString());
    }

    [DockerFact]
    public async Task Extra_removed_from_a_day_in_progress_keeps_progress()
    {
        await using var scenario = await BonusLessonScenario.StartEmptyAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 60_000);
        var b = await scenario.SeedHouseVideoAsync("Vídeo B");
        await scenario.PlaceCheckpointAsync(b);
        await scenario.ApplyDayAsync(a, x, b);
        var before = await scenario.LessonIdsAsync();
        await scenario.CompleteAsync(before[0]);
        await scenario.AnswerAsync("checkpoint-2-0");
        var completedAt = (await scenario.Experience()).GetProperty("lessons")[0].GetProperty("completedAt").GetDateTimeOffset();

        var applied = await scenario.ApplyDayAsync(a, b);

        Assert.Equal(1, applied.GetProperty("updated").GetInt32());
        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal([before[0], before[2]], lessons.Select(item => item.GetProperty("id").GetGuid()));
        Assert.Equal([1, 2], lessons.Select(item => item.GetProperty("position").GetInt32()));
        Assert.Equal([false, false], lessons.Select(item => item.GetProperty("isBonus").GetBoolean()));
        Assert.Equal(completedAt, lessons[0].GetProperty("completedAt").GetDateTimeOffset());
        var game = Assert.Single((await scenario.Activities()).GetProperty("items").EnumerateArray());
        Assert.Equal(before[2], game.GetProperty("lessonId").GetGuid());
        Assert.Equal("checkpoint-1-0", game.GetProperty("id").GetString());
        Assert.Equal("completed", game.GetProperty("outcome").GetString());
    }

    [DockerFact]
    public async Task House_change_in_a_day_in_progress_is_still_kept()
    {
        await using var scenario = await BonusLessonScenario.StartEmptyAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var b = await scenario.SeedHouseVideoAsync("Vídeo B");
        var c = await scenario.SeedHouseVideoAsync("Vídeo C");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 60_000);
        await scenario.ApplyDayAsync(a, b);
        var before = await scenario.LessonIdsAsync();
        await scenario.CompleteAsync(before[0]);

        var changed = await scenario.ApplyDayAsync(a, c);
        var changedWithExtra = await scenario.ApplyDayAsync(a, x, c);
        // answers are kept by the place of the game, so an extra never comes in together with other games
        await scenario.PlaceCheckpointAsync(a);
        var gamesChangedWithExtra = await scenario.ApplyDayAsync(a, x, b);

        foreach (var applied in new[] { changed, changedWithExtra, gamesChangedWithExtra })
        {
            Assert.Equal(1, applied.GetProperty("kept").GetInt32());
            Assert.Equal(0, applied.GetProperty("updated").GetInt32());
        }
        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal(before, lessons.Select(item => item.GetProperty("id").GetGuid()));
        Assert.Equal(["Vídeo A", "Vídeo B"], lessons.Select(item => item.GetProperty("title").GetString()));
        Assert.True(lessons[0].GetProperty("isCompleted").GetBoolean());
    }

    [DockerFact]
    public async Task Distribute_again_adds_the_extra_to_a_live_assunto()
    {
        await using var scenario = await BonusLessonScenario.StartEmptyAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var b = await scenario.SeedHouseVideoAsync("Vídeo B");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 60_000);
        await scenario.PlaceCheckpointAsync(b);
        var courseId = await scenario.CreateCourseAsync();
        await SetStructureAsync([a], [b]);
        await scenario.DeliverAsync(courseId);
        var trackId = scenario.TrackId;
        var before = await scenario.LessonIdsAsync();
        await scenario.CompleteAsync(before[0]);
        await scenario.AnswerAsync("checkpoint-1-0");

        await SetStructureAsync([a, x], [b]);
        var again = await scenario.Call(scenario.Platform,
            $"{BonusLessonScenario.CompanyPath}/sipats/{scenario.SipatId}/courses/{courseId}", HttpMethod.Post, new { });

        Assert.Equal(trackId, again.GetProperty("trackId").GetGuid());
        var lessons = (await scenario.Experience()).GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal(["Vídeo A", "Extra do YouTube", "Vídeo B"], lessons.Select(item => item.GetProperty("title").GetString()));
        Assert.Equal(["Aula 1", "Aula 1", "Aula 2"], lessons.Select(item => item.GetProperty("sectionTitle").GetString()));
        Assert.Equal(before[0], lessons[0].GetProperty("id").GetGuid());
        Assert.Equal(before[1], lessons[2].GetProperty("id").GetGuid());
        Assert.True(lessons[0].GetProperty("isCompleted").GetBoolean());
        var game = Assert.Single((await scenario.Activities()).GetProperty("items").EnumerateArray());
        Assert.Equal(before[1], game.GetProperty("lessonId").GetGuid());
        Assert.Equal("checkpoint-2-0", game.GetProperty("id").GetString());
        Assert.Equal("completed", game.GetProperty("outcome").GetString());
        await scenario.Call(scenario.Platform,
            $"{BonusLessonScenario.CompanyPath}/sipats/{scenario.SipatId}/courses/{courseId}", HttpMethod.Post, new { });
        await using (var scope = scenario.Factory.Services.CreateAsyncScope())
        {
            // recorded once: delivering the same course again changes nothing
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().AuditEntries
                .CountAsync(item => item.Action == "learning.course.extras_updated" && item.SubjectId == trackId.ToString("D")));
        }

        Task SetStructureAsync(Guid[] first, Guid[] second) =>
            scenario.Call(scenario.Platform, $"/api/platform/catalog/courses/{courseId}/structure", HttpMethod.Put, new
            {
                lessons = new[]
                {
                    new { id = (Guid?)null, title = "Aula 1", description = (string?)null, videos = first.Select(id => new { videoId = id, title = (string?)null }).ToArray() },
                    new { id = (Guid?)null, title = "Aula 2", description = (string?)null, videos = second.Select(id => new { videoId = id, title = (string?)null }).ToArray() }
                }
            });
    }

    private sealed class TestClock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private static async Task InitializeDatabaseAsync(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    private static async Task SignInAdminAsync(HttpClient client)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new { loginIdentifier = "admin-root", password = "AdminPassword123" },
            token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static async Task SignInParticipantAsync(HttpClient client)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new { loginIdentifier = "participant-demo", password = "ParticipantPassword123" },
            token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static async Task<string> GetAntiforgeryTokenAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/identity/antiforgery");
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token?.RequestToken);
        return token.RequestToken;
    }

    private static async Task<HttpResponseMessage> SendJsonWithAntiforgeryAsync<TRequest>(
        HttpClient client,
        HttpMethod method,
        string path,
        TRequest requestBody,
        string token)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = JsonContent.Create(requestBody)
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
}
