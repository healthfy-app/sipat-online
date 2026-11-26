using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class CompanyRegistryApiTests
{
    [DockerFact]
    public async Task Migration_KeepsExistingParticipantsAndTheirLogin()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        using var adminClient = CreateClient(factory);
        await SignInAdminAsync(adminClient);
        var token = await GetAntiforgeryTokenAsync(adminClient);
        using var created = await SendJsonWithAntiforgeryAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/users",
            new ProvisionUserRequest("Joao-Existente", "Joao Existente", "ParticipantPass123", PlatformRoles.Participant),
            token);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync());

        using var participantClient = CreateClient(factory);
        await SignInAsync(participantClient, "Joao-Existente", "ParticipantPass123");

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var user = await dbContext.Users.SingleAsync(account => account.EmployeeIdentifier == "Joao-Existente");
        Assert.Null(user.RegistrationNumber);
        Assert.Null(user.Phone);
        Assert.Null(user.UnitId);
        Assert.Null(user.SectorId);
        Assert.False(user.DisplayNameLocked);
    }

    [DockerFact]
    public async Task Admin_PastesSectors_DuplicatesByAccentAreIgnored()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);

        using var response = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/registry/sectors",
            new AddRegistryItemsRequest(["Tecnologia da Informação", "tecnologia da informacao", "", "Produção"]), token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var registry = await response.Content.ReadFromJsonAsync<CompanyRegistry>();
        Assert.NotNull(registry);
        Assert.Equal(["Produção", "Tecnologia da Informação"], registry.Sectors.Select(item => item.Name).ToArray());
        Assert.Empty(registry.Units);
    }

    [DockerFact]
    public async Task Admin_RenamesToAnExistingName_GetsConflict()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);
        using var added = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/registry/units",
            new AddRegistryItemsRequest(["Matriz", "Filial Sul"]), token);
        var registry = await added.Content.ReadFromJsonAsync<CompanyRegistry>();
        Assert.NotNull(registry);
        var filial = registry.Units.Single(item => item.Name == "Filial Sul");

        using var conflict = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/units/{filial.Id:D}",
            new UpdateRegistryItemRequest("MATRIZ", null), token);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Contains("registry.name.duplicate", await conflict.Content.ReadAsStringAsync());

        using var tooLong = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/units/{filial.Id:D}",
            new UpdateRegistryItemRequest(new string('x', 101), null), token);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Contains("registry.name.invalid", await tooLong.Content.ReadAsStringAsync());

        using var renamed = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/units/{filial.Id:D}",
            new UpdateRegistryItemRequest("Filial Norte", null), token);
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
    }

    [DockerFact]
    public async Task Admin_DeactivatesSector_PeopleKeepIt()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);
        using var added = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/registry/sectors",
            new AddRegistryItemsRequest(["Produção"]), token);
        var sector = (await added.Content.ReadFromJsonAsync<CompanyRegistry>())!.Sectors.Single();
        using var created = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/users",
            new ProvisionUserRequest("Joao-Setor", "Joao Setor", "ParticipantPass123", PlatformRoles.Participant), token);
        var user = await created.Content.ReadFromJsonAsync<UserResponse>();
        Assert.NotNull(user);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var account = await db.Users.SingleAsync(item => item.Id == user.Id);
            account.SectorId = sector.Id;
            await db.SaveChangesAsync();
        }

        using var deactivated = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/sectors/{sector.Id:D}",
            new UpdateRegistryItemRequest(null, false), token);

        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
        var item = await deactivated.Content.ReadFromJsonAsync<RegistryItem>();
        Assert.NotNull(item);
        Assert.False(item.IsActive);
        Assert.Equal(1, item.PeopleCount);
        await using var verify = factory.Services.CreateAsyncScope();
        var verifyDb = verify.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(sector.Id, (await verifyDb.Users.SingleAsync(account => account.Id == user.Id)).SectorId);
        Assert.False((await verifyDb.CompanySectors.SingleAsync(row => row.Id == sector.Id)).IsActive);
    }

    [DockerFact]
    public async Task Rules_StartAllOff_AndSave()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);

        var initial = await admin.GetFromJsonAsync<CompanyRegistry>("/api/admin/registry");
        Assert.NotNull(initial);
        Assert.Equal(new ProfileRules(false, false, false, false, false), initial.Rules);

        using var saved = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, "/api/admin/registry/rules",
            new ProfileRules(false, false, false, false, true), token);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);

        var after = await admin.GetFromJsonAsync<CompanyRegistry>("/api/admin/registry");
        Assert.NotNull(after);
        Assert.True(after.Rules.RequireSector);
        Assert.False(after.Rules.RequireEmail);
    }

    [DockerFact]
    public async Task Registry_IsTenantScoped()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        var otherTenantId = Guid.NewGuid();
        var foreignSectorId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.Tenants.Add(new SipatOnline.Infrastructure.Tenancy.TenantEntity
            {
                Id = otherTenantId,
                Key = "other-company",
                Name = "Other company",
                PrimaryColor = SipatOnline.Tenancy.Domain.Tenants.TenantBranding.DefaultPrimaryColor,
                SecondaryColor = SipatOnline.Tenancy.Domain.Tenants.TenantBranding.DefaultSecondaryColor,
                CreatedAt = DateTimeOffset.UtcNow,
                IsActive = true
            });
            db.CompanySectors.Add(new CompanySectorEntity
            {
                Id = foreignSectorId,
                TenantId = otherTenantId,
                Name = "Alheio",
                NameKey = "ALHEIO",
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
        }

        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);

        var registry = await admin.GetFromJsonAsync<CompanyRegistry>("/api/admin/registry");
        Assert.NotNull(registry);
        Assert.DoesNotContain(registry.Sectors, item => item.Id == foreignSectorId);

        using var put = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/sectors/{foreignSectorId:D}",
            new UpdateRegistryItemRequest("Invadido", false), token);
        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);

        // the same name is free in this company: uniqueness is per company
        using var added = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/registry/sectors",
            new AddRegistryItemsRequest(["Alheio"]), token);
        Assert.Equal(HttpStatusCode.OK, added.StatusCode);
        await using var verify = factory.Services.CreateAsyncScope();
        var foreign = await verify.ServiceProvider.GetRequiredService<PlatformDbContext>().CompanySectors.SingleAsync(row => row.Id == foreignSectorId);
        Assert.Equal("Alheio", foreign.Name);
        Assert.True(foreign.IsActive);
    }

    [DockerFact]
    public async Task Participant_CannotChangeRegistry()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var adminToken = await GetAntiforgeryTokenAsync(admin);
        using var created = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/users",
            new ProvisionUserRequest("Maria-Colab", "Maria Colab", "ParticipantPass123", PlatformRoles.Participant), adminToken);
        Assert.True(created.IsSuccessStatusCode);

        using var participant = CreateClient(factory);
        await SignInAsync(participant, "Maria-Colab", "ParticipantPass123");
        var token = await GetAntiforgeryTokenAsync(participant);

        using var add = await SendJsonWithAntiforgeryAsync(participant, HttpMethod.Post, "/api/admin/registry/sectors",
            new AddRegistryItemsRequest(["Qualquer"]), token);
        Assert.Equal(HttpStatusCode.Forbidden, add.StatusCode);
        using var rules = await SendJsonWithAntiforgeryAsync(participant, HttpMethod.Put, "/api/admin/registry/rules",
            new ProfileRules(true, true, true, true, true), token);
        Assert.Equal(HttpStatusCode.Forbidden, rules.StatusCode);
    }

    [DockerFact]
    public async Task RegistryChanges_LeaveAnAuditRow_ButNoChangeLeavesNone()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        using var admin = CreateClient(factory);
        await SignInAdminAsync(admin);
        var token = await GetAntiforgeryTokenAsync(admin);

        using var added = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Post, "/api/admin/registry/sectors",
            new AddRegistryItemsRequest(["Produção"]), token);
        var sector = (await added.Content.ReadFromJsonAsync<CompanyRegistry>())!.Sectors.Single();
        using (var renamed = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/sectors/{sector.Id:D}",
            new UpdateRegistryItemRequest("Produção Sul", null), token))
            Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        using (var same = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, $"/api/admin/registry/sectors/{sector.Id:D}",
            new UpdateRegistryItemRequest("Produção Sul", true), token))
            Assert.Equal(HttpStatusCode.OK, same.StatusCode);
        using (var rules = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, "/api/admin/registry/rules",
            new ProfileRules(false, true, false, false, false), token))
            Assert.Equal(HttpStatusCode.OK, rules.StatusCode);
        using (var sameRules = await SendJsonWithAntiforgeryAsync(admin, HttpMethod.Put, "/api/admin/registry/rules",
            new ProfileRules(false, true, false, false, false), token))
            Assert.Equal(HttpStatusCode.OK, sameRules.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(1, await db.AuditEntries.CountAsync(entry => entry.Action == "identity.registry.sector_added"));
        Assert.Equal(1, await db.AuditEntries.CountAsync(entry => entry.Action == "identity.registry.sector_updated" && entry.SubjectId == sector.Id.ToString("D")));
        Assert.Equal(1, await db.AuditEntries.CountAsync(entry => entry.Action == "identity.registry.rules_changed"));
    }

    [DockerFact]
    public async Task Sectors_are_made_inside_a_unit_and_the_same_name_in_another_unit_is_the_same_sector()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");
        var saoPaulo = await company.UnitAsync("São Paulo");

        await company.Send(HttpMethod.Post, $"/api/admin/registry/units/{minas}/sectors", new { names = new[] { "RH", "TI", "" } });
        var registry = await company.Send(HttpMethod.Post, $"/api/admin/registry/units/{saoPaulo}/sectors", new { names = new[] { "rh" } });

        var sectors = registry.GetProperty("sectors").EnumerateArray().ToDictionary(item => item.GetProperty("name").GetString()!, item => item.GetProperty("id").GetGuid());
        Assert.Equal(["RH", "TI"], sectors.Keys.Order());
        Assert.Equal(new[] { (minas, sectors["RH"]), (minas, sectors["TI"]), (saoPaulo, sectors["RH"]) }.Order(), Links(registry).Order());
    }

    [DockerFact]
    public async Task A_person_put_in_a_unit_and_a_sector_makes_the_sector_one_of_that_unit()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");
        var production = await company.SectorAsync("Produção");

        await company.PersonAsync("lucia", minas, production);
        await company.PersonAsync("nina", minas, production);

        var link = (await company.Get("/api/admin/registry")).GetProperty("unitSectors").EnumerateArray().Single();
        Assert.Equal(minas, link.GetProperty("unitId").GetGuid());
        Assert.Equal(production, link.GetProperty("sectorId").GetGuid());
        Assert.Equal(2, link.GetProperty("peopleCount").GetInt32());
    }

    [DockerFact]
    public async Task A_sector_leaves_a_unit_only_when_nobody_of_the_unit_is_in_it()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");
        var registry = await company.Send(HttpMethod.Post, $"/api/admin/registry/units/{minas}/sectors", new { names = new[] { "RH", "TI" } });
        var sectors = registry.GetProperty("sectors").EnumerateArray().ToDictionary(item => item.GetProperty("name").GetString()!, item => item.GetProperty("id").GetGuid());
        await company.PersonAsync("lucia", minas, sectors["RH"]);

        var refused = await company.Send(HttpMethod.Delete, $"/api/admin/registry/units/{minas}/sectors/{sectors["RH"]}", new { }, HttpStatusCode.Conflict);
        var after = await company.Send(HttpMethod.Delete, $"/api/admin/registry/units/{minas}/sectors/{sectors["TI"]}", new { });

        Assert.Equal("registry.unit_sector.in_use", refused.GetProperty("code").GetString());
        Assert.Equal([(minas, sectors["RH"])], Links(after));
        // the sector itself stays in the company's list: it only left this unit
        Assert.Contains(after.GetProperty("sectors").EnumerateArray(), item => item.GetProperty("id").GetGuid() == sectors["TI"]);
    }

    private static (Guid Unit, Guid Sector)[] Links(System.Text.Json.JsonElement registry) =>
        registry.GetProperty("unitSectors").EnumerateArray().Select(item => (item.GetProperty("unitId").GetGuid(), item.GetProperty("sectorId").GetGuid())).ToArray();

    [DockerFact]
    public async Task Removing_an_unused_unit_deletes_it()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var minas = await company.UnitAsync("Minas Gerais");

        var removal = await company.Send(HttpMethod.Delete, $"/api/admin/registry/units/{minas}", new { });

        Assert.True(removal.GetProperty("deleted").GetBoolean());
        Assert.DoesNotContain((await company.Get("/api/admin/registry")).GetProperty("units").EnumerateArray(),
            item => item.GetProperty("id").GetGuid() == minas);
    }

    [DockerFact]
    public async Task Removing_a_sector_with_people_only_puts_it_away()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var production = await company.SectorAsync("Produção");
        await company.PersonAsync("ana", sectorId: production);

        var removal = await company.Send(HttpMethod.Delete, $"/api/admin/registry/sectors/{production}", new { });

        Assert.False(removal.GetProperty("deleted").GetBoolean());
        var sector = (await company.Get("/api/admin/registry")).GetProperty("sectors").EnumerateArray()
            .Single(item => item.GetProperty("id").GetGuid() == production);
        Assert.False(sector.GetProperty("isActive").GetBoolean());
        Assert.Equal(1, sector.GetProperty("peopleCount").GetInt32());
    }

    [DockerFact]
    public async Task Removing_a_unit_marked_on_a_training_only_puts_it_away()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();
        var saoPaulo = await company.UnitAsync("São Paulo");
        var training = await company.TrainingAsync("SIPAT SP");
        await company.AudienceAsync(training, [(saoPaulo, null)]);

        var removal = await company.Send(HttpMethod.Delete, $"/api/admin/registry/units/{saoPaulo}", new { });

        Assert.False(removal.GetProperty("deleted").GetBoolean());
        Assert.Equal([(saoPaulo, null)], TrainingAudienceScenario.Targets(await company.Get($"/api/admin/sipats/{training}/audience")));
    }

    [DockerFact]
    public async Task Removing_one_that_is_not_of_the_company_is_not_found()
    {
        await using var company = await TrainingAudienceScenario.StartAsync();

        await company.Send(HttpMethod.Delete, $"/api/admin/registry/units/{Guid.NewGuid()}", new { }, HttpStatusCode.NotFound);
    }

    private static HttpClient CreateClient(SipatOnlineApiFactory factory) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });

    private static async Task InitializeDatabaseAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    private static async Task SignInAdminAsync(HttpClient client) =>
        await SignInAsync(client, "admin-root", "AdminPassword123");

    private static async Task SignInAsync(HttpClient client, string loginIdentifier, string password)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest(loginIdentifier, password),
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
