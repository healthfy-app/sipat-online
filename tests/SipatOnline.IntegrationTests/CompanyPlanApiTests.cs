using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Tenancy.Application.Provisioning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class CompanyPlanApiTests
{
    [DockerFact]
    public async Task Plan_DecidesWhatACompanyCanPersonalize_AndTheOperatorChangesIt()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        Guid readyVideo, freeVideo;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            readyVideo = await AddVideoAsync(db, "A1V1 - Ergonomia");
            freeVideo = await AddVideoAsync(db, "A9V1 - Fora das grades");
            await AddThemeAsync(db, "Ergonomia", "Opção 1 · 1 aulas\nGrade pronta.", readyVideo);
            await AddThemeAsync(db, "Tema avulso", "Sem grade.", freeVideo);
        }

        using var operatorClient = Client(factory, "ops.localhost");
        await Send(operatorClient, HttpMethod.Post, "/api/platform/identity/login", new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);

        // a company is created with a plan
        await Send(operatorClient, HttpMethod.Post, "/api/platform/companies",
            new CreateTenantRequest("acme-plano", "Acme Plano", "acme-admin", "Admin Acme", "AdminPassword123", "Bronze"), HttpStatusCode.Created);
        await Send(operatorClient, HttpMethod.Post, "/api/platform/companies",
            new CreateTenantRequest("acme-ruim", "Acme Ruim", "ruim-admin", "Admin", "AdminPassword123", "Platina"), HttpStatusCode.BadRequest);
        var dashboard = await Get(operatorClient, "/api/platform/dashboard");
        var acme = Assert.Single(dashboard.EnumerateArray(), item => item.GetProperty("key").GetString() == "acme-plano");
        Assert.Equal("Bronze", acme.GetProperty("plan").GetString());
        var companyId = acme.GetProperty("id").GetGuid();

        using var admin = Client(factory, "acme-plano.localhost");
        await Send(admin, HttpMethod.Post, "/api/identity/login", new LoginRequest("acme-admin", "AdminPassword123"), HttpStatusCode.NoContent);

        // Bronze: ready grades only, no quiz, no own identity; the company is never told its plan
        var capabilities = await Get(admin, "/api/admin/capabilities");
        Assert.False(capabilities.GetProperty("customizeGrid").GetBoolean());
        Assert.False(capabilities.GetProperty("customBranding").GetBoolean());
        Assert.False(capabilities.GetProperty("quizzes").GetBoolean());
        Assert.Equal(JsonValueKind.Null, capabilities.GetProperty("plan").ValueKind);

        var catalog = await Get(admin, "/api/admin/sipat-catalog");
        Assert.Equal(["Ergonomia"], catalog.GetProperty("courses").EnumerateArray().Select(item => item.GetProperty("title").GetString()));
        Assert.Equal(readyVideo, Assert.Single(catalog.GetProperty("videos").EnumerateArray()).GetProperty("video").GetProperty("id").GetGuid());

        var start = new DateTimeOffset(2026, 11, 9, 0, 0, 0, TimeSpan.Zero);
        var sipat = await Send(admin, HttpMethod.Post, "/api/admin/sipats", new { title = "SIPAT 2026", description = (string?)null, startsAt = start, endsAt = start.AddDays(1) }, HttpStatusCode.Created);
        var sipatId = sipat.GetProperty("id").GetGuid();
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Fora da grade", freeVideo) } }, HttpStatusCode.BadRequest);
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Grade pronta", readyVideo) } });
        await Send(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" }, HttpStatusCode.Forbidden);

        // the operator moves the company to Prata: the whole catalog and personalized grids, still no own identity
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Prata" });
        Assert.True((await Get(admin, "/api/admin/capabilities")).GetProperty("customizeGrid").GetBoolean());
        Assert.Equal(2, (await Get(admin, "/api/admin/sipat-catalog")).GetProperty("courses").GetArrayLength());
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Tema avulso", freeVideo) } });
        await Send(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" }, HttpStatusCode.Forbidden);

        // Ouro: own logo and colors
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Ouro" });
        Assert.True((await Get(admin, "/api/admin/capabilities")).GetProperty("customBranding").GetBoolean());
        using var branding = await Raw(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" });
        Assert.NotEqual(HttpStatusCode.Forbidden, branding.StatusCode);

        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Platina" }, HttpStatusCode.BadRequest);

        // the administrator cannot change the plan
        await Send(admin, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Diamante" }, HttpStatusCode.NotFound);
    }

    private static object Day(string title, params Guid[] videos) =>
        new { title, date = "2026-11-09", subject = (string?)null, videoIds = videos, gameIds = Array.Empty<Guid>() };

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

    private static async Task AddThemeAsync(PlatformDbContext db, string title, string description, Guid videoId)
    {
        var id = Guid.NewGuid();
        db.PlatformCourses.Add(new PlatformCourseEntity
        {
            Id = id, Title = title, Description = description, CreatedAt = DateTimeOffset.UtcNow, Status = (int)PlatformCourseStatus.Published
        });
        db.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity { CourseId = id, VideoId = videoId, Position = 0 });
        await db.SaveChangesAsync();
    }

    private static HttpClient Client(SipatOnlineApiFactory factory, string host) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });

    private static async Task<JsonElement> Get(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{path}: {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }

    private static async Task<HttpResponseMessage> Raw(HttpClient client, HttpMethod method, string path, object body)
    {
        var token = (await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery"))!.RequestToken;
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> Send(HttpClient client, HttpMethod method, string path, object body, HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var response = await Raw(client, method, path, body);
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        if (expected == HttpStatusCode.NoContent) return default;
        var text = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(text)) return default;
        using var json = JsonDocument.Parse(text);
        return json.RootElement.Clone();
    }
}
