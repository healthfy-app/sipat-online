using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class LoginAttemptCounterTests
{
    private static readonly DateTimeOffset Window = new(2026, 11, 21, 10, 0, 0, TimeSpan.Zero);

    [DockerFact]
    public async Task Parallel_increments_return_every_count_once()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        var counts = await Task.WhenAll(Enumerable.Range(0, 30).Select(async _ =>
        {
            await using var scope = factory.Services.CreateAsyncScope();
            return await scope.ServiceProvider.GetRequiredService<ILoginAttemptCounter>()
                .IncrementAsync("key-a", Window, CancellationToken.None);
        }));

        Assert.Equal(Enumerable.Range(1, 30), counts.OrderBy(count => count));
    }

    [DockerFact]
    public async Task Different_windows_count_apart()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        await using var scope = factory.Services.CreateAsyncScope();
        var counter = scope.ServiceProvider.GetRequiredService<ILoginAttemptCounter>();

        Assert.Equal(1, await counter.IncrementAsync("key-a", Window, CancellationToken.None));
        Assert.Equal(1, await counter.IncrementAsync("key-a", Window.AddMinutes(1), CancellationToken.None));
        Assert.Equal(2, await counter.IncrementAsync("key-a", Window, CancellationToken.None));
    }

    [DockerFact]
    public async Task Purge_removes_only_old_windows()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        await using var scope = factory.Services.CreateAsyncScope();
        var counter = scope.ServiceProvider.GetRequiredService<ILoginAttemptCounter>();
        await counter.IncrementAsync("key-a", Window.AddHours(-2), CancellationToken.None);
        await counter.IncrementAsync("key-b", Window.AddHours(-2), CancellationToken.None);
        await counter.IncrementAsync("key-a", Window, CancellationToken.None);

        var purged = await counter.PurgeBeforeAsync(Window.AddHours(-1), CancellationToken.None);

        Assert.Equal(2, purged);
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var remaining = await db.LoginAttemptWindows.AsNoTracking().SingleAsync();
        Assert.Equal("key-a", remaining.Key);
        Assert.Equal(Window, remaining.WindowStart);
    }

    [DockerFact]
    public async Task Login_limit_per_account_is_shared_between_instances()
    {
        await using var postgres = await StartPostgresAsync();
        await using var instanceA = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(instanceA);
        await using var instanceB = new SipatOnlineApiFactory(postgres.GetConnectionString());

        using var clientA = CreateClient(instanceA);
        using var clientB = CreateClient(instanceB);
        foreach (var client in new[] { clientA, clientB })
        {
            for (var attempt = 1; attempt <= 5; attempt++)
            {
                using var response = await WrongLoginAsync(client);
                Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            }
        }

        using var refused = await WrongLoginAsync(clientA);

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("Muitas tentativas.", problem.GetProperty("title").GetString());
    }

    private static async Task<HttpResponseMessage> WrongLoginAsync(HttpClient client)
    {
        using var tokenResponse = await client.GetAsync("/api/identity/antiforgery");
        tokenResponse.EnsureSuccessStatusCode();
        var token = (await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>())!.RequestToken!;
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/identity/login")
        {
            Content = JsonContent.Create(new LoginRequest("Target-Employee", "wrong-password"))
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return await client.SendAsync(request);
    }

    private static async Task<PostgreSqlContainer> StartPostgresAsync()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
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
}
