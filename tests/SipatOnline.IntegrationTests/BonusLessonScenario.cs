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

/// <summary>
/// A course built through the API with house videos and a YouTube extra, delivered to the sample company,
/// with the operator, the company admin and the sample participant signed in.
/// </summary>
internal sealed class BonusLessonScenario : IAsyncDisposable
{
    public const long HouseDuration = 1000;
    public const string YouTubeId = "dQw4w9WgXcQ";

    private readonly PostgreSqlContainer postgres;
    private Guid programId;
    private Guid dayId;

    private BonusLessonScenario(PostgreSqlContainer postgres, SipatOnlineApiFactory factory)
    {
        this.postgres = postgres;
        Factory = factory;
        Platform = Client("ops.localhost");
        Participant = Client();
        Admin = Client();
    }

    public SipatOnlineApiFactory Factory { get; }

    public HttpClient Platform { get; }

    public HttpClient Participant { get; }

    public HttpClient Admin { get; }

    public Guid SipatId { get; private set; }

    public Guid TrackId { get; private set; }

    public static string CompanyPath => $"/api/platform/companies/{SipatOnlineApiFactory.DefaultTenantId:D}/learning";

    /// <summary>Course [house A, YouTube X, house B]; Aula 1 holds A and X, Aula 2 holds B.</summary>
    public static async Task<BonusLessonScenario> StartAsync()
    {
        var scenario = await CreateAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 60_000);
        var b = await scenario.SeedHouseVideoAsync("Vídeo B");
        var courseId = await scenario.CreateCourseAsync();
        await scenario.Call(scenario.Platform, $"/api/platform/catalog/courses/{courseId}/structure", HttpMethod.Put, new
        {
            lessons = new[]
            {
                new { id = (Guid?)null, title = "Aula 1", description = (string?)null, videos = new[] { new { videoId = a, title = (string?)null }, new { videoId = x, title = (string?)null } } },
                new { id = (Guid?)null, title = "Aula 2", description = (string?)null, videos = new[] { new { videoId = b, title = (string?)null } } }
            }
        });
        await scenario.DeliverAsync(courseId);
        return scenario;
    }

    /// <summary>Course [house A, YouTube X with no duration] with a game placed after the second video.</summary>
    public static async Task<BonusLessonScenario> StartWithTrailingExtraAsync()
    {
        var scenario = await CreateAsync();
        var a = await scenario.SeedHouseVideoAsync("Vídeo A");
        var x = await scenario.CreateExternalAsync("Extra do YouTube", 0);
        var courseId = await scenario.CreateCourseAsync();
        await scenario.Call(scenario.Platform, $"/api/platform/catalog/courses/{courseId}/videos", HttpMethod.Put,
            new { videoIds = new[] { a, x } });
        var module = await scenario.CreateQuizAsync("Jogo final");
        await scenario.Call(scenario.Platform, $"/api/platform/catalog/courses/{courseId}/modules", HttpMethod.Put,
            new { items = new[] { new { moduleId = module, afterVideoCount = 2 } } });
        await scenario.DeliverAsync(courseId);
        return scenario;
    }

    /// <summary>Only the operator signed in, nothing delivered yet.</summary>
    public static Task<BonusLessonScenario> StartEmptyAsync() => CreateAsync();

    public async Task<Guid> SeedHouseVideoAsync(string title, long durationMilliseconds = HouseDuration)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var video = new PlatformCourseVideoEntity
        {
            Id = Guid.NewGuid(),
            Title = title,
            ContentType = "video/mp4",
            SizeBytes = 1024,
            DurationMilliseconds = durationMilliseconds,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.PlatformCourseVideos.Add(video);
        await db.SaveChangesAsync();
        return video.Id;
    }

    public async Task<Guid> CreateExternalAsync(string title, long durationMilliseconds)
    {
        var video = await Call(Platform, "/api/platform/catalog/videos/external", HttpMethod.Post, new
        {
            provider = "YouTube",
            url = $"https://www.youtube.com/watch?v={YouTubeId}",
            title,
            durationMilliseconds
        }, HttpStatusCode.Created);
        return video.GetProperty("id").GetGuid();
    }

    public async Task<Guid> CreateCourseAsync()
    {
        var course = await Call(Platform, "/api/platform/catalog/courses", HttpMethod.Post,
            new { title = "Curso com extra", description = "Curso do teste", gamificationEnabled = true }, HttpStatusCode.Created);
        return course.GetProperty("id").GetGuid();
    }

    public async Task<Guid> CreateQuizAsync(string title)
    {
        var module = await Call(Platform, "/api/platform/catalog/modules", HttpMethod.Post, new
        {
            title,
            gameType = "Quiz",
            questions = new[] { new { text = "Qual a resposta?", options = new[] { "Segura", "Insegura" }, correctIndex = 0 } }
        }, HttpStatusCode.Created);
        return module.GetProperty("id").GetGuid();
    }

    /// <summary>Puts a quiz in the middle of a house video (a checkpoint game).</summary>
    public async Task PlaceCheckpointAsync(Guid videoId)
    {
        var module = await CreateQuizAsync("Jogo no meio do vídeo");
        await Call(Platform, $"/api/platform/catalog/videos/{videoId}/checkpoints", HttpMethod.Put,
            new { items = new[] { new { moduleId = module, timeMilliseconds = HouseDuration / 2 } } });
    }

    /// <summary>
    /// Saves the one Day of the scenario's program with these videos (creating the program the first time) and applies
    /// it to the sample SIPAT; the scenario's track becomes that Day's track.
    /// </summary>
    public Task<JsonElement> ApplyDayAsync(params Guid[] videoIds) => ApplyDaysAsync("Dia 1", videoIds, null, HttpStatusCode.OK);

    /// <summary>
    /// Like <see cref="ApplyDayAsync"/>, with the first Day's title and, optionally, a second (new) Day after it;
    /// the response is checked against <paramref name="expected"/>.
    /// </summary>
    public async Task<JsonElement> ApplyDaysAsync(string title, Guid[] videoIds, Guid[]? secondDay, HttpStatusCode expected)
    {
        var days = new List<object>
        {
            new
            {
                id = dayId == Guid.Empty ? (Guid?)null : dayId,
                title,
                date = (string?)null,
                subject = (string?)null,
                videoIds,
                gameIds = Array.Empty<Guid>()
            }
        };
        if (secondDay is not null)
        {
            days.Add(new
            {
                id = (Guid?)null,
                title = "Dia 2",
                date = (string?)null,
                subject = (string?)null,
                videoIds = secondDay,
                gameIds = Array.Empty<Guid>()
            });
        }
        if (programId == Guid.Empty)
        {
            var program = await Call(Platform, "/api/platform/catalog/programs", HttpMethod.Post,
                new { title = "SIPAT com extra", days }, HttpStatusCode.Created);
            programId = program.GetProperty("id").GetGuid();
            dayId = program.GetProperty("days")[0].GetProperty("id").GetGuid();
        }
        else
        {
            await Call(Platform, $"/api/platform/catalog/programs/{programId}", HttpMethod.Put,
                new { title = "SIPAT com extra", days });
        }

        var applied = await Call(Platform, $"{CompanyPath}/sipats/{SipatId}/programs/{programId}", HttpMethod.Post, new { }, expected);
        if (expected != HttpStatusCode.OK) return applied;
        await using var scope = Factory.Services.CreateAsyncScope();
        TrackId = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().LearningTracks
            .Where(item => item.SourceCourseId == dayId).Select(item => item.Id).SingleAsync();
        return applied;
    }

    public Task<JsonElement> Activities() =>
        Participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{TrackId}/activities");

    public Task AnswerAsync(string activityId) =>
        Call(Participant, $"/api/learning/tracks/{TrackId}/activities/{activityId}/outcome", HttpMethod.Put,
            new { outcome = "completed" });

    /// <summary>Answers a game as a page that shows it in the middle of <paramref name="lessonId"/>.</summary>
    public Task<JsonElement> AnswerAsync(string activityId, Guid lessonId, HttpStatusCode expected = HttpStatusCode.OK) =>
        Call(Participant, $"/api/learning/tracks/{TrackId}/activities/{activityId}/outcome", HttpMethod.Put,
            new { outcome = "completed", lessonId }, expected);

    public Task PublishCourseAsync(Guid courseId) =>
        Call(Platform, $"/api/platform/catalog/courses/{courseId}", HttpMethod.Put,
            new { title = "Curso com extra", description = "Curso do teste", status = "Published", gamificationEnabled = true });

    public Task<JsonElement> Experience() => Participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{TrackId}");

    public async Task<Guid[]> LessonIdsAsync() =>
        (await Experience()).GetProperty("lessons").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToArray();

    /// <summary>Plays the whole house lesson with verified evidence.</summary>
    public async Task CompleteAsync(Guid lessonId)
    {
        var playback = await Call(Participant, $"/api/learning/tracks/{TrackId}/lessons/{lessonId}/playback", HttpMethod.Post, new { });
        var completed = await Call(Participant, $"/api/learning/tracks/{TrackId}/lessons/{lessonId}/ranges", HttpMethod.Post, new
        {
            sessionId = playback.GetProperty("sessionId").GetGuid(),
            startMilliseconds = 0,
            endMilliseconds = HouseDuration,
            positionMilliseconds = HouseDuration
        });
        Assert.True(completed.GetProperty("isCompleted").GetBoolean());
    }

    public async Task<JsonElement> Call(HttpClient client, string path, HttpMethod method, object body,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {text}");
        if (string.IsNullOrEmpty(text)) return default;
        using var json = JsonDocument.Parse(text);
        return json.RootElement.Clone();
    }

    public async ValueTask DisposeAsync()
    {
        Platform.Dispose();
        Participant.Dispose();
        Admin.Dispose();
        await Factory.DisposeAsync();
        await postgres.DisposeAsync();
    }

    private static async Task<BonusLessonScenario> CreateAsync()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), developmentSampleEnabled: true);
        var scenario = new BonusLessonScenario(postgres, factory);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            // only the course of the scenario counts for the participant
            await db.LearningAssignments.ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
            scenario.SipatId = await db.SipatEvents.Select(item => item.Id).SingleAsync();
        }

        await scenario.Call(scenario.Platform, "/api/platform/identity/login", HttpMethod.Post,
            new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
        await scenario.Call(scenario.Participant, "/api/identity/login", HttpMethod.Post,
            new LoginRequest("participant-demo", "ParticipantPassword123"), HttpStatusCode.NoContent);
        await scenario.Call(scenario.Admin, "/api/identity/login", HttpMethod.Post,
            new LoginRequest("admin-root", "AdminPassword123"), HttpStatusCode.NoContent);
        return scenario;
    }

    public async Task DeliverAsync(Guid courseId)
    {
        await PublishCourseAsync(courseId);
        var association = await Call(Platform, $"{CompanyPath}/sipats/{SipatId}/courses/{courseId}", HttpMethod.Post, new { });
        TrackId = association.GetProperty("trackId").GetGuid();
    }

    private HttpClient Client(string host = "integration-test.localhost") =>
        Factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });
}
