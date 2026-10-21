using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Sipats;
using SipatOnline.Infrastructure.Tenancy;
using SipatOnline.Sipats.Application.Sipats;
using SipatOnline.Infrastructure.Auditing;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Identity.Domain.Users;
using SipatOnline.Tenancy.Application.Branding;
using SipatOnline.Tenancy.Domain.Tenants;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class SipatEventApiTests
{
    [DockerFact]
    public async Task SipatAdministration_IsAuthorizedAuditedAndTenantScoped()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);
        await AddOtherTenantEventAsync(factory);

        using var anonymousClient = CreateClient(factory);
        var anonymousResponse = await anonymousClient.GetAsync("/api/admin/sipats");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var client = CreateClient(factory);
        await SignInAdminAsync(client);
        var csrfToken = await GetAntiforgeryTokenAsync(client);

        using var requestWithoutToken = new HttpRequestMessage(HttpMethod.Post, "/api/admin/sipats")
        {
            Content = JsonContent.Create(CreateRequest())
        };
        var antiforgeryResponse = await client.SendAsync(requestWithoutToken);
        Assert.Equal(HttpStatusCode.BadRequest, antiforgeryResponse.StatusCode);

        csrfToken = await GetAntiforgeryTokenAsync(client);
        var createResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/admin/sipats",
            CreateRequest(),
            csrfToken);
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<SipatEventResponse>();
        Assert.NotNull(created);
        Assert.Equal("SIPAT 2026", created.Title);
        Assert.Equal("Draft", created.Status);
        Assert.Equal(SipatOnlineApiFactory.DefaultTenantId, created.TenantId);

        var listResponse = await client.GetAsync("/api/admin/sipats?offset=0&limit=10");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var page = await listResponse.Content.ReadFromJsonAsync<SipatEventListResponse>();
        Assert.NotNull(page);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal(created.Id, Assert.Single(page.Items).Id);

        var invalidScheduleRequest = CreateRequest() with { EndsAt = CreateRequest().StartsAt };
        csrfToken = await GetAntiforgeryTokenAsync(client);
        var invalidScheduleResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/admin/sipats",
            invalidScheduleRequest,
            csrfToken);
        Assert.Equal(HttpStatusCode.BadRequest, invalidScheduleResponse.StatusCode);

        var participant = User.Create(
            new TenantId(SipatOnlineApiFactory.DefaultTenantId),
            "Employee-Participant",
            "SIPAT Participant",
            DateTimeOffset.UtcNow);
        Assert.True(participant.IsSuccess);
        await using (var participantScope = factory.Services.CreateAsyncScope())
        {
            var userStore = participantScope.ServiceProvider.GetRequiredService<IUserAccountStore>();
            var createParticipantResult = await userStore.CreateAsync(
                participant.Value,
                "ParticipantPass123",
                PlatformRoles.Participant,
                CancellationToken.None);
            Assert.True(createParticipantResult.IsSuccess);
        }

        using var participantClient = CreateClient(factory);
        await SignInAsync(participantClient, "Employee-Participant", "ParticipantPass123");
        var participantListResponse = await participantClient.GetAsync("/api/admin/sipats");
        Assert.Equal(HttpStatusCode.Forbidden, participantListResponse.StatusCode);

        csrfToken = await GetAntiforgeryTokenAsync(client);
        var publishResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/sipats/{created.Id:D}/publish",
            new { },
            csrfToken);
        Assert.Equal(HttpStatusCode.OK, publishResponse.StatusCode);

        csrfToken = await GetAntiforgeryTokenAsync(client);
        var updatePublishedResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Put,
            $"/api/admin/sipats/{created.Id:D}",
            CreateRequest() with { Title = "SIPAT atualizada" },
            csrfToken);
        Assert.Equal(HttpStatusCode.OK, updatePublishedResponse.StatusCode);

        csrfToken = await GetAntiforgeryTokenAsync(client);
        var cancelResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/sipats/{created.Id:D}/cancel",
            new { },
            csrfToken);
        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        var cancelled = await cancelResponse.Content.ReadFromJsonAsync<SipatEventResponse>();
        Assert.NotNull(cancelled);
        Assert.Equal("Cancelled", cancelled.Status);

        csrfToken = await GetAntiforgeryTokenAsync(client);
        var updateCancelledResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Put,
            $"/api/admin/sipats/{created.Id:D}",
            CreateRequest(),
            csrfToken);
        Assert.Equal(HttpStatusCode.Conflict, updateCancelledResponse.StatusCode);

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var auditActions = await dbContext.AuditEntries
            .AsNoTracking()
            .Where(entry => entry.SubjectType == "sipat" && entry.SubjectId == created.Id.ToString("D"))
            .OrderBy(entry => entry.OccurredAt)
            .Select(entry => entry.Action)
            .ToArrayAsync();
        Assert.Equal(
            ["sipat.created", "sipat.published", "sipat.updated", "sipat.cancelled"],
            auditActions);
    }

    private static SipatEventDataRequest CreateRequest() =>
        new(
            "SIPAT 2026",
            "Evento anual de prevenção",
            new DateTimeOffset(2026, 10, 21, 12, 0, 0, TimeSpan.Zero),
            new DateTimeOffset(2026, 10, 22, 12, 0, 0, TimeSpan.Zero));

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

    private static async Task AddOtherTenantEventAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var tenantId = Guid.Parse("33333333-3333-3333-3333-333333333333");
        dbContext.Tenants.Add(new TenantEntity
        {
            Id = tenantId,
            Key = "another-company",
            Name = "Outra empresa",
            PrimaryColor = TenantBranding.DefaultPrimaryColor,
            SecondaryColor = TenantBranding.DefaultSecondaryColor,
            CreatedAt = DateTimeOffset.UtcNow,
            IsActive = true
        });
        dbContext.SipatEvents.Add(new SipatEventEntity
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            Title = "SIPAT de outra empresa",
            StartsAt = DateTimeOffset.UtcNow.AddDays(1),
            EndsAt = DateTimeOffset.UtcNow.AddDays(2),
            CreatedAt = DateTimeOffset.UtcNow,
            Status = SipatOnline.Sipats.Domain.Sipats.SipatEventStatus.Published
        });
        await dbContext.SaveChangesAsync();
    }

    private static async Task SignInAdminAsync(HttpClient client)
    {
        await SignInAsync(client, "admin-root", "AdminPassword123");
    }

    private static async Task SignInAsync(
        HttpClient client,
        string loginIdentifier,
        string password)
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
