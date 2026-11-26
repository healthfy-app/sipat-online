using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

/// <summary>A company with units, sectors, people and trainings, driven through the API as its administrator does.</summary>
internal sealed class TrainingAudienceScenario : IAsyncDisposable
{
    private readonly PostgreSqlContainer postgres;
    private readonly Dictionary<string, Guid> people = [];

    private TrainingAudienceScenario(PostgreSqlContainer postgres, SipatOnlineApiFactory factory, HttpClient admin)
    {
        this.postgres = postgres;
        Factory = factory;
        Admin = admin;
    }

    public SipatOnlineApiFactory Factory { get; }

    public HttpClient Admin { get; }

    public static async Task<TrainingAudienceScenario> StartAsync()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), false);
        await using (var scope = factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var admin = Client(factory);
        var scenario = new TrainingAudienceScenario(postgres, factory, admin);
        await scenario.Send(HttpMethod.Post, "/api/identity/login", new LoginRequest("admin-root", "AdminPassword123"), HttpStatusCode.NoContent);
        return scenario;
    }

    public async Task<Guid> UnitAsync(string name) => Named(await Send(HttpMethod.Post, "/api/admin/registry/units", new { names = new[] { name } }), "units", name);

    public async Task<Guid> SectorAsync(string name) => Named(await Send(HttpMethod.Post, "/api/admin/registry/sectors", new { names = new[] { name } }), "sectors", name);

    /// <summary>A participant, created and then placed in the unit and sector given (as the administrator does).</summary>
    public async Task<Guid> PersonAsync(string login, Guid? unitId = null, Guid? sectorId = null)
    {
        var created = await Send(HttpMethod.Post, "/api/admin/users",
            new { loginIdentifier = login, displayName = login, initialPassword = "SenhaInicial123", role = "Participant" }, HttpStatusCode.Created);
        var id = created.GetProperty("id").GetGuid();
        people[login] = id;
        if (unitId is not null || sectorId is not null)
            await Send(HttpMethod.Put, $"/api/admin/users/{id:D}/profile", new { unitId, sectorId });
        return id;
    }

    /// <summary>Moves people to a unit (or out of any, with null) the way the list of collaborators does.</summary>
    public Task<JsonElement> PlaceAsync(string field, Guid? valueId, params string[] logins) =>
        Send(HttpMethod.Put, "/api/admin/users/placement", new { userIds = logins.Select(login => people[login]).ToArray(), field, valueId });

    /// <summary>A draft training that is live today, with one video in each of its days.</summary>
    public async Task<Guid> TrainingAsync(string title, int days = 2)
    {
        var start = new DateTimeOffset(DateTime.UtcNow.Date, TimeSpan.Zero);
        var created = await Send(HttpMethod.Post, "/api/admin/sipats",
            new { title, description = (string?)null, startsAt = start, endsAt = start.AddDays(5) }, HttpStatusCode.Created);
        var id = created.GetProperty("id").GetGuid();
        await PlanAsync(id, days);
        return id;
    }

    public async Task PlanAsync(Guid sipatId, int days)
    {
        var start = DateTime.UtcNow.Date;
        var plan = new List<object>();
        for (var index = 0; index < days; index++)
        {
            var video = await VideoAsync($"{sipatId:N} dia {index + 1}");
            plan.Add(new { title = $"Dia {index + 1}", date = start.AddDays(index).ToString("yyyy-MM-dd"), subject = (string?)null, videoIds = new[] { video }, gameIds = Array.Empty<Guid>() });
        }

        await Send(HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = plan });
    }

    /// <summary>Marks who the training is for: each group is a unit, a sector of a unit, or (no unit) a sector in every unit.</summary>
    public Task<JsonElement> AudienceAsync(Guid sipatId, (Guid? Unit, Guid? Sector)[] targets, HttpStatusCode expected = HttpStatusCode.OK) =>
        Send(HttpMethod.Put, $"/api/admin/sipats/{sipatId}/audience", Body(targets), expected);

    public Task<JsonElement> CountAsync(params (Guid? Unit, Guid? Sector)[] targets) =>
        Send(HttpMethod.Post, "/api/admin/registry/audience-count", Body(targets));

    public static (Guid? Unit, Guid? Sector)[] Targets(JsonElement audience) =>
        audience.GetProperty("targets").EnumerateArray().Select(item => (Optional(item, "unitId"), Optional(item, "sectorId"))).ToArray();

    private static object Body((Guid? Unit, Guid? Sector)[] targets) =>
        new { targets = targets.Select(target => new { unitId = target.Unit, sectorId = target.Sector }).ToArray() };

    private static Guid? Optional(JsonElement item, string property) =>
        item.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetGuid() : null;

    public Task LaunchAsync(Guid sipatId) => Send(HttpMethod.Post, $"/api/admin/sipats/{sipatId}/plan/launch", new { });

    /// <summary>How many days of the training the person has.</summary>
    public async Task<int> DaysAsync(string login, Guid sipatId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var person = people[login];
        return await db.LearningAssignments.CountAsync(assignment => assignment.ParticipantId == person && assignment.RevokedAt == null &&
            db.LearningTracks.Any(track => track.Id == assignment.TrackId && track.SipatEventId == sipatId));
    }

    /// <summary>The person watched a little of the first day of the training.</summary>
    public async Task StartWatchingAsync(string login, Guid sipatId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var track = await db.LearningTracks.Where(item => item.SipatEventId == sipatId).OrderBy(item => item.DayPosition).FirstAsync();
        var lesson = await db.LearningLessons.FirstAsync(item => item.TrackId == track.Id && item.RevisionId == track.CurrentRevisionId);
        var now = DateTimeOffset.UtcNow;
        db.LearningProgress.Add(new LearningProgressEntity
        {
            Id = Guid.NewGuid(),
            TenantId = track.TenantId,
            ParticipantId = people[login],
            TrackId = track.Id,
            RevisionId = lesson.RevisionId,
            LessonId = lesson.Id,
            DurationMilliseconds = lesson.DurationMilliseconds,
            CompletionThresholdPercent = 90,
            LastPlaybackPositionMilliseconds = 1000,
            FirstStartedAt = now,
            LastAccessedAt = now
        });
        await db.SaveChangesAsync();
    }

    /// <summary>Hands the first day of the training to one person, as the administrator can do by hand.</summary>
    public async Task HandFirstDayAsync(string login, Guid sipatId)
    {
        Guid trackId;
        await using (var scope = Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            trackId = await db.LearningTracks.Where(item => item.SipatEventId == sipatId).OrderBy(item => item.DayPosition).Select(item => item.Id).FirstAsync();
        }

        await Send(HttpMethod.Post, $"/api/admin/learning/tracks/{trackId}/assignments", new { participantId = people[login] }, HttpStatusCode.Created);
    }

    public async Task<JsonElement> Get(string path)
    {
        using var response = await Admin.GetAsync(path);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path}: {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    public async Task<JsonElement> Send(HttpMethod method, string path, object body, HttpStatusCode expected = HttpStatusCode.OK)
    {
        var token = (await Admin.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery"))!.RequestToken;
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        using var response = await Admin.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{method} {path}: expected {expected}, received {response.StatusCode}: {text}");
        if (text.Length == 0) return default;
        using var json = JsonDocument.Parse(text);
        return json.RootElement.Clone();
    }

    public async ValueTask DisposeAsync()
    {
        Admin.Dispose();
        await Factory.DisposeAsync();
        await postgres.DisposeAsync();
    }

    public static Guid[] Ids(JsonElement element, string property) =>
        element.GetProperty(property).EnumerateArray().Select(item => item.GetGuid()).ToArray();

    private static Guid Named(JsonElement registry, string list, string name) =>
        registry.GetProperty(list).EnumerateArray().Single(item => item.GetProperty("name").GetString() == name).GetProperty("id").GetGuid();

    private async Task<Guid> VideoAsync(string title)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var id = Guid.NewGuid();
        db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = id,
            Title = title,
            ContentType = "video/mp4",
            SizeBytes = 16,
            DurationMilliseconds = 5000,
            CreatedAt = DateTimeOffset.UtcNow
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
}
