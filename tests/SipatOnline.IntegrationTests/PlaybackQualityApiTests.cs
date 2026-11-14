using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class PlaybackQualityApiTests
{
    private static readonly byte[] VideoBytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];

    [DockerFact]
    public async Task Records_a_report_once_and_keeps_the_last_values()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var id = Guid.NewGuid();
            await Post(participant, seed, Body(seed, id, stallCount: 1), HttpStatusCode.NoContent);
            await Post(participant, seed, Body(seed, id, stallCount: 3), HttpStatusCode.NoContent);

            var rows = await Rows(factory, id);
            var row = Assert.Single(rows);
            Assert.Equal(3, row.StallCount);
            Assert.Equal(seed.TrackId, row.TrackId);
            Assert.Equal(seed.VideoId, row.VideoId);
            Assert.NotEqual(Guid.Empty, row.SipatEventId);
            Assert.Equal(DefaultTenant, row.TenantId);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Ignores_tenant_and_participant_sent_in_the_body()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var id = Guid.NewGuid();
            var body = Body(seed, id, stallCount: 0);
            body["tenantId"] = Guid.NewGuid();
            body["participantId"] = Guid.NewGuid();
            await Post(participant, seed, body, HttpStatusCode.NoContent);

            var row = Assert.Single(await Rows(factory, id));
            Assert.Equal(DefaultTenant, row.TenantId);
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var userId = await db.Users.Where(user => user.EmployeeIdentifier == "participant-demo")
                .Select(user => user.Id).SingleAsync();
            Assert.Equal(userId, row.ParticipantId);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_a_lesson_that_is_not_assigned()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var id = Guid.NewGuid();
            var otherLesson = Body(seed, id, stallCount: 0);
            otherLesson["lessonId"] = Guid.NewGuid();
            var refused = await Post(participant, seed, otherLesson, HttpStatusCode.NotFound);
            Assert.Equal("learning.lesson_not_found", refused.GetProperty("code").GetString());

            var otherTrack = await Post(participant, seed with { TrackId = Guid.NewGuid() }, Body(seed, id, stallCount: 0), HttpStatusCode.NotFound);
            Assert.Equal("learning.lesson_not_found", otherTrack.GetProperty("code").GetString());
            Assert.Empty(await Rows(factory, id));
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_an_id_already_used_by_someone_else()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory, "second-participant");
        try
        {
            using var first = Client(factory);
            using var second = Client(factory);
            await Login(first, "participant-demo");
            await Login(second, "second-participant");
            await AssignSecond(factory, seed);
            var id = Guid.NewGuid();
            await Post(first, seed, Body(seed, id, stallCount: 2), HttpStatusCode.NoContent);
            var refused = await Post(second, seed, Body(seed, id, stallCount: 9), HttpStatusCode.BadRequest);
            Assert.Equal("learning.playback_quality_invalid", refused.GetProperty("code").GetString());

            var row = Assert.Single(await Rows(factory, id));
            Assert.Equal(2, row.StallCount);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_without_antiforgery()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            using var ranges = new HttpRequestMessage(HttpMethod.Post,
                $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/ranges")
            { Content = JsonContent.Create(new { sessionId = Guid.NewGuid(), startMilliseconds = 0, endMilliseconds = 1, positionMilliseconds = 1 }) };
            using var rangesResponse = await participant.SendAsync(ranges);

            var id = Guid.NewGuid();
            using var request = new HttpRequestMessage(HttpMethod.Post, $"/api/learning/tracks/{seed.TrackId}/playback-quality")
            { Content = JsonContent.Create(Body(seed, id, stallCount: 0)) };
            using var response = await participant.SendAsync(request);
            Assert.Equal(rangesResponse.StatusCode, response.StatusCode);
            Assert.NotEqual(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Empty(await Rows(factory, id));
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_invalid_values()
    {
        await using var postgres = await StartPostgres();
        await using var factory = Factory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var id = Guid.NewGuid();
            var body = Body(seed, id, stallCount: 0);
            body["stallMs"] = -1;
            var refused = await Post(participant, seed, body, HttpStatusCode.BadRequest);
            Assert.Equal("learning.playback_quality_invalid", refused.GetProperty("code").GetString());

            var unknownDevice = Body(seed, id, stallCount: 0);
            unknownDevice["device"] = "fridge";
            var refusedDevice = await Post(participant, seed, unknownDevice, HttpStatusCode.BadRequest);
            Assert.Equal("learning.playback_quality_invalid", refusedDevice.GetProperty("code").GetString());
            Assert.Empty(await Rows(factory, id));
        }
        finally { await Cleanup(factory, seed); }
    }

    private static readonly Guid DefaultTenant = SipatOnlineApiFactory.DefaultTenantId;

    private sealed record Seeded(Guid VideoId, Guid TrackId, Guid LessonId);

    private static Dictionary<string, object?> Body(Seeded seed, Guid id, int stallCount) => new()
    {
        ["id"] = id,
        ["lessonId"] = seed.LessonId,
        ["playbackSessionId"] = Guid.NewGuid(),
        ["startedAt"] = DateTimeOffset.UtcNow.AddMinutes(-2),
        ["timezoneOffsetMinutes"] = -180,
        ["startupMs"] = 800,
        ["neverStarted"] = false,
        ["stallCount"] = stallCount,
        ["stallMs"] = 1200,
        ["watchedMs"] = 60_000,
        ["errorKind"] = null,
        ["quality"] = "720p",
        ["qualitySwitches"] = 1,
        ["connectionType"] = "4g",
        ["downlinkMbps"] = 8.5,
        ["device"] = "phone"
    };

    private static Task<JsonElement> Post(HttpClient client, Seeded seed, Dictionary<string, object?> body, HttpStatusCode expected) =>
        Call(client, $"/api/learning/tracks/{seed.TrackId}/playback-quality", HttpMethod.Post, body, expected);

    private static async Task<List<PlaybackQualitySessionEntity>> Rows(WebApplicationFactory<Program> factory, Guid id)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        return await db.PlaybackQualitySessions.AsNoTracking().Where(item => item.Id == id).ToListAsync();
    }

    private static async Task AssignSecond(WebApplicationFactory<Program> factory, Seeded seed)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var userId = await db.Users.Where(user => user.EmployeeIdentifier == "second-participant")
            .Select(user => user.Id).SingleAsync();
        var updated = await db.LearningAssignments
            .Where(item => item.TrackId == seed.TrackId && item.ParticipantId == userId)
            .ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, (DateTimeOffset?)null));
        if (updated > 0) return;
        var template = await db.LearningAssignments.AsNoTracking().Where(item => item.TrackId == seed.TrackId).FirstAsync();
        db.LearningAssignments.Add(new LearningAssignmentEntity
        {
            Id = Guid.NewGuid(),
            TenantId = template.TenantId,
            TrackId = seed.TrackId,
            ParticipantId = userId,
            AssignedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private static WebApplicationFactory<Program> Factory(string connectionString) =>
        new SipatOnlineApiFactory(connectionString, developmentSampleEnabled: true)
            .WithWebHostBuilder(builder => builder.UseSetting("SipatOnline:Learning:Playback:Provider", "Catalog"));

    private static async Task<Seeded> Seed(WebApplicationFactory<Program> factory, string? secondParticipant = null)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var sipatId = await db.SipatEvents.Select(item => item.Id).SingleAsync();
        await db.LearningAssignments.ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
        if (secondParticipant is not null)
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<PlatformIdentityUser>>();
            var user = new PlatformIdentityUser
            {
                Id = Guid.NewGuid(),
                UserName = $"account-{Guid.NewGuid():N}",
                TenantId = SipatOnlineApiFactory.DefaultTenantId,
                EmployeeIdentifier = secondParticipant,
                NormalizedEmployeeIdentifier = secondParticipant.ToUpperInvariant(),
                DisplayName = secondParticipant,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            };
            Assert.True((await users.CreateAsync(user, "ParticipantPassword123")).Succeeded);
            Assert.True((await users.AddToRoleAsync(user, PlatformRoles.Participant)).Succeeded);
        }

        var videoId = Guid.NewGuid();
        var storage = scope.ServiceProvider.GetRequiredService<IPlatformCourseVideoStorage>();
        await using var stream = new MemoryStream(VideoBytes);
        Assert.True((await storage.SaveAsync(videoId, stream, "video/mp4", VideoBytes.Length, CancellationToken.None)).IsSuccess);
        db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = videoId,
            Title = "Vídeo de produção",
            ContentType = "video/mp4",
            SizeBytes = VideoBytes.Length,
            DurationMilliseconds = 1000,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        using var platform = Client(factory, "ops.localhost");
        await Call(platform, "/api/platform/identity/login", HttpMethod.Post,
            new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
        var course = await Call(platform, "/api/platform/catalog/courses", HttpMethod.Post,
            new { title = "Curso de produção", description = "Curso do teste", gamificationEnabled = false }, HttpStatusCode.Created);
        var courseId = course.GetProperty("id").GetGuid();
        await Call(platform, $"/api/platform/catalog/courses/{courseId}/videos", HttpMethod.Put, new { videoIds = new[] { videoId } });
        await Call(platform, $"/api/platform/catalog/courses/{courseId}", HttpMethod.Put,
            new { title = "Curso de produção", description = "Curso do teste", status = "Published", gamificationEnabled = false });
        var association = await Call(platform,
            $"/api/platform/companies/{SipatOnlineApiFactory.DefaultTenantId:D}/learning/sipats/{sipatId}/courses/{courseId}",
            HttpMethod.Post, new { });
        var trackId = association.GetProperty("trackId").GetGuid();
        using var participant = Client(factory);
        await Login(participant, "participant-demo");
        var experience = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}");
        return new Seeded(videoId, trackId, experience.GetProperty("lessons")[0].GetProperty("id").GetGuid());
    }

    private static async Task Cleanup(WebApplicationFactory<Program> factory, Seeded seed)
    {
        await factory.Services.GetRequiredService<IPlatformCourseVideoStorage>().DeleteAsync(seed.VideoId, CancellationToken.None);
    }

    private static Task Login(HttpClient client, string identifier) =>
        Call(client, "/api/identity/login", HttpMethod.Post,
            new LoginRequest(identifier, "ParticipantPassword123"), HttpStatusCode.NoContent);

    private static HttpClient Client(WebApplicationFactory<Program> factory, string host = "integration-test.localhost") =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });

    private static async Task<JsonElement> Call(HttpClient client, string path, HttpMethod method, object body,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        if (expected == HttpStatusCode.NoContent) return default;
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }
}
