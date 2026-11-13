using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Identity;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class SipatPlanApiTests
{
    [DockerFact]
    public async Task Administrator_BuildsADraftWeek_LaunchesItOnePublishedAtATime_AndReusesAnotherSipat()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), developmentSampleEnabled: true);
        Guid firstVideo, secondVideo;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            firstVideo = await AddVideoAsync(db, "A1V1 - Abertura");
            secondVideo = await AddVideoAsync(db, "A1V2 - Encerramento");
        }

        using var admin = Client(factory);
        await Send(admin, HttpMethod.Post, "/api/identity/login", new LoginRequest("admin-root", "AdminPassword123"), HttpStatusCode.NoContent);

        // the administrator sees what a day can be made of, read only
        var catalog = await Get(admin, "/api/admin/sipat-catalog");
        Assert.Empty(catalog.GetProperty("videos").EnumerateArray()); // videos outside a published assunto are not offered

        // a SIPAT starts as a draft, with the days of a week
        var start = new DateTimeOffset(2026, 11, 9, 0, 0, 0, TimeSpan.Zero);
        var created = await Send(admin, HttpMethod.Post, "/api/admin/sipats",
            new SipatEventDataRequestBody("SIPAT 2026", null, start, start.AddDays(2)), HttpStatusCode.Created);
        var sipatId = created.GetProperty("id").GetGuid();
        Assert.Equal("Draft", created.GetProperty("status").GetString());

        var days = new[]
        {
            Day("Boa postura e movimento", "2026-11-09", firstVideo),
            Day("Mente tranquila", "2026-11-10", secondVideo, firstVideo)
        };
        var saved = await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days });
        Assert.Equal(2, saved.GetArrayLength());
        Assert.Equal("Mente tranquila", saved[1].GetProperty("title").GetString());

        var summaries = await Get(admin, "/api/admin/sipat-plans");
        var summary = Assert.Single(summaries.EnumerateArray(), item => item.GetProperty("sipatEventId").GetGuid() == sipatId);
        Assert.Equal(2, summary.GetProperty("days").GetInt32());
        Assert.Equal(3, summary.GetProperty("videos").GetInt32());

        // a day without videos, or with a video that does not exist, is refused
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan",
            new { days = new[] { Day("Sem vídeos", "2026-11-09") } }, HttpStatusCode.BadRequest);
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan",
            new { days = new[] { Day("Vídeo fantasma", "2026-11-09", Guid.NewGuid()) } }, HttpStatusCode.BadRequest);

        // the sample company already has a published SIPAT: only one at a time
        var conflict = await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{sipatId}/plan/launch", new { }, HttpStatusCode.Conflict);
        Assert.Equal("sipat.already_published", conflict.GetProperty("code").GetString());

        var sipats = await Get(admin, "/api/admin/sipats");
        var published = Assert.Single(sipats.GetProperty("items").EnumerateArray(), item => item.GetProperty("status").GetString() == "Published");
        await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{published.GetProperty("id").GetGuid()}/cancel", new { });

        var launched = await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{sipatId}/plan/launch", new { });
        Assert.Equal(2, launched.GetProperty("created").GetInt32());
        var launchedAgain = await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{sipatId}/plan/launch", new { });
        Assert.Equal(0, launchedAgain.GetProperty("created").GetInt32());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tracks = await db.LearningTracks.AsNoTracking().Where(track => track.SipatEventId == sipatId).OrderBy(track => track.DayPosition).ToListAsync();
            Assert.Equal([1, 2], tracks.Select(track => track.DayPosition!.Value));
            Assert.Equal("Boa postura e movimento", tracks[0].DayTitle);
            Assert.Equal(new DateOnly(2026, 11, 9), tracks[0].DayDate);
            Assert.Equal(1, await db.LearningLessons.CountAsync(lesson => lesson.TrackId == tracks[0].Id));
            Assert.Equal(2, await db.LearningLessons.CountAsync(lesson => lesson.TrackId == tracks[1].Id));
        }

        // next year's SIPAT starts from this one: same themes, new days, dates left to the new start date
        var next = await Send(admin, HttpMethod.Post, "/api/admin/sipats",
            new SipatEventDataRequestBody("SIPAT 2027", null, start.AddYears(1), start.AddYears(1).AddDays(2)), HttpStatusCode.Created);
        var nextId = next.GetProperty("id").GetGuid();
        var copy = await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{nextId}/plan/copy-from/{sipatId}", new { });
        Assert.Equal(2, copy.GetArrayLength());
        Assert.Equal("Boa postura e movimento", copy[0].GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, copy[0].GetProperty("date").ValueKind);
        Assert.NotEqual(saved[0].GetProperty("id").GetGuid(), copy[0].GetProperty("id").GetGuid());

        // an empty SIPAT cannot go live
        var empty = await Send(admin, HttpMethod.Post, "/api/admin/sipats",
            new SipatEventDataRequestBody("SIPAT vazia", null, start.AddYears(2), start.AddYears(2).AddDays(1)), HttpStatusCode.Created);
        await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{empty.GetProperty("id").GetGuid()}/plan/launch", new { }, HttpStatusCode.BadRequest);
    }

    private static object Day(string title, string date, params Guid[] videos) =>
        new { title, date, subject = (string?)null, videoIds = videos, gameIds = Array.Empty<Guid>() };

    private static async Task<Guid> AddVideoAsync(PlatformDbContext db, string title)
    {
        var id = Guid.NewGuid();
        db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = id, Title = title, ContentType = "video/mp4", SizeBytes = 16, DurationMilliseconds = 5000, CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static HttpClient Client(SipatOnlineApiFactory factory) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });

    private static async Task<JsonElement> Get(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path}: {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    private static async Task<JsonElement> Send(HttpClient client, HttpMethod method, string path, object body,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        var token = (await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery"))!.RequestToken;
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        if (expected == HttpStatusCode.NoContent) return default;
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    private sealed record SipatEventDataRequestBody(string Title, string? Description, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
}
