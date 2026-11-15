using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using PdfSharp.Pdf.IO;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Sipats.Domain.Sipats;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class PlaybackQualityDashboardApiTests
{
    private static readonly Guid CompanyId = SipatOnlineApiFactory.DefaultTenantId;

    [DockerFact]
    public async Task Aggregates_the_company_indicators_in_the_database()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        var body = await Get(operatorClient, $"/api/platform/companies/{CompanyId:D}/playback-quality?sipatId={data.SipatA}");

        var indicators = body.GetProperty("indicators");
        Assert.Equal(4, indicators.GetProperty("sessions").GetInt32());
        Assert.Equal(3, indicators.GetProperty("startedSessions").GetInt32());
        Assert.Equal(25, indicators.GetProperty("neverStartedPercent").GetProperty("value").GetDouble(), 6);
        Assert.Equal("Poor", indicators.GetProperty("stalledSessionsPercent").GetProperty("level").GetString());
        Assert.Equal(2000, indicators.GetProperty("averageStartupMilliseconds").GetProperty("value").GetDouble(), 6);

        var byHour = body.GetProperty("byHour");
        Assert.Equal(24, byHour.GetArrayLength());
        Assert.Equal(2, byHour[10].GetProperty("sessions").GetInt32());
        Assert.Equal(1, byHour[10].GetProperty("stalledSessions").GetInt32());
        Assert.Equal(2, byHour[17].GetProperty("sessions").GetInt32());
        Assert.Equal(1, byHour[17].GetProperty("stalledSessions").GetInt32());

        var device = Buckets(body, "byDevice");
        Assert.Equal(2, device.Count);
        Assert.Equal(3, device["phone"]);
        Assert.Equal(1, device["desktop"]);

        var connection = Buckets(body, "byConnection");
        Assert.Equal(3, connection.Count);
        Assert.Equal(1, connection["unknown"]);
        Assert.Equal(2, connection["3g"]);
        Assert.Equal(1, connection["4g"]);

        var quality = Buckets(body, "byQuality");
        Assert.Equal(3, quality.Count);
        Assert.True(quality.ContainsKey("single") && quality.ContainsKey("720p") && quality.ContainsKey("480p"));

        var day = Buckets(body, "byDay");
        Assert.Equal(2, day["1"]);
        Assert.Equal(1, day["2"]);
        Assert.Equal(1, day[""]);

        Assert.Equal([1, 2], body.GetProperty("days").EnumerateArray().Select(item => item.GetInt32()).ToArray());

        var people = body.GetProperty("people").EnumerateArray().Select(item => item.GetProperty("participantId").GetGuid()).ToArray();
        Assert.Equal([data.P2, data.P3], people);
        Assert.Equal("participant-p2", body.GetProperty("people")[0].GetProperty("loginIdentifier").GetString());

        var video = Assert.Single(body.GetProperty("videos").EnumerateArray());
        Assert.Equal("Vídeo de teste", video.GetProperty("title").GetString());
        Assert.Equal(3, video.GetProperty("indicators").GetProperty("sessions").GetInt32());
    }

    [DockerFact]
    public async Task Filters_by_day()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        var body = await Get(operatorClient, $"/api/platform/companies/{CompanyId:D}/playback-quality?sipatId={data.SipatA}&day=1");

        Assert.Equal(2, body.GetProperty("indicators").GetProperty("sessions").GetInt32());
        Assert.Equal(1, body.GetProperty("day").GetInt32());
        var byHour = body.GetProperty("byHour");
        Assert.Equal(2, byHour[10].GetProperty("sessions").GetInt32());
        Assert.Equal(0, byHour[17].GetProperty("sessions").GetInt32());
    }

    [DockerFact]
    public async Task Opens_on_the_latest_sipat_with_sessions()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        var body = await Get(operatorClient, $"/api/platform/companies/{CompanyId:D}/playback-quality");

        Assert.Equal(data.SipatA, body.GetProperty("sipatId").GetGuid());
        var sipats = body.GetProperty("sipats").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()).ToArray();
        Assert.Equal([data.SipatB, data.SipatA, data.SipatC], sipats);
    }

    [DockerFact]
    public async Task Refuses_a_sipat_of_another_company()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        var refused = await Get(operatorClient,
            $"/api/platform/companies/{CompanyId:D}/playback-quality?sipatId={data.SipatOfOtherCompany}", HttpStatusCode.NotFound);
        Assert.Equal("learning.playback_quality.sipat_not_found", refused.GetProperty("code").GetString());

        var unknownCompany = await Get(operatorClient,
            $"/api/platform/companies/{Guid.NewGuid():D}/playback-quality", HttpStatusCode.NotFound);
        Assert.Equal("learning.playback_quality.company_not_found", unknownCompany.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task Refuses_company_administrators()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await Seed(factory);
        using var admin = Client(factory, "integration-test.localhost");
        await Login(admin, "admin-root", "AdminPassword123");

        using var company = await admin.GetAsync($"/api/platform/companies/{CompanyId:D}/playback-quality");
        using var comparison = await admin.GetAsync("/api/platform/playback-quality");

        // the company host does not serve /api/platform at all (tenant middleware), so the administrator never reaches the policy
        Assert.Equal(HttpStatusCode.NotFound, company.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, comparison.StatusCode);
    }

    [DockerFact]
    public async Task Compares_companies_that_had_a_sipat_in_the_period()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        var body = await Get(operatorClient, "/api/platform/playback-quality?from=2026-11-01&to=2026-11-30");

        Assert.Equal("2026-11-01", body.GetProperty("from").GetString());
        var companies = body.GetProperty("companies").EnumerateArray().ToDictionary(
            item => item.GetProperty("companyId").GetGuid(), item => item.GetProperty("indicators"));
        Assert.Equal(3, companies.Count);
        Assert.Equal(4, companies[CompanyId].GetProperty("sessions").GetInt32());
        var empty = companies[data.CompanyWithoutSessions];
        Assert.Equal(0, empty.GetProperty("sessions").GetInt32());
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("neverStartedPercent").GetProperty("value").ValueKind);
        Assert.Equal(JsonValueKind.Null, empty.GetProperty("neverStartedPercent").GetProperty("level").ValueKind);
        Assert.DoesNotContain(data.CompanyOutsidePeriod, companies.Keys);

        var invalid = await Get(operatorClient, "/api/platform/playback-quality?from=2026-12-01&to=2026-11-01", HttpStatusCode.BadRequest);
        Assert.Equal("learning.playback_quality.period_invalid", invalid.GetProperty("code").GetString());
        var tooLong = await Get(operatorClient, "/api/platform/playback-quality?from=2025-01-01&to=2026-11-30", HttpStatusCode.BadRequest);
        Assert.Equal("learning.playback_quality.period_invalid", tooLong.GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task Downloads_a_one_page_summary()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        using var response = await operatorClient.GetAsync(
            $"/api/platform/companies/{CompanyId:D}/playback-quality/summary.pdf?sipatId={data.SipatA}&day=1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("qualidade-video-integration-test.pdf", response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
        var bytes = await response.Content.ReadAsByteArrayAsync();
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        using var stream = new MemoryStream(bytes);
        using var pdf = PdfReader.Open(stream, PdfDocumentOpenMode.Import);
        Assert.Equal(1, pdf.PageCount);
        Assert.Equal("Qualidade do vídeo - Integration Test", pdf.Info.Title);
    }

    [DockerFact]
    public async Task Downloads_the_summary_even_without_sessions()
    {
        await using var postgres = await StartPostgres();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        var data = await Seed(factory);
        using var operatorClient = await OperatorClient(factory);

        using var response = await operatorClient.GetAsync(
            $"/api/platform/companies/{CompanyId:D}/playback-quality/summary.pdf?sipatId={data.SipatB}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var stream = new MemoryStream(await response.Content.ReadAsByteArrayAsync());
        using var pdf = PdfReader.Open(stream, PdfDocumentOpenMode.Import);
        Assert.Equal(1, pdf.PageCount);
    }

    private sealed record Seeded(
        Guid SipatA, Guid SipatB, Guid SipatC, Guid SipatOfOtherCompany, Guid P2, Guid P3,
        Guid CompanyWithoutSessions, Guid CompanyOutsidePeriod);

    private static Dictionary<string, int> Buckets(JsonElement body, string name) =>
        body.GetProperty(name).EnumerateArray().ToDictionary(
            item => item.GetProperty("key").GetString() ?? string.Empty,
            item => item.GetProperty("indicators").GetProperty("sessions").GetInt32());

    private static async Task<Seeded> Seed(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();

        var otherCompany = AddCompany(db, "other-company");
        var emptyCompany = AddCompany(db, "empty-company");
        var outsideCompany = AddCompany(db, "outside-company");
        var sipatA = AddSipat(db, CompanyId, "SIPAT A", new DateTimeOffset(2026, 11, 10, 0, 0, 0, TimeSpan.Zero));
        var sipatB = AddSipat(db, CompanyId, "SIPAT B", new DateTimeOffset(2026, 11, 20, 0, 0, 0, TimeSpan.Zero));
        var sipatC = AddSipat(db, CompanyId, "SIPAT C", new DateTimeOffset(2026, 10, 1, 0, 0, 0, TimeSpan.Zero));
        var otherSipat = AddSipat(db, otherCompany, "SIPAT de outra empresa", new DateTimeOffset(2026, 11, 12, 0, 0, 0, TimeSpan.Zero));
        AddSipat(db, emptyCompany, "SIPAT vazia", new DateTimeOffset(2026, 11, 5, 0, 0, 0, TimeSpan.Zero));
        AddSipat(db, outsideCompany, "SIPAT antiga", new DateTimeOffset(2026, 3, 1, 0, 0, 0, TimeSpan.Zero));

        var p1 = AddParticipant(db, "p1");
        var p2 = AddParticipant(db, "p2");
        var p3 = AddParticipant(db, "p3");
        var video = Guid.NewGuid();
        db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = video,
            Title = "Vídeo de teste",
            ContentType = "video/mp4",
            SizeBytes = 1,
            DurationMilliseconds = 1000,
            CreatedAt = DateTimeOffset.UtcNow
        });

        db.PlaybackQualitySessions.AddRange(
            Row(CompanyId, sipatA, p1, video, 1, "2026-11-12T13:30:00Z", 1000, false, 0, 0, 60_000, "Phone", "4g", "720p", null),
            Row(CompanyId, sipatA, p1, video, 1, "2026-11-12T13:40:00Z", 3000, false, 2, 3_000, 57_000, "Desktop", null, "720p", null),
            Row(CompanyId, sipatA, p3, video, 2, "2026-11-12T20:10:00Z", 2000, false, 1, 15_000, 85_000, "Phone", "3g", "480p", null),
            Row(CompanyId, sipatA, p2, null, null, "2026-11-12T20:20:00Z", null, true, 0, 0, 0, "Phone", "3g", "single", "Network"),
            Row(otherCompany, otherSipat, p1, video, 1, "2026-11-12T13:30:00Z", 9000, false, 5, 9_000, 1_000, "Phone", "4g", "720p", null),
            Row(CompanyId, sipatC, p1, video, 1, "2026-10-02T13:30:00Z", 9000, false, 5, 9_000, 1_000, "Phone", "4g", "720p", null));
        await db.SaveChangesAsync();
        return new Seeded(sipatA, sipatB, sipatC, otherSipat, p2, p3, emptyCompany, outsideCompany);
    }

    private static PlaybackQualitySessionEntity Row(
        Guid tenant, Guid sipat, Guid participant, Guid? video, int? day, string startedAt, long? startup, bool neverStarted,
        int stallCount, long stallMs, long watchedMs, string device, string? connection, string quality, string? errorKind) => new()
        {
            Id = Guid.NewGuid(),
            TenantId = tenant,
            ParticipantId = participant,
            TrackId = Guid.NewGuid(),
            SipatEventId = sipat,
            DayPosition = day,
            LessonId = Guid.NewGuid(),
            VideoId = video,
            PlaybackSessionId = Guid.NewGuid(),
            StartedAt = DateTimeOffset.Parse(startedAt, System.Globalization.CultureInfo.InvariantCulture),
            TimezoneOffsetMinutes = -180,
            StartupMilliseconds = startup,
            NeverStarted = neverStarted,
            StallCount = stallCount,
            StallMilliseconds = stallMs,
            WatchedMilliseconds = watchedMs,
            ErrorKind = errorKind,
            Quality = quality,
            ConnectionType = connection,
            Device = device,
            ReceivedAt = DateTimeOffset.UtcNow
        };

    private static Guid AddCompany(PlatformDbContext db, string key)
    {
        var id = Guid.NewGuid();
        db.Tenants.Add(new TenantEntity
        {
            Id = id,
            Key = key,
            Name = key,
            PrimaryColor = "#111111",
            SecondaryColor = "#222222",
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        });
        return id;
    }

    private static Guid AddSipat(PlatformDbContext db, Guid tenant, string title, DateTimeOffset startsAt)
    {
        var id = Guid.NewGuid();
        db.SipatEvents.Add(new SipatEventEntity
        {
            Id = id,
            TenantId = tenant,
            Title = title,
            StartsAt = startsAt,
            EndsAt = startsAt.AddDays(5),
            CreatedAt = DateTimeOffset.UtcNow,
            Status = SipatEventStatus.Published
        });
        return id;
    }

    private static Guid AddParticipant(PlatformDbContext db, string name)
    {
        var id = Guid.NewGuid();
        db.Users.Add(new PlatformIdentityUser
        {
            Id = id,
            UserName = $"account-{id:N}",
            NormalizedUserName = $"ACCOUNT-{id:N}".ToUpperInvariant(),
            TenantId = CompanyId,
            EmployeeIdentifier = $"participant-{name}",
            NormalizedEmployeeIdentifier = $"PARTICIPANT-{name}".ToUpperInvariant(),
            DisplayName = $"Participante {name}",
            IsActive = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        return id;
    }

    private static async Task<HttpClient> OperatorClientAsync(WebApplicationFactory<Program> factory)
    {
        var client = Client(factory, "ops.localhost");
        await Login(client, "platform-operator", "PlatformPassword123", "/api/platform/identity/login");
        return client;
    }

    private static Task<HttpClient> OperatorClient(WebApplicationFactory<Program> factory) => OperatorClientAsync(factory);

    private static async Task<JsonElement> Get(HttpClient client, string path, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var response = await client.GetAsync(path);
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {text}");
        using var json = JsonDocument.Parse(text);
        return json.RootElement.Clone();
    }

    private static async Task Login(HttpClient client, string identifier, string password, string path = "/api/identity/login")
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        { Content = JsonContent.Create(new LoginRequest(identifier, password)) };
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static HttpClient Client(WebApplicationFactory<Program> factory, string host) =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }
}
