using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api;
using SipatOnline.Api.Endpoints;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Tenancy.Application.Provisioning;
using SipatOnline.Tenancy.Application.Branding;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class CompanyAccessApiTests
{
    [DockerFact]
    public async Task BaseHost_IsNeutralAndAppearancePersistsWithTenantIsolation()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), true);
        await InitializeAsync(factory);
        using var root = Client(factory, "localhost");
        using var tenant = Client(factory, "integration-test.localhost");
        var neutral = await root.GetFromJsonAsync<TenantBrandingResponse>("/api/tenant/branding");
        Assert.NotNull(neutral);
        Assert.Equal("platform", neutral.TenantKey);
        Assert.Equal("SIPAT Online", neutral.TenantName);
        Assert.Null(neutral.LogoReference);
        Assert.Equal("integration-test", (await tenant.GetFromJsonAsync<TenantBrandingResponse>("/api/tenant/branding"))!.TenantKey);

        await LoginAsync(root, "platform-operator", "PlatformPassword123", true);
        var actor = (await root.GetFromJsonAsync<JsonElement>("/api/platform/identity/session")).GetProperty("id").GetGuid().ToString();
        var company = await CreateCompanyAsync(root, "appearance-company");
        using var admin = Client(factory, "appearance-company.localhost");
        await LoginAsync(admin, "client-admin", "CompanyAdminPassword123");
        var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
        byte[]? certificateLogo;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var entity = await db.Tenants.SingleAsync(item => item.Id == company.Id);
            entity.CustomDomain = "brand.example";
            entity.CertificateLogoData = png;
            entity.CertificateLogoContentType = "image/png";
            await db.SaveChangesAsync();
            certificateLogo = entity.CertificateLogoData;
        }
        var path = "/api/tenant/branding/appearance";
        using (var missingCsrf = await admin.PutAsJsonAsync(path, new TenantAppearanceRequest("#123456", "#FFFFFF")))
            Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        TenantBrandingResponse saved;
        using (var response = await MutateAsync(admin, HttpMethod.Put, path,
            new TenantAppearanceRequest("#123456", "#FFFFFF", Convert.ToBase64String(png))))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            saved = (await response.Content.ReadFromJsonAsync<TenantBrandingResponse>())!;
            Assert.Equal("#123456", saved.PrimaryColor);
            Assert.Equal("#FFFFFF", saved.SecondaryColor);
            Assert.Equal("brand.example", saved.CustomDomain);
            Assert.Matches(@"^/api/tenant/logo/appearance-company\?v=[a-f0-9]{16}$", saved.LogoReference);
        }
        using var anonymous = Client(factory, "appearance-company.localhost");
        Assert.Equal(saved, await anonymous.GetFromJsonAsync<TenantBrandingResponse>("/api/tenant/branding"));
        using (var image = await anonymous.GetAsync(saved.LogoReference))
        {
            Assert.Equal(HttpStatusCode.OK, image.StatusCode);
            Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
            Assert.Equal(png, await image.Content.ReadAsByteArrayAsync());
        }
        Assert.Equal(HttpStatusCode.NotFound, (await tenant.GetAsync(saved.LogoReference)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await root.GetAsync(saved.LogoReference)).StatusCode);

        foreach (var (request, status) in new[]
        {
            (new TenantAppearanceRequest("invalid", "#FFFFFF"), HttpStatusCode.BadRequest),
            (new TenantAppearanceRequest("#777777", "#FFFFFF"), HttpStatusCode.BadRequest),
            (new TenantAppearanceRequest("#FFFFFF", "#FFFFFF"), HttpStatusCode.BadRequest),
            (new TenantAppearanceRequest("#123456", "#FFFFFF", "not-base64"), HttpStatusCode.BadRequest),
            (new TenantAppearanceRequest("#123456", "#FFFFFF", "AA=="), HttpStatusCode.BadRequest),
            (new TenantAppearanceRequest("#123456", "#FFFFFF", Convert.ToBase64String(new byte[262145])), HttpStatusCode.RequestEntityTooLarge),
            (new TenantAppearanceRequest("#123456", "#FFFFFF", Convert.ToBase64String(png), true), HttpStatusCode.BadRequest)
        })
        {
            using var invalid = await MutateAsync(admin, HttpMethod.Put, path, request);
            Assert.Equal(status, invalid.StatusCode);
            Assert.Equal(saved, await anonymous.GetFromJsonAsync<TenantBrandingResponse>("/api/tenant/branding"));
        }

        root.DefaultRequestHeaders.Add(PlatformCompanyContextMiddleware.HeaderName, company.Id.ToString());
        using (var ownerSave = await MutateAsync(root, HttpMethod.Put, path, new TenantAppearanceRequest("#767676", "#FFFFFF")))
            Assert.Equal(HttpStatusCode.OK, ownerSave.StatusCode);
        root.DefaultRequestHeaders.Remove(PlatformCompanyContextMiddleware.HeaderName);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var entity = await db.Tenants.AsNoTracking().SingleAsync(item => item.Id == company.Id);
            Assert.Equal("#767676", entity.PrimaryColor);
            Assert.Equal(png, entity.PortalLogoData);
            Assert.Equal(certificateLogo, entity.CertificateLogoData);
            var audit = await db.AuditEntries.AsNoTracking().Where(item =>
                item.TenantId == company.Id && item.Action == "tenant.appearance.updated").ToListAsync();
            Assert.Equal(2, audit.Count);
            Assert.Single(audit, item => item.ActorId == actor);
        }
        using (var removed = await MutateAsync(admin, HttpMethod.Put, path, new TenantAppearanceRequest("#123456", "#FFFFFF", RemoveLogo: true)))
        {
            Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
            Assert.Null((await removed.Content.ReadFromJsonAsync<TenantBrandingResponse>())!.LogoReference);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync(saved.LogoReference)).StatusCode);
        Assert.Equal("platform", (await root.GetFromJsonAsync<TenantBrandingResponse>("/api/tenant/branding"))!.TenantKey);
    }

    [DockerFact]
    public async Task OwnerCompanyContext_RequiresSelectionAndScopesChangesAndAudit()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), true);
        await InitializeAsync(factory);
        using var owner = Client(factory, "ops.localhost");
        await LoginAsync(owner, "platform-operator", "PlatformPassword123", true);
        var session = await owner.GetFromJsonAsync<JsonElement>("/api/platform/identity/session");
        var actorId = session.GetProperty("id").GetGuid().ToString();

        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/learning/participation")).StatusCode);
        await AssertContextStatusAsync(owner, "not-a-guid", "/api/admin/users/participants", HttpStatusCode.Forbidden);
        await AssertContextStatusAsync(owner, Guid.Empty.ToString(), "/api/admin/users/participants", HttpStatusCode.Forbidden);
        await AssertContextStatusAsync(owner, Guid.NewGuid().ToString(), "/api/admin/users/participants", HttpStatusCode.NotFound);
        await AssertContextStatusAsync(owner, SipatOnlineApiFactory.DefaultTenantId.ToString(),
            "/api/platform/companies", HttpStatusCode.Forbidden);
        await AssertContextStatusAsync(owner, SipatOnlineApiFactory.DefaultTenantId.ToString(),
            "/api/learning/tracks", HttpStatusCode.Forbidden);
        using (var repeated = new HttpRequestMessage(HttpMethod.Get, "/api/admin/users/participants"))
        {
            repeated.Headers.Add(PlatformCompanyContextMiddleware.HeaderName,
                new[] { SipatOnlineApiFactory.DefaultTenantId.ToString(), Guid.NewGuid().ToString() });
            Assert.Equal(HttpStatusCode.Forbidden, (await owner.SendAsync(repeated)).StatusCode);
        }
        using (var tenantHost = Client(factory, "integration-test.localhost"))
        {
            tenantHost.DefaultRequestHeaders.Add("Cookie", owner.DefaultRequestHeaders.GetValues("Cookie").Single());
            Assert.Equal(HttpStatusCode.Forbidden, (await tenantHost.GetAsync("/api/admin/users/participants")).StatusCode);
            await AssertContextStatusAsync(tenantHost, SipatOnlineApiFactory.DefaultTenantId.ToString(),
                "/api/admin/users/participants", HttpStatusCode.Forbidden);
        }

        var company = await CreateCompanyAsync(owner, "context-company");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var inactive = await db.Tenants.SingleAsync(item => item.Id == company.Id);
            inactive.IsActive = false;
            await db.SaveChangesAsync();
        }
        await AssertContextStatusAsync(owner, company.Id.ToString(), "/api/admin/users/participants", HttpStatusCode.NotFound);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            (await db.Tenants.SingleAsync(item => item.Id == company.Id)).IsActive = true;
            await db.SaveChangesAsync();
        }

        owner.DefaultRequestHeaders.Add(PlatformCompanyContextMiddleware.HeaderName, company.Id.ToString());
        var branding = await owner.GetFromJsonAsync<JsonElement>("/api/tenant/branding");
        Assert.Equal(company.Key, branding.GetProperty("tenantKey").GetString());
        var participants = await owner.GetFromJsonAsync<UserListResponse>("/api/admin/users/participants");
        Assert.NotNull(participants);
        Assert.Empty(participants.Items);

        using var created = await MutateAsync(owner, HttpMethod.Post, "/api/admin/users",
            new ProvisionUserRequest("owner-created", "Owner Created", "OwnerCreatedPassword123", "Supervisor"));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var missingCsrf = await owner.PostAsJsonAsync("/api/admin/users",
            new ProvisionUserRequest("csrf-blocked", "Blocked User", "BlockedPassword123", "Participant"));
        Assert.Equal(HttpStatusCode.BadRequest, missingCsrf.StatusCode);
        using var eventResponse = await MutateAsync(owner, HttpMethod.Post, "/api/admin/sipats",
            new SipatEventDataRequest("Owner SIPAT", null, DateTimeOffset.UtcNow.AddDays(1), DateTimeOffset.UtcNow.AddDays(2)));
        Assert.Equal(HttpStatusCode.Created, eventResponse.StatusCode);
        var sipat = await eventResponse.Content.ReadFromJsonAsync<SipatEventResponse>();
        Assert.NotNull(sipat);
        Assert.Equal(company.Id, sipat.TenantId);
        using var trackResponse = await MutateAsync(owner, HttpMethod.Post, $"/api/admin/sipats/{sipat.Id}/tracks",
            new { title = "Owner Track", description = (string?)null });
        Assert.Equal(HttpStatusCode.Created, trackResponse.StatusCode);
        var track = await trackResponse.Content.ReadFromJsonAsync<JsonElement>();
        var trackId = track.GetProperty("id").GetGuid();
        using var brandingUpdate = await MutateAsync(owner, HttpMethod.Put, "/api/tenant/branding",
            new { logoReference = (string?)null, primaryColor = "#123456", secondaryColor = "#FFFFFF", customDomain = (string?)null });
        Assert.Equal(HttpStatusCode.OK, brandingUpdate.StatusCode);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var audit = await db.AuditEntries.Where(item => item.TenantId == company.Id &&
                item.Action == "learning.track.created").SingleAsync();
            Assert.Equal(actorId, audit.ActorId);
        }

        owner.DefaultRequestHeaders.Remove(PlatformCompanyContextMiddleware.HeaderName);
        owner.DefaultRequestHeaders.Add(PlatformCompanyContextMiddleware.HeaderName, SipatOnlineApiFactory.DefaultTenantId.ToString());
        using var foreignDraft = await owner.GetAsync($"/api/admin/learning/tracks/{trackId}/draft");
        Assert.Equal(HttpStatusCode.Conflict, foreignDraft.StatusCode);
        Assert.Contains("learning.draft_not_found", await foreignDraft.Content.ReadAsStringAsync());
        var otherTracks = await owner.GetFromJsonAsync<JsonElement[]>("/api/admin/learning/tracks");
        Assert.NotNull(otherTracks);
        Assert.DoesNotContain(otherTracks, item => item.GetProperty("id").GetGuid() == trackId);
        using var foreignMutation = await MutateAsync(owner, HttpMethod.Post, $"/api/admin/learning/tracks/{trackId}/publish", new { });
        Assert.Equal(HttpStatusCode.NotFound, foreignMutation.StatusCode);

        owner.DefaultRequestHeaders.Remove(PlatformCompanyContextMiddleware.HeaderName);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync("/api/platform/companies")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/admin/learning/tracks")).StatusCode);

        using var anonymous = Client(factory, "ops.localhost");
        await AssertContextStatusAsync(anonymous, company.Id.ToString(), "/api/admin/learning/tracks", HttpStatusCode.Forbidden);
    }

    [DockerFact]
    public async Task Supervisor_ReadsCompanyReportsButCannotMutateOrCrossTenants()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), true);
        await InitializeAsync(factory);
        using var owner = Client(factory, "ops.localhost");
        await LoginAsync(owner, "platform-operator", "PlatformPassword123", true);
        using var provision = await MutateAsync(owner, HttpMethod.Post, "/api/platform/users",
            new CreatePlatformUserRequest(SipatOnlineApiFactory.DefaultTenantId,
                "report-supervisor", "Report Supervisor", "SupervisorPassword123", "Supervisor"));
        Assert.Equal(HttpStatusCode.Created, provision.StatusCode);
        var otherCompany = await CreateCompanyAsync(owner, "other-reports");
        using var otherParticipantResponse = await MutateAsync(owner, HttpMethod.Post, "/api/platform/users",
            new CreatePlatformUserRequest(otherCompany.Id, "other-participant", "Other Participant", "ParticipantPassword123", "Participant"));
        Assert.Equal(HttpStatusCode.Created, otherParticipantResponse.StatusCode);
        var otherParticipant = await otherParticipantResponse.Content.ReadFromJsonAsync<JsonElement>();

        using var supervisor = Client(factory, "integration-test.localhost");
        await LoginAsync(supervisor, "report-supervisor", "SupervisorPassword123");
        var participants = await supervisor.GetFromJsonAsync<UserListResponse>("/api/admin/users/participants");
        Assert.NotNull(participants);
        var participant = Assert.Single(participants.Items);
        Assert.Equal("participant-demo", participant.LoginIdentifier);
        var progress = await supervisor.GetFromJsonAsync<JsonElement[]>("/api/admin/learning/participation");
        Assert.NotNull(progress);
        Assert.NotEmpty(progress);
        Assert.All(progress, item => Assert.Equal(participant.Id, item.GetProperty("participantId").GetGuid()));
        var tracks = await supervisor.GetFromJsonAsync<JsonElement[]>("/api/admin/learning/tracks");
        Assert.NotNull(tracks);
        Assert.NotEmpty(tracks);
        Assert.Equal(HttpStatusCode.OK, (await supervisor.GetAsync($"/api/admin/learning/participants/{participant.Id}/outcomes")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await supervisor.GetAsync(
            $"/api/admin/learning/participants/{otherParticipant.GetProperty("id").GetGuid()}/outcomes")).StatusCode);
        var trackId = tracks[0].GetProperty("id").GetGuid();
        var ownCertificate = Guid.NewGuid();
        var foreignCertificate = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            foreach (var (id, tenantId, userId) in new[]
            {
                (ownCertificate, SipatOnlineApiFactory.DefaultTenantId, participant.Id),
                (foreignCertificate, otherCompany.Id, otherParticipant.GetProperty("id").GetGuid())
            })
            {
                var snapshot = new ParticipationCertificate(id, tenantId, userId, Guid.NewGuid(),
                    "Participant", "Company", "SIPAT", DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1),
                    60000, DateTimeOffset.UtcNow, true, "Runtime fixture");
                db.ParticipationCertificates.Add(new ParticipationCertificateEntity
                {
                    Id = id,
                    TenantId = tenantId,
                    ParticipantId = userId,
                    SipatEventId = snapshot.SipatEventId,
                    SnapshotJson = JsonSerializer.Serialize(snapshot)
                });
            }
            await db.SaveChangesAsync();
        }
        using var certificatePdf = await supervisor.GetAsync($"/api/learning/certificates/{ownCertificate}/pdf");
        Assert.Equal(HttpStatusCode.OK, certificatePdf.StatusCode);
        Assert.Equal("application/pdf", certificatePdf.Content.Headers.ContentType?.MediaType);
        Assert.Equal(HttpStatusCode.NotFound, (await supervisor.GetAsync(
            $"/api/learning/certificates/{foreignCertificate}/pdf")).StatusCode);
        foreach (var path in new[] { "/api/admin/users", "/api/admin/sipats", $"/api/admin/learning/tracks/{trackId}/draft", "/api/learning/tracks" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await supervisor.GetAsync(path)).StatusCode);
        }
        foreach (var (method, path, body) in new (HttpMethod, string, object)[]
        {
            (HttpMethod.Post, "/api/admin/users", new ProvisionUserRequest("blocked", "Blocked User", "PasswordBlocked123", "Participant")),
            (HttpMethod.Put, $"/api/admin/users/{participant.Id}/status", new { isActive = false }),
            (HttpMethod.Put, "/api/tenant/branding", new { primaryColor = "#123456", secondaryColor = "#FFFFFF" }),
            (HttpMethod.Put, "/api/tenant/branding/appearance", new TenantAppearanceRequest("#123456", "#FFFFFF")),
            (HttpMethod.Post, "/api/admin/sipats", new SipatEventDataRequest("Blocked", null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(1))),
            (HttpMethod.Post, $"/api/admin/learning/tracks/{trackId}/assignments", new { participantId = participant.Id }),
            (HttpMethod.Post, $"/api/admin/learning/tracks/{trackId}/publish", new { })
        })
        {
            using var response = await MutateAsync(supervisor, method, path, body);
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        }
        await AssertContextStatusAsync(supervisor, otherCompany.Id.ToString(), "/api/admin/learning/participation", HttpStatusCode.Forbidden);
        using var wrongHost = new HttpRequestMessage(HttpMethod.Get, "https://other-reports.localhost/api/admin/learning/participation");
        var authCookie = supervisor.DefaultRequestHeaders.GetValues("Cookie").Single();
        wrongHost.Headers.Add("Cookie", authCookie);
        using var wrongHostResponse = await Client(factory, "other-reports.localhost").SendAsync(wrongHost);
        Assert.Equal(HttpStatusCode.Forbidden, wrongHostResponse.StatusCode);

        using var participantClient = Client(factory, "integration-test.localhost");
        await LoginAsync(participantClient, "participant-demo", "ParticipantPassword123");
        Assert.Equal(HttpStatusCode.Forbidden, (await participantClient.GetAsync("/api/admin/learning/participation")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await participantClient.GetAsync("/api/learning/tracks")).StatusCode);
        using var participantBranding = await MutateAsync(participantClient, HttpMethod.Put,
            "/api/tenant/branding/appearance", new TenantAppearanceRequest("#123456", "#FFFFFF"));
        Assert.Equal(HttpStatusCode.Forbidden, participantBranding.StatusCode);
    }

    private static HttpClient Client(SipatOnlineApiFactory factory, string host) =>
        factory.CreateClient(new() { BaseAddress = new Uri($"https://{host}"), AllowAutoRedirect = false });

    private static async Task InitializeAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
    }

    private static async Task LoginAsync(HttpClient client, string identifier, string password, bool platform = false)
    {
        using var response = await MutateAsync(client, HttpMethod.Post,
            platform ? "/api/platform/identity/login" : "/api/identity/login", new LoginRequest(identifier, password));
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var authCookie = response.Headers.GetValues("Set-Cookie").Single(value =>
            value.StartsWith("__Host-SipatOnline.Auth=", StringComparison.Ordinal)).Split(';', 2)[0];
        client.DefaultRequestHeaders.Add("Cookie", authCookie);
    }

    private static async Task<HttpResponseMessage> MutateAsync<T>(HttpClient client, HttpMethod method, string path, T body)
    {
        var company = client.DefaultRequestHeaders.TryGetValues(PlatformCompanyContextMiddleware.HeaderName, out var values)
            ? values.Single() : null;
        client.DefaultRequestHeaders.Remove(PlatformCompanyContextMiddleware.HeaderName);
        HttpResponseMessage tokenResponse;
        try
        {
            tokenResponse = await client.GetAsync("/api/identity/antiforgery");
        }
        finally
        {
            if (company is not null) client.DefaultRequestHeaders.Add(PlatformCompanyContextMiddleware.HeaderName, company);
        }
        using var tokenResponseLifetime = tokenResponse;
        tokenResponse.EnsureSuccessStatusCode();
        var token = await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token);
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token.RequestToken);
        return await client.SendAsync(request);
    }

    private static async Task<TenantSummary> CreateCompanyAsync(HttpClient owner, string key)
    {
        using var response = await MutateAsync(owner, HttpMethod.Post, "/api/platform/companies",
            new CreateTenantRequest(key, "Context Company", "client-admin", "Company Admin", "CompanyAdminPassword123"));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var company = await response.Content.ReadFromJsonAsync<TenantSummary>();
        Assert.NotNull(company);
        return company;
    }

    private static async Task AssertContextStatusAsync(HttpClient client, string company, string path, HttpStatusCode status)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(PlatformCompanyContextMiddleware.HeaderName, company);
        using var response = await client.SendAsync(request);
        Assert.Equal(status, response.StatusCode);
    }
}
