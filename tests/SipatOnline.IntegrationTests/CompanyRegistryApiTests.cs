using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
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
