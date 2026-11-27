using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Identity.Application.Users;
using SipatOnline.Infrastructure;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class DataProtectionKeysTests
{
    private const string AuthCookie = "__Host-SipatOnline.Auth";
    private const string AntiforgeryCookie = "__Host-SipatOnline.Antiforgery";

    [DockerFact]
    public async Task Initialization_creates_one_data_protection_key()
    {
        await using var postgres = await StartPostgresAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(factory);

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(1, await db.DataProtectionKeys.CountAsync());
        Assert.NotNull((await db.DataProtectionKeys.SingleAsync()).FriendlyName);
    }

    [DockerFact]
    public async Task Initializing_twice_concurrently_keeps_one_active_key()
    {
        await using var postgres = await StartPostgresAsync();
        await using var first = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await using var second = new SipatOnlineApiFactory(postgres.GetConnectionString());
        // Both hosts start before the table exists: a host that starts with the table there and no key in it
        // makes a key of its own, outside the lock, and the count would be of that key instead of the race below.
        _ = second.Services;
        // Create the schema once so the race is on the key, not on the migration.
        await using (var scope = first.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Database.MigrateAsync();
        }

        // Only the key is raced: it is the step the lock serializes.
        await Task.WhenAll(EnsureKeyAsync(first), EnsureKeyAsync(second));

        await using var verify = first.Services.CreateAsyncScope();
        var db = verify.ServiceProvider.GetRequiredService<PlatformDbContext>();
        Assert.Equal(1, await db.DataProtectionKeys.CountAsync());
    }

    [DockerFact]
    public async Task A_login_cookie_from_one_instance_is_accepted_by_another()
    {
        await using var postgres = await StartPostgresAsync();
        await using var instanceA = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(instanceA);
        await using var instanceB = new SipatOnlineApiFactory(postgres.GetConnectionString());

        using var clientA = CreateClient(instanceA);
        var cookie = await SignInOperatorAsync(clientA);

        using var clientB = CreateClient(instanceB);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/platform/identity/session");
        request.Headers.Add("Cookie", cookie);
        using var response = await clientB.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [DockerFact]
    public async Task An_antiforgery_token_from_one_instance_is_accepted_by_another()
    {
        await using var postgres = await StartPostgresAsync();
        await using var instanceA = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await InitializeDatabaseAsync(instanceA);
        await using var instanceB = new SipatOnlineApiFactory(postgres.GetConnectionString());

        using var clientA = CreateClient(instanceA);
        using var tokenResponse = await clientA.GetAsync("/api/identity/antiforgery");
        tokenResponse.EnsureSuccessStatusCode();
        var token = (await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>())!.RequestToken!;
        var cookie = CookiePair(tokenResponse, AntiforgeryCookie);

        using var clientB = CreateClient(instanceB);
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/platform/identity/login")
        {
            Content = JsonContent.Create(new LoginRequest("platform-operator", "WrongPassword123"))
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        request.Headers.Add("Cookie", cookie);
        using var response = await clientB.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [DockerFact]
    public async Task A_cookie_survives_a_restart()
    {
        await using var postgres = await StartPostgresAsync();
        string cookie;
        await using (var instanceA = new SipatOnlineApiFactory(postgres.GetConnectionString()))
        {
            await InitializeDatabaseAsync(instanceA);
            using var clientA = CreateClient(instanceA);
            cookie = await SignInOperatorAsync(clientA);
        }

        await using var restarted = new SipatOnlineApiFactory(postgres.GetConnectionString());
        using var client = CreateClient(restarted);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/platform/identity/session");
        request.Headers.Add("Cookie", cookie);
        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
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
            BaseAddress = new Uri("https://ops.localhost"),
            AllowAutoRedirect = false,
            HandleCookies = false
        });

    private static async Task EnsureKeyAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var services = scope.ServiceProvider;
        await DataProtectionSetup.EnsureKeyAsync(
            services.GetRequiredService<PlatformDbContext>(),
            services.GetRequiredService<Microsoft.AspNetCore.DataProtection.KeyManagement.IKeyManager>(),
            services.GetRequiredService<TimeProvider>(),
            CancellationToken.None);
    }

    private static async Task InitializeDatabaseAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    /// <summary>Signs the platform operator in and returns the Cookie header value to replay on another instance.</summary>
    private static async Task<string> SignInOperatorAsync(HttpClient client)
    {
        using var tokenResponse = await client.GetAsync("/api/identity/antiforgery");
        tokenResponse.EnsureSuccessStatusCode();
        var token = (await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>())!.RequestToken!;
        var antiforgery = CookiePair(tokenResponse, AntiforgeryCookie);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/platform/identity/login")
        {
            Content = JsonContent.Create(new LoginRequest("platform-operator", "PlatformPassword123"))
        };
        request.Headers.Add("X-CSRF-TOKEN", token);
        request.Headers.Add("Cookie", antiforgery);
        using var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        return CookiePair(response, AuthCookie);
    }

    private static string CookiePair(HttpResponseMessage response, string name)
    {
        var setCookie = response.Headers.GetValues("Set-Cookie")
            .Single(value => value.StartsWith(name + "=", StringComparison.Ordinal));
        return setCookie.Split(';')[0];
    }
}
