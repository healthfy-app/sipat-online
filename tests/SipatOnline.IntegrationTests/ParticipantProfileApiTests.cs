using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class ParticipantProfileApiTests
{
    [DockerFact]
    public async Task Profile_SavesStandardizedFields()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "ana.login", "Ana Souza");
        var user = await FindUserAsync(factory, "ana.login");

        var profile = await SaveProfileAsync(admin, token, user.Id, new ChangeProfileRequest("12.345-6", " Ana@X.COM ", "(27) 99999-1234", null, null));

        Assert.Equal(new ParticipantProfile(user.Id, "123456", "ana@x.com", "27999991234", null, null), profile);
        var saved = await FindUserAsync(factory, "ana.login");
        Assert.Equal("ana.login", saved.EmployeeIdentifier);
        Assert.Equal("ANA@X.COM", saved.NormalizedEmail);
        Assert.NotEqual(user.ConcurrencyStamp, saved.ConcurrencyStamp);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.True(await db.AuditEntries.AnyAsync(entry => entry.Action == "identity.user.profile_changed" && entry.SubjectId == user.Id.ToString("D")));

        var list = await admin.GetFromJsonAsync<ParticipantProfile[]>("/api/admin/users/participants/profiles");
        Assert.Contains(profile, list!);
    }

    [DockerFact]
    public async Task Profile_EmptyFieldClears()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        var user = await FindUserAsync(factory, "ana");
        await SaveProfileAsync(admin, token, user.Id, new ChangeProfileRequest("77", "a@x.com", "27999991234", null, sector.Id));

        var cleared = await SaveProfileAsync(admin, token, user.Id, new ChangeProfileRequest("", null, " ", null, null));

        Assert.Equal(new ParticipantProfile(user.Id, null, null, null, null, null), cleared);
        var saved = await FindUserAsync(factory, "ana");
        Assert.Null(saved.RegistrationNumber);
        Assert.Null(saved.Email);
        Assert.Null(saved.NormalizedEmail);
        Assert.Null(saved.SectorId);
    }

    [DockerFact]
    public async Task Profile_DuplicateRegistration_IsConflict()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        await ProvisionAsync(admin, token, "bia", "Bia Souza");
        await SaveProfileAsync(admin, token, (await FindUserAsync(factory, "ana")).Id, new ChangeProfileRequest("77", null, null, null, null));

        using var response = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{(await FindUserAsync(factory, "bia")).Id:D}/profile",
            new ChangeProfileRequest("7-7", null, null, null, null), token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("profile.registration.duplicate", await response.Content.ReadAsStringAsync());
    }

    [DockerFact]
    public async Task Profile_InactiveSectorNotAllowedUnlessCurrent()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sectors = await AddSectorsAsync(admin, token, "Produção", "Logística");
        var production = sectors.Single(item => item.Name == "Produção");
        var logistics = sectors.Single(item => item.Name == "Logística");
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        await ProvisionAsync(admin, token, "bia", "Bia Souza");
        var ana = await FindUserAsync(factory, "ana");
        var bia = await FindUserAsync(factory, "bia");
        await SaveProfileAsync(admin, token, ana.Id, new ChangeProfileRequest(null, null, null, null, production.Id));
        using (var off = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/registry/sectors/{production.Id:D}", new UpdateRegistryItemRequest(null, false), token))
            Assert.Equal(HttpStatusCode.OK, off.StatusCode);

        // she keeps the inactive one she already has
        var kept = await SaveProfileAsync(admin, token, ana.Id, new ChangeProfileRequest(null, "ana@x.com", null, null, production.Id));
        Assert.Equal(production.Id, kept.SectorId);

        // nobody else can be put in it, nor in a sector that does not exist
        using var refused = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{bia.Id:D}/profile",
            new ChangeProfileRequest(null, null, null, null, production.Id), token);
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Contains("profile.sector.invalid", await refused.Content.ReadAsStringAsync());
        using var unknown = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{bia.Id:D}/profile",
            new ChangeProfileRequest(null, null, null, Guid.NewGuid(), null), token);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Contains("profile.unit.invalid", await unknown.Content.ReadAsStringAsync());

        var ok = await SaveProfileAsync(admin, token, bia.Id, new ChangeProfileRequest(null, null, null, null, logistics.Id));
        Assert.Equal(logistics.Id, ok.SectorId);
    }

    [DockerFact]
    public async Task Placement_MovesManyToSector()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        await ProvisionAsync(admin, token, "bia", "Bia Souza");
        await ProvisionAsync(admin, token, "caio", "Caio Souza");
        var ana = await FindUserAsync(factory, "ana");
        var bia = await FindUserAsync(factory, "bia");

        var moved = await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id, bia.Id, ana.Id], "sector", sector.Id));

        Assert.Equal(2, moved.Changed);
        Assert.Equal(sector.Id, (await FindUserAsync(factory, "ana")).SectorId);
        Assert.Equal(sector.Id, (await FindUserAsync(factory, "bia")).SectorId);
        Assert.Null((await FindUserAsync(factory, "caio")).SectorId);
        Assert.NotEqual(ana.ConcurrencyStamp, (await FindUserAsync(factory, "ana")).ConcurrencyStamp);
        Assert.Equal(0, (await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id], "sector", sector.Id))).Changed);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.True(await db.AuditEntries.AnyAsync(entry => entry.Action == "identity.users.placement_changed" && entry.SubjectId == "sector:2"));
    }

    [DockerFact]
    public async Task Placement_NullRemovesSector()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var unit = await AddUnitAsync(admin, token, "Matriz");
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        var ana = await FindUserAsync(factory, "ana");
        await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id], "sector", sector.Id));
        await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id], "unit", unit.Id));

        var result = await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id], "sector", null));

        Assert.Equal(1, result.Changed);
        var saved = await FindUserAsync(factory, "ana");
        Assert.Null(saved.SectorId);
        Assert.Equal(unit.Id, saved.UnitId);
    }

    [DockerFact]
    public async Task Placement_IgnoresOtherCompanyIds()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        var ana = await FindUserAsync(factory, "ana");
        var strangerId = await AddOtherCompanyParticipantAsync(factory);

        var result = await PlaceAsync(admin, token, new ChangePlacementRequest([ana.Id, strangerId, Guid.NewGuid()], "sector", sector.Id));

        Assert.Equal(1, result.Changed);
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Null((await db.Users.AsNoTracking().SingleAsync(user => user.Id == strangerId)).SectorId);

        using var tooMany = await SendJsonAsync(admin, HttpMethod.Put, "/api/admin/users/placement",
            new ChangePlacementRequest(Enumerable.Range(0, 2001).Select(_ => Guid.NewGuid()).ToArray(), "sector", null), token);
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [DockerFact]
    public async Task Administrators_AreNeverTouchedByProfileOrPlacement()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        var ana = await FindUserAsync(factory, "ana");
        var root = await FindUserAsync(factory, "admin-root");

        var result = await PlaceAsync(admin, token, new ChangePlacementRequest([root.Id, ana.Id], "sector", sector.Id));

        Assert.Equal(1, result.Changed);
        Assert.Null((await FindUserAsync(factory, "admin-root")).SectorId);
        using var response = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{root.Id:D}/profile",
            new ChangeProfileRequest("999", "a@x.com", null, null, null), token);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("user.not_found", await response.Content.ReadAsStringAsync());
        Assert.Null((await FindUserAsync(factory, "admin-root")).RegistrationNumber);
    }

    [DockerFact]
    public async Task Profile_InvalidEmail_IsRefused()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        await ProvisionAsync(admin, token, "ana", "Ana Souza");
        var ana = await FindUserAsync(factory, "ana");

        foreach (var email in new[] { new string('a', 252) + "@x.com", "sem-arroba" })
        {
            using var response = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{ana.Id:D}/profile",
                new ChangeProfileRequest(null, email, null, null, null), token);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Contains("profile.email.invalid", await response.Content.ReadAsStringAsync());
        }

        Assert.Null((await FindUserAsync(factory, "ana")).Email);
    }

    [DockerFact]
    public async Task ManualRename_IsNotOverwrittenByImport()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = await CreateFactoryAsync(postgres);
        var (admin, token) = await SignInAdminAsync(factory);
        var sector = (await AddSectorsAsync(admin, token, "Produção")).Single();
        await ProvisionAsync(admin, token, "maria", "Maria Davila");
        var maria = await FindUserAsync(factory, "maria");
        using (var rename = await SendJsonAsync(admin, HttpMethod.Put, $"/api/admin/users/{maria.Id:D}/display-name", new ChangeDisplayNameRequest("Maria D'Avila"), token))
            Assert.Equal(HttpStatusCode.OK, rename.StatusCode);

        await ImportAsync(admin, token, new ImportRow(2, "MARIA D AVILA", "maria", null, null, null, null, null, null));
        Assert.Equal("Maria D'Avila", (await FindUserAsync(factory, "maria")).DisplayName);

        var result = await ImportAsync(admin, token, new ImportRow(2, null, "maria", null, null, null, null, "Produção", null));
        Assert.Equal(1, result.Updated);
        var saved = await FindUserAsync(factory, "maria");
        Assert.Equal("Maria D'Avila", saved.DisplayName);
        Assert.Equal(sector.Id, saved.SectorId);
    }

    private static async Task<ParticipantProfile> SaveProfileAsync(HttpClient client, string token, Guid userId, ChangeProfileRequest body)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Put, $"/api/admin/users/{userId:D}/profile", body, token);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var profile = await response.Content.ReadFromJsonAsync<ParticipantProfile>();
        Assert.NotNull(profile);
        return profile;
    }

    private static async Task<PlacementResult> PlaceAsync(HttpClient client, string token, ChangePlacementRequest body)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Put, "/api/admin/users/placement", body, token);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var result = await response.Content.ReadFromJsonAsync<PlacementResult>();
        Assert.NotNull(result);
        return result;
    }

    private static async Task<ImportResult> ImportAsync(HttpClient client, string token, params ImportRow[] rows)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/users/import", new ImportRequest(false, rows), token);
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        var result = await response.Content.ReadFromJsonAsync<ImportResult>();
        Assert.NotNull(result);
        return result;
    }

    private static async Task<RegistryItem> AddUnitAsync(HttpClient client, string token, string name)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/registry/units", new AddRegistryItemsRequest([name]), token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var registry = await response.Content.ReadFromJsonAsync<CompanyRegistry>();
        Assert.NotNull(registry);
        return registry.Units.Single();
    }

    private static async Task<IReadOnlyList<RegistryItem>> AddSectorsAsync(HttpClient client, string token, params string[] names)
    {
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/registry/sectors", new AddRegistryItemsRequest(names), token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var registry = await response.Content.ReadFromJsonAsync<CompanyRegistry>();
        Assert.NotNull(registry);
        return registry.Sectors;
    }

    private static async Task ProvisionAsync(HttpClient client, string token, string login, string name)
    {
        using var created = await SendJsonAsync(client, HttpMethod.Post, "/api/admin/users",
            new ProvisionUserRequest(login, name, "ParticipantPass123", PlatformRoles.Participant), token);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());
    }

    private static async Task<Guid> AddOtherCompanyParticipantAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var role = await db.Roles.SingleAsync(item => item.NormalizedName == PlatformRoles.Participant.ToUpperInvariant());
        var id = Guid.NewGuid();
        var tenantId = Guid.NewGuid();
        db.Tenants.Add(new SipatOnline.Infrastructure.Tenancy.TenantEntity
        {
            Id = tenantId,
            Key = "other-company",
            Name = "Other company",
            PrimaryColor = SipatOnline.Tenancy.Domain.Tenants.TenantBranding.DefaultPrimaryColor,
            SecondaryColor = SipatOnline.Tenancy.Domain.Tenants.TenantBranding.DefaultSecondaryColor,
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        });
        db.Users.Add(new PlatformIdentityUser
        {
            Id = id,
            UserName = $"account-{id:N}",
            TenantId = tenantId,
            EmployeeIdentifier = "outra",
            NormalizedEmployeeIdentifier = "OUTRA",
            DisplayName = "Outra Empresa",
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        });
        db.UserRoles.Add(new IdentityUserRole<Guid> { UserId = id, RoleId = role.Id });
        await db.SaveChangesAsync();
        return id;
    }

    private static async Task<PlatformIdentityUser> FindUserAsync(SipatOnlineApiFactory factory, string login)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        return await db.Users.AsNoTracking().SingleAsync(user => user.EmployeeIdentifier == login);
    }

    private static async Task<PostgreSqlContainer> StartPostgresAsync()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private static async Task<SipatOnlineApiFactory> CreateFactoryAsync(PostgreSqlContainer postgres)
    {
        var factory = new SipatOnlineApiFactory(postgres.GetConnectionString(), false);
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        return factory;
    }

    private static async Task<(HttpClient Client, string Token)> SignInAdminAsync(SipatOnlineApiFactory factory)
    {
        var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonAsync(client, HttpMethod.Post, "/api/identity/login", new LoginRequest("admin-root", "AdminPassword123"), token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        return (client, await GetAntiforgeryTokenAsync(client));
    }

    private static async Task<string> GetAntiforgeryTokenAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/identity/antiforgery");
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token?.RequestToken);
        return token.RequestToken;
    }

    private static async Task<HttpResponseMessage> SendJsonAsync<TRequest>(HttpClient client, HttpMethod method, string path, TRequest body, string token)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }
}
