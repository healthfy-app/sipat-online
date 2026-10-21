using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class IdentityApiTests
{
    [DockerFact]
    public async Task UserManagement_RequiresAuthorizationAndAntiforgery_AndIsTenantScoped()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        await AddUserInOtherTenantAsync(factory);

        using var anonymousClient = CreateClient(factory);
        var anonymousResponse = await anonymousClient.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var adminClient = CreateClient(factory);
        await SignInAdminAsync(adminClient);

        var csrfToken = await GetAntiforgeryTokenAsync(adminClient);
        using var createWithoutToken = new HttpRequestMessage(HttpMethod.Post, "/api/admin/users")
        {
            Content = JsonContent.Create(
                new ProvisionUserRequest(
                    "Missing-Csrf",
                    "Missing CSRF",
                    "ParticipantPass123",
                    PlatformRoles.Participant))
        };
        var csrfResponse = await adminClient.SendAsync(createWithoutToken);
        Assert.Equal(HttpStatusCode.BadRequest, csrfResponse.StatusCode);

        var listResponse = await adminClient.GetAsync("/api/admin/users?offset=0&limit=20");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var page = await listResponse.Content.ReadFromJsonAsync<UserListResponse>();
        Assert.NotNull(page);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal("admin-root", Assert.Single(page.Items).LoginIdentifier);

        var invalidPageResponse = await adminClient.GetAsync("/api/admin/users?limit=101");
        Assert.Equal(HttpStatusCode.BadRequest, invalidPageResponse.StatusCode);
    }

    [DockerFact]
    public async Task UserManagement_ProvisionsAndDisablesParticipantAccount()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        using var adminClient = CreateClient(factory);
        await SignInAdminAsync(adminClient);
        var adminToken = await GetAntiforgeryTokenAsync(adminClient);
        var provisionResponse = await SendJsonWithAntiforgeryAsync(
            adminClient,
            HttpMethod.Post,
            "/api/admin/users",
            new ProvisionUserRequest(
                "Employee-123",
                "Alex Participant",
                "ParticipantPass123",
                PlatformRoles.Participant),
            adminToken);
        Assert.Equal(HttpStatusCode.Created, provisionResponse.StatusCode);
        var createdUser = await provisionResponse.Content.ReadFromJsonAsync<UserResponse>();
        Assert.NotNull(createdUser);

        using var participantClient = CreateClient(factory);
        await SignInAsync(participantClient, "Employee-123", "ParticipantPass123");

        adminToken = await GetAntiforgeryTokenAsync(adminClient);
        var renameResponse = await SendJsonWithAntiforgeryAsync(
            adminClient,
            HttpMethod.Put,
            $"/api/admin/users/{createdUser.Id:D}/display-name",
            new ChangeDisplayNameRequest("Alex Updated"),
            adminToken);
        Assert.Equal(HttpStatusCode.OK, renameResponse.StatusCode);

        adminToken = await GetAntiforgeryTokenAsync(adminClient);
        var disableResponse = await SendJsonWithAntiforgeryAsync(
            adminClient,
            HttpMethod.Put,
            $"/api/admin/users/{createdUser.Id:D}/status",
            new ChangeUserStatusRequest(false),
            adminToken);
        Assert.Equal(HttpStatusCode.OK, disableResponse.StatusCode);

        using var disabledParticipantClient = CreateClient(factory);
        var loginToken = await GetAntiforgeryTokenAsync(disabledParticipantClient);
        var loginResponse = await SendJsonWithAntiforgeryAsync(
            disabledParticipantClient,
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest("Employee-123", "ParticipantPass123"),
            loginToken);
        Assert.Equal(HttpStatusCode.Unauthorized, loginResponse.StatusCode);
    }

    [DockerFact]
    public async Task TenantPortal_ResolvesBrandingBySubdomainAndRejectsUnknownOrInactiveTenants()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        await AddTenantAsync(factory, "second-tenant", isActive: true);
        await AddTenantAsync(factory, "inactive-tenant", isActive: false);

        using var client = CreateClient(factory);
        using var tenantResponse = await client.GetAsync(
            "https://second-tenant.localhost/api/tenant/branding");
        Assert.Equal(HttpStatusCode.OK, tenantResponse.StatusCode);
        var branding = await tenantResponse.Content.ReadFromJsonAsync<TenantBrandingResponse>();
        Assert.NotNull(branding);
        Assert.Equal("second-tenant", branding.TenantKey);

        using var unknownTenantResponse = await client.GetAsync(
            "https://unknown-tenant.localhost/api/tenant/branding");
        Assert.Equal(HttpStatusCode.NotFound, unknownTenantResponse.StatusCode);

        using var inactiveTenantResponse = await client.GetAsync(
            "https://inactive-tenant.localhost/api/tenant/branding");
        Assert.Equal(HttpStatusCode.NotFound, inactiveTenantResponse.StatusCode);

        using var reservedHostResponse = await client.GetAsync(
            "https://api.localhost/api/tenant/branding");
        Assert.Equal(HttpStatusCode.NotFound, reservedHostResponse.StatusCode);
    }

    [DockerFact]
    public async Task AuthenticatedCookie_CannotBeReusedForAnotherTenantHost()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        await AddTenantAsync(factory, "second-tenant", isActive: true);

        using var client = CreateClient(factory);
        var token = await GetAntiforgeryTokenAsync(client);
        using var loginResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new LoginRequest("admin-root", "AdminPassword123"),
            token);
        Assert.Equal(HttpStatusCode.NoContent, loginResponse.StatusCode);

        var authCookie = Assert.Single(
            loginResponse.Headers.GetValues("Set-Cookie"),
            value => value.StartsWith("__Host-SipatOnline.Auth=", StringComparison.Ordinal))
            .Split(';', 2)[0];
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            "https://second-tenant.localhost/api/admin/users");
        request.Headers.Add("Cookie", authCookie);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [DockerFact]
    public async Task IdentitySession_ReturnsCurrentUserAndRoles()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        using var client = CreateClient(factory);
        await SignInAdminAsync(client);

        using var response = await client.GetAsync("/api/identity/session");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var session = await response.Content.ReadFromJsonAsync<IdentitySessionResponse>();
        Assert.NotNull(session);
        Assert.Equal("admin-root", session.LoginIdentifier);
        Assert.Contains(PlatformRoles.SuperAdmin, session.Roles);
    }

    private static HttpClient CreateClient(SipatOnlineApiFactory factory) =>
        factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });

    private static async Task InitializeDatabaseAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    private static async Task AddUserInOtherTenantAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var services = scope.ServiceProvider;
        var dbContext = services.GetRequiredService<PlatformDbContext>();
        var tenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");
        dbContext.Tenants.Add(new TenantEntity
        {
            Id = tenantId,
            Key = "other-tenant",
            Name = "Other Tenant",
            PrimaryColor = TenantBranding.DefaultPrimaryColor,
            SecondaryColor = TenantBranding.DefaultSecondaryColor,
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        });
        await dbContext.SaveChangesAsync();

        var userResult = User.Create(
            new TenantId(tenantId),
            "Other-Employee",
            "Other Tenant User",
            DateTimeOffset.UtcNow);
        Assert.True(userResult.IsSuccess);
        var creationResult = await services.GetRequiredService<IUserAccountStore>().CreateAsync(
            userResult.Value,
            "ParticipantPass123",
            PlatformRoles.Participant,
            CancellationToken.None);
        Assert.True(creationResult.IsSuccess);
    }

    private static async Task AddTenantAsync(
        SipatOnlineApiFactory factory,
        string key,
        bool isActive)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenant = Tenant.Create(key, key, DateTimeOffset.UtcNow);
        Assert.True(tenant.IsSuccess);
        dbContext.Tenants.Add(new TenantEntity
        {
            Id = tenant.Value.Id.Value,
            Key = tenant.Value.Key.Value,
            Name = tenant.Value.Name.Value,
            PrimaryColor = tenant.Value.Branding.PrimaryColor.Value,
            SecondaryColor = tenant.Value.Branding.SecondaryColor.Value,
            CreatedAt = tenant.Value.CreatedAt,
            IsActive = isActive
        });
        await dbContext.SaveChangesAsync();
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
