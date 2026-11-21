using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class LearningProgressConcurrencyTests
{
    /// <summary>
    /// Two tabs, or a resend after a bad connection, can send the first saves of a lesson at the
    /// same moment. Before, the second insert hit the unique index and the participant got a 500.
    /// </summary>
    [DockerFact]
    public async Task SimultaneousFirstSaves_AllSucceedAndKeepOneProgressRow()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(
            postgres.GetConnectionString(),
            developmentSampleEnabled: true);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        }

        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        var token = await GetAntiforgeryTokenAsync(client);
        using (var login = await SendAsync(client, HttpMethod.Post, "/api/identity/login",
            new { loginIdentifier = "participant-demo", password = "ParticipantPassword123" }, token))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        }

        token = await GetAntiforgeryTokenAsync(client);
        using var tracksJson = JsonDocument.Parse(await client.GetStringAsync("/api/learning/tracks"));
        var trackId = tracksJson.RootElement.EnumerateArray().First().GetProperty("id").GetGuid();
        using var experienceJson = JsonDocument.Parse(await client.GetStringAsync($"/api/learning/tracks/{trackId:D}"));
        var lessonId = experienceJson.RootElement.GetProperty("lessons").EnumerateArray().First().GetProperty("id").GetGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().LearningProgress
                .Where(item => item.LessonId == lessonId)
                .ExecuteDeleteAsync();
        }

        var saves = Enumerable.Range(1, 12).Select(async index =>
        {
            using var response = await SendAsync(client, HttpMethod.Put,
                $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/position",
                new { positionMilliseconds = index * 100 }, token);
            return (response.StatusCode, await response.Content.ReadAsStringAsync());
        });
        var statuses = await Task.WhenAll(saves);

        Assert.All(statuses, status => Assert.True(status.Item1 == HttpStatusCode.OK, status.Item2));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var rows = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().LearningProgress
                .CountAsync(item => item.LessonId == lessonId);
            Assert.Equal(1, rows);
        }
    }

    private static async Task<string> GetAntiforgeryTokenAsync(HttpClient client)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        Assert.NotNull(token?.RequestToken);
        return token.RequestToken;
    }

    private static Task<HttpResponseMessage> SendAsync<TRequest>(
        HttpClient client, HttpMethod method, string path, TRequest body, string token)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token);
        return client.SendAsync(request);
    }
}
