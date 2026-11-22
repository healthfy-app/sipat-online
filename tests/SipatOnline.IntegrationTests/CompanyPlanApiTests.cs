using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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

        // Bronze: every assunto is available, no quiz and no own identity; the company is told its plan
        var capabilities = await Get(admin, "/api/admin/capabilities");
        Assert.False(capabilities.GetProperty("customizeGrid").GetBoolean());
        Assert.False(capabilities.GetProperty("customBranding").GetBoolean());
        Assert.False(capabilities.GetProperty("quizzes").GetBoolean());
        Assert.Equal("Bronze", capabilities.GetProperty("plan").GetString());

        var catalog = await Get(admin, "/api/admin/sipat-catalog");
        Assert.Equal(["Ergonomia", "Tema avulso"], catalog.GetProperty("courses").EnumerateArray().Select(item => item.GetProperty("title").GetString()).Order());
        Assert.Equal(2, catalog.GetProperty("videos").GetArrayLength());

        var start = new DateTimeOffset(2026, 11, 9, 0, 0, 0, TimeSpan.Zero);
        var sipat = await Send(admin, HttpMethod.Post, "/api/admin/sipats", new { title = "SIPAT 2026", description = (string?)null, startsAt = start, endsAt = start.AddDays(1) }, HttpStatusCode.Created);
        var sipatId = sipat.GetProperty("id").GetGuid();
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Grade pronta", readyVideo) } });

        // the operator takes the loose assunto out of Bronze: the company stops seeing it and cannot save a day with it
        var matrix = await Get(operatorClient, "/api/platform/catalog/plan-subjects");
        Assert.Equal(2, matrix.GetProperty("courses").GetArrayLength());
        Assert.Empty(matrix.GetProperty("excluded").GetProperty("Bronze").EnumerateArray());
        var looseId = matrix.GetProperty("courses").EnumerateArray().Single(item => item.GetProperty("title").GetString() == "Tema avulso").GetProperty("id").GetGuid();
        using (var removed = await Raw(operatorClient, HttpMethod.Put, "/api/platform/catalog/plan-subjects/Bronze", new { excludedCourseIds = new[] { looseId } }))
            Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        Assert.Equal(["Ergonomia"], (await Get(admin, "/api/admin/sipat-catalog")).GetProperty("courses").EnumerateArray().Select(item => item.GetProperty("title").GetString()));
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Assunto fora do plano", freeVideo) } }, HttpStatusCode.BadRequest);
        // other plans keep it
        Assert.Single((await Get(operatorClient, "/api/platform/catalog/plan-subjects")).GetProperty("excluded").GetProperty("Bronze").EnumerateArray());
        using (var back = await Raw(operatorClient, HttpMethod.Put, "/api/platform/catalog/plan-subjects/Bronze", new { excludedCourseIds = Array.Empty<Guid>() }))
            Assert.Equal(HttpStatusCode.NoContent, back.StatusCode);
        Assert.Equal(2, (await Get(admin, "/api/admin/sipat-catalog")).GetProperty("courses").GetArrayLength());

        // categories: the library starts without any, the operator adds, renames and places a subject in one; deleting it only unplaces the subject
        Assert.Empty((await Get(operatorClient, "/api/platform/catalog/categories")).EnumerateArray());
        await Send(operatorClient, HttpMethod.Post, "/api/platform/catalog/categories", new { name = "Postura" }, HttpStatusCode.Created);
        var created = await Send(operatorClient, HttpMethod.Post, "/api/platform/catalog/categories", new { name = "  Ergonomia  " }, HttpStatusCode.Created);
        var categoryId = created.GetProperty("id").GetGuid();
        Assert.Equal("Ergonomia", created.GetProperty("name").GetString());
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/catalog/categories/{categoryId}", new { name = "Postura" }, HttpStatusCode.BadRequest);
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/catalog/categories/{categoryId}", new { name = "Ergonomia e movimento" }, HttpStatusCode.NoContent);
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/catalog/courses/{looseId}/category", new { categoryId }, HttpStatusCode.NoContent);
        Assert.Equal(1, (await Get(operatorClient, "/api/platform/catalog/categories")).EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == categoryId).GetProperty("courseCount").GetInt32());
        Assert.Equal(categoryId, (await Get(operatorClient, "/api/platform/catalog/plan-subjects")).GetProperty("courses").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == looseId).GetProperty("categoryId").GetGuid());
        await Send(operatorClient, HttpMethod.Delete, $"/api/platform/catalog/categories/{categoryId}", new { }, HttpStatusCode.NoContent);
        Assert.Equal(JsonValueKind.Null, (await Get(operatorClient, "/api/platform/catalog/plan-subjects")).GetProperty("courses").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == looseId).GetProperty("categoryId").ValueKind);
        using (var intruder = await Raw(admin, HttpMethod.Post, "/api/platform/catalog/categories", new { name = "Intrusa" }))
            Assert.NotEqual(HttpStatusCode.Created, intruder.StatusCode);
        // a company cannot change what a plan offers
        using (var denied = await Raw(admin, HttpMethod.Put, "/api/platform/catalog/plan-subjects/Bronze", new { excludedCourseIds = new[] { looseId } }))
            Assert.NotEqual(HttpStatusCode.NoContent, denied.StatusCode);
        await Send(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" }, HttpStatusCode.Forbidden);

        // the operator moves the company to Prata: the whole catalog and personalized grids, still no own identity
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Prata" });
        Assert.True((await Get(admin, "/api/admin/capabilities")).GetProperty("customizeGrid").GetBoolean());
        await Send(admin, HttpMethod.Put, $"/api/admin/sipats/{sipatId}/plan", new { days = new[] { Day("Tema avulso", freeVideo) } });
        await Send(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" }, HttpStatusCode.Forbidden);

        // Ouro: own logo and colors
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Ouro" });
        Assert.True((await Get(admin, "/api/admin/capabilities")).GetProperty("customBranding").GetBoolean());
        using var branding = await Raw(admin, HttpMethod.Put, "/api/tenant/branding/appearance", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" });
        Assert.NotEqual(HttpStatusCode.Forbidden, branding.StatusCode);

        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Platina" }, HttpStatusCode.BadRequest);

        // the administrator corrects a collaborator: registration and password, only for participants
        var ana = await Send(admin, HttpMethod.Post, "/api/admin/users", new { loginIdentifier = "ana.lima", displayName = "Ana Lima", initialPassword = "SenhaInicial123", role = "Participant" }, HttpStatusCode.Created);
        var anaId = ana.GetProperty("id").GetGuid();
        var other = await Send(admin, HttpMethod.Post, "/api/admin/users", new { loginIdentifier = "bia.souza", displayName = "Bia Souza", initialPassword = "SenhaInicial123", role = "Participant" }, HttpStatusCode.Created);
        var changed = await Send(admin, HttpMethod.Put, $"/api/admin/users/{anaId}/login", new { loginIdentifier = "ana.lima.2" });
        Assert.Equal("ana.lima.2", changed.GetProperty("loginIdentifier").GetString());
        var taken = await Send(admin, HttpMethod.Put, $"/api/admin/users/{anaId}/login", new { loginIdentifier = "bia.souza" }, HttpStatusCode.Conflict);
        Assert.Equal("identity.login_identifier.duplicate", taken.GetProperty("code").GetString());
        await Send(admin, HttpMethod.Put, $"/api/admin/users/{anaId}/password", new { newPassword = "NovaSenha456" }, HttpStatusCode.NoContent);
        await Send(admin, HttpMethod.Put, $"/api/admin/users/{anaId}/password", new { newPassword = "" }, HttpStatusCode.BadRequest);
        using (var signIn = Client(factory, "acme-plano.localhost"))
        {
            await Send(signIn, HttpMethod.Post, "/api/identity/login", new LoginRequest("ana.lima", "NovaSenha456"), HttpStatusCode.Unauthorized);
            await Send(signIn, HttpMethod.Post, "/api/identity/login", new LoginRequest("ana.lima.2", "NovaSenha456"), HttpStatusCode.NoContent);
        }
        // administrators are not touched here
        var adminId = (await Get(admin, "/api/identity/session")).GetProperty("id").GetGuid();
        await Send(admin, HttpMethod.Put, $"/api/admin/users/{adminId}/password", new { newPassword = "OutraSenha789" }, HttpStatusCode.NotFound);

        // the administrator cannot change the plan
        await Send(admin, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Diamante" }, HttpStatusCode.NotFound);
    }

    /// <summary>The rules of sipatonline.com.br/plans.html, plan by plan.</summary>
    [DockerFact]
    public async Task Plans_ApplyTheRulesOfThePlansPage()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        Guid first, second, other, internalVideo, internalSubject;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            first = await AddVideoAsync(db, "A1V1 - Postura");
            second = await AddVideoAsync(db, "A1V2 - Pausas");
            other = await AddVideoAsync(db, "A2V1 - Mente");
            internalVideo = await AddVideoAsync(db, "Boas-vindas da Acme");
            await AddThemeAsync(db, "Ergonomia", null, first, second);
            await AddThemeAsync(db, "Higiene mental", null, other);
            internalSubject = await AddThemeAsync(db, "Vídeos da Acme", null, internalVideo);
        }

        using var operatorClient = Client(factory, "ops.localhost");
        await Send(operatorClient, HttpMethod.Post, "/api/platform/identity/login", new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
        await Send(operatorClient, HttpMethod.Post, "/api/platform/companies",
            new CreateTenantRequest("acme-regras", "Acme Regras", "regras-admin", "Admin", "AdminPassword123", "Bronze"), HttpStatusCode.Created);
        await Send(operatorClient, HttpMethod.Post, "/api/platform/companies",
            new CreateTenantRequest("outra-regras", "Outra", "outra-admin", "Admin", "AdminPassword123", "Diamante"), HttpStatusCode.Created);
        var dashboard = await Get(operatorClient, "/api/platform/dashboard");
        var companyId = dashboard.EnumerateArray().Single(item => item.GetProperty("key").GetString() == "acme-regras").GetProperty("id").GetGuid();

        // the operator puts the company's internal videos on the platform: an assunto of its own
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/catalog/plan-subjects/courses/{internalSubject}/company", new { companyId }, HttpStatusCode.NoContent);
        Assert.Equal(companyId, (await Get(operatorClient, "/api/platform/catalog/plan-subjects")).GetProperty("courses").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == internalSubject).GetProperty("companyId").GetGuid());

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            await db.Tenants.Where(item => item.Id == companyId)
                .ExecuteUpdateAsync(update => update.SetProperty(item => item.PrimaryColor, "#123456"));
        }

        using var admin = Client(factory, "acme-regras.localhost");
        await Send(admin, HttpMethod.Post, "/api/identity/login", new LoginRequest("regras-admin", "AdminPassword123"), HttpStatusCode.NoContent);
        var start = new DateTimeOffset(2026, 11, 9, 0, 0, 0, TimeSpan.Zero);
        var sipatId = (await Send(admin, HttpMethod.Post, "/api/admin/sipats", new { title = "SIPAT 2026", description = (string?)null, startsAt = start, endsAt = start.AddDays(1) },
            HttpStatusCode.Created)).GetProperty("id").GetGuid();
        var plan = $"/api/admin/sipats/{sipatId}/plan";
        string[] Titles(JsonElement catalog) => catalog.GetProperty("courses").EnumerateArray().Select(item => item.GetProperty("title").GetString()!).Order().ToArray();

        // Bronze: ready modules as they are, no own identity, no internal videos
        Assert.Equal(["Ergonomia", "Higiene mental"], Titles(await Get(admin, "/api/admin/sipat-catalog")));
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Módulo pronto", second, first) } });
        var mixed = await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Misturado", first, other) } }, HttpStatusCode.BadRequest);
        Assert.Equal("sipat.grid_not_customizable", mixed.GetProperty("code").GetString());
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Parte do módulo", first) } }, HttpStatusCode.BadRequest);
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Interno", internalVideo) } }, HttpStatusCode.BadRequest);
        Assert.NotEqual("#123456", (await Get(admin, "/api/tenant/branding")).GetProperty("primaryColor").GetString());
        await Send(admin, HttpMethod.Put, "/api/tenant/branding", new { logoReference = (string?)null, primaryColor = "#123456", secondaryColor = "#FFFFFF" }, HttpStatusCode.Forbidden);

        // Prata: the grid of videos is personalized
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Prata" });
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Misturado", first, other) } });
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Interno", internalVideo) } }, HttpStatusCode.BadRequest);

        // Ouro: its logo and colors show
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Ouro" });
        Assert.Equal("#123456", (await Get(admin, "/api/tenant/branding")).GetProperty("primaryColor").GetString());

        // Diamante: its internal videos, for it only
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Diamante" });
        Assert.Equal(["Ergonomia", "Higiene mental", "Vídeos da Acme"], Titles(await Get(admin, "/api/admin/sipat-catalog")));
        await Send(admin, HttpMethod.Put, plan, new { days = new[] { Day("Interno", internalVideo) } });
        using (var outra = Client(factory, "outra-regras.localhost"))
        {
            await Send(outra, HttpMethod.Post, "/api/identity/login", new LoginRequest("outra-admin", "AdminPassword123"), HttpStatusCode.NoContent);
            Assert.Equal(["Ergonomia", "Higiene mental"], Titles(await Get(outra, "/api/admin/sipat-catalog")));
        }

        // back to Bronze: what goes live is what the plan allows today
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/companies/{companyId}/plan", new { plan = "Bronze" });
        await Send(admin, HttpMethod.Post, $"/api/admin/sipats/{sipatId}/plan/launch", new { }, HttpStatusCode.BadRequest);

        // only the operator decides whose an assunto is
        using (var denied = await Raw(admin, HttpMethod.Put, $"/api/platform/catalog/plan-subjects/courses/{internalSubject}/company", new { companyId = (Guid?)null }))
            Assert.NotEqual(HttpStatusCode.NoContent, denied.StatusCode);
        await Send(operatorClient, HttpMethod.Put, $"/api/platform/catalog/plan-subjects/courses/{internalSubject}/company", new { companyId = (Guid?)null }, HttpStatusCode.NoContent);
    }

    private static object Day(string title, params Guid[] videos) =>
        new { title, date = "2026-11-09", subject = (string?)null, videoIds = videos, gameIds = Array.Empty<Guid>() };

    private static async Task<Guid> AddVideoAsync(PlatformDbContext db, string title)
    {
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

    private static async Task<Guid> AddThemeAsync(PlatformDbContext db, string title, string? description, params Guid[] videoIds)
    {
        var id = Guid.NewGuid();
        db.PlatformCourses.Add(new PlatformCourseEntity
        {
            Id = id,
            Title = title,
            Description = description,
            CreatedAt = DateTimeOffset.UtcNow,
            Status = (int)PlatformCourseStatus.Published
        });
        for (var position = 0; position < videoIds.Length; position++)
            db.PlatformCourseVideoLinks.Add(new PlatformCourseVideoLinkEntity { CourseId = id, VideoId = videoIds[position], Position = position });
        await db.SaveChangesAsync();
        return id;
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
