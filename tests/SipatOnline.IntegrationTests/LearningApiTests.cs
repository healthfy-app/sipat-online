using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class LearningApiTests
{
    [DockerFact]
    public async Task DevelopmentSample_PlaysAndPersistsVerifiedProgress()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(
            postgres.GetConnectionString(),
            developmentSampleEnabled: true);
        await InitializeDatabaseAsync(factory);
        await InitializeDatabaseAsync(factory);

        using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        await SignInAdminAsync(client);

        using var adminTracksResponse = await client.GetAsync("/api/learning/tracks");
        Assert.Equal(HttpStatusCode.Forbidden, adminTracksResponse.StatusCode);

        using var tenantTracksResponse = await client.GetAsync("/api/admin/learning/tracks");
        Assert.Equal(HttpStatusCode.OK, tenantTracksResponse.StatusCode);
        using var tenantTracksJson = JsonDocument.Parse(await tenantTracksResponse.Content.ReadAsStringAsync());
        var tenantTracks = tenantTracksJson.RootElement.EnumerateArray().ToArray();
        Assert.Equal(4, tenantTracks.Length);
        Assert.All(tenantTracks, track => Assert.True(track.GetProperty("isPublished").GetBoolean()));

        using var participationResponse = await client.GetAsync("/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.OK, participationResponse.StatusCode);
        using var participationJson = JsonDocument.Parse(
            await participationResponse.Content.ReadAsStringAsync());
        Assert.Contains(
            participationJson.RootElement.EnumerateArray(),
            row => row.GetProperty("loginIdentifier").GetString() == "participant-demo");

        var sipatEventId = tenantTracks[0].GetProperty("sipatEventId").GetGuid();
        var token = await GetAntiforgeryTokenAsync(client);
        using var createTrackResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/sipats/{sipatEventId:D}/tracks",
            new { title = "Trilha criada pela administração", description = "Rascunho retomável" },
            token);
        Assert.Equal(HttpStatusCode.Created, createTrackResponse.StatusCode);
        using var createdTrackJson = JsonDocument.Parse(
            await createTrackResponse.Content.ReadAsStringAsync());
        var createdTrackId = createdTrackJson.RootElement.GetProperty("id").GetGuid();

        using var emptyDraftResponse = await client.GetAsync(
            $"/api/admin/learning/tracks/{createdTrackId:D}/draft");
        Assert.Equal(HttpStatusCode.OK, emptyDraftResponse.StatusCode);
        using var emptyDraftJson = JsonDocument.Parse(await emptyDraftResponse.Content.ReadAsStringAsync());
        Assert.Empty(emptyDraftJson.RootElement.GetProperty("lessons").EnumerateArray());

        token = await GetAntiforgeryTokenAsync(client);
        using var addLessonResponse = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            $"/api/admin/learning/tracks/{createdTrackId:D}/lessons",
            new
            {
                title = "Vídeo autorizado",
                description = (string?)null,
                providerAssetReference = "development:mdn-flower-demo",
                durationMilliseconds = 5055
            },
            token);
        Assert.Equal(HttpStatusCode.Created, addLessonResponse.StatusCode);

        using var resumedDraftResponse = await client.GetAsync(
            $"/api/admin/learning/tracks/{createdTrackId:D}/draft");
        Assert.Equal(HttpStatusCode.OK, resumedDraftResponse.StatusCode);
        using var resumedDraftJson = JsonDocument.Parse(
            await resumedDraftResponse.Content.ReadAsStringAsync());
        var resumedLesson = Assert.Single(
            resumedDraftJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal("Vídeo autorizado", resumedLesson.GetProperty("title").GetString());
        Assert.Equal(
            "development:mdn-flower-demo",
            resumedLesson.GetProperty("providerAssetReference").GetString());

        using var participantsResponse = await client.GetAsync("/api/admin/users/participants");
        Assert.Equal(HttpStatusCode.OK, participantsResponse.StatusCode);
        var participants = await participantsResponse.Content.ReadFromJsonAsync<UserListResponse>();
        Assert.NotNull(participants);
        Assert.Equal("participant-demo", Assert.Single(participants.Items).LoginIdentifier);

        using var participantClient = factory.CreateClient(
            new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false
            });
        await SignInParticipantAsync(participantClient);

        using var participantAdminReportResponse = await participantClient.GetAsync(
            "/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.Forbidden, participantAdminReportResponse.StatusCode);

        using var tracksResponse = await participantClient.GetAsync("/api/learning/tracks");
        Assert.Equal(HttpStatusCode.OK, tracksResponse.StatusCode);
        using var tracksJson = JsonDocument.Parse(await tracksResponse.Content.ReadAsStringAsync());
        var tracks = tracksJson.RootElement.EnumerateArray().ToArray();
        Assert.Equal(4, tracks.Length);
        Assert.Equal(
            new[]
            {
                "Ergonomia e atividade física",
                "Alimentação para uma vida saudável",
                "Comportamento seguro",
                "Demonstração técnica — vídeo e progresso"
            },
            tracks.Select(track => track.GetProperty("title").GetString()));
        Assert.Equal(4, tracks.Select(track => track.GetProperty("id").GetGuid()).Distinct().Count());
        var demoTrack = Assert.Single(
            tracks,
            track => track.GetProperty("title").GetString() == "Demonstração técnica — vídeo e progresso");
        var trackId = demoTrack.GetProperty("id").GetGuid();

        using var experienceResponse = await participantClient.GetAsync($"/api/learning/tracks/{trackId:D}");
        Assert.Equal(HttpStatusCode.OK, experienceResponse.StatusCode);
        using var experienceJson = JsonDocument.Parse(await experienceResponse.Content.ReadAsStringAsync());
        var lesson = Assert.Single(experienceJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal("Vídeo público de demonstração — flores (MDN)", lesson.GetProperty("title").GetString());
        var lessonId = lesson.GetProperty("id").GetGuid();

        token = await GetAntiforgeryTokenAsync(participantClient);
        using var playbackResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            HttpMethod.Post,
            $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/playback",
            new { },
            token);
        Assert.Equal(HttpStatusCode.OK, playbackResponse.StatusCode);
        using var playbackJson = JsonDocument.Parse(await playbackResponse.Content.ReadAsStringAsync());
        Assert.True(playbackJson.RootElement.GetProperty("isDevelopmentDemo").GetBoolean());
        Assert.Equal(
            "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            playbackJson.RootElement.GetProperty("url").GetString());
        Assert.Equal("video/mp4", playbackJson.RootElement.GetProperty("contentType").GetString());
        var sessionId = playbackJson.RootElement.GetProperty("sessionId").GetGuid();

        token = await GetAntiforgeryTokenAsync(participantClient);
        using var rangeResponse = await SendJsonWithAntiforgeryAsync(
            participantClient,
            HttpMethod.Post,
            $"/api/learning/tracks/{trackId:D}/lessons/{lessonId:D}/ranges",
            new
            {
                sessionId,
                startMilliseconds = 0,
                endMilliseconds = 2000,
                positionMilliseconds = 2000
            },
            token);
        Assert.Equal(HttpStatusCode.OK, rangeResponse.StatusCode);
        using var progressJson = JsonDocument.Parse(await rangeResponse.Content.ReadAsStringAsync());
        Assert.Equal(39, progressJson.RootElement.GetProperty("watchedPercentage").GetInt32());

        using var refreshedResponse = await participantClient.GetAsync($"/api/learning/tracks/{trackId:D}");
        Assert.Equal(HttpStatusCode.OK, refreshedResponse.StatusCode);
        using var refreshedJson = JsonDocument.Parse(await refreshedResponse.Content.ReadAsStringAsync());
        var refreshedLesson = Assert.Single(refreshedJson.RootElement.GetProperty("lessons").EnumerateArray());
        Assert.Equal(39, refreshedLesson.GetProperty("watchedPercentage").GetInt32());
        Assert.Equal(2000, refreshedLesson.GetProperty("lastPlaybackPositionMilliseconds").GetInt64());

        using var updatedParticipationResponse = await client.GetAsync("/api/admin/learning/participation");
        Assert.Equal(HttpStatusCode.OK, updatedParticipationResponse.StatusCode);
        using var updatedParticipationJson = JsonDocument.Parse(
            await updatedParticipationResponse.Content.ReadAsStringAsync());
        Assert.Contains(
            updatedParticipationJson.RootElement.EnumerateArray(),
            row =>
                row.GetProperty("trackId").GetGuid() == trackId &&
                row.GetProperty("progressPercentage").GetInt32() == 39);
    }

    private static async Task InitializeDatabaseAsync(SipatOnlineApiFactory factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider
            .GetRequiredService<DatabaseInitializer>()
            .InitializeAsync(CancellationToken.None);
    }

    private static async Task SignInAdminAsync(HttpClient client)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new { loginIdentifier = "admin-root", password = "AdminPassword123" },
            token);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private static async Task SignInParticipantAsync(HttpClient client)
    {
        var token = await GetAntiforgeryTokenAsync(client);
        using var response = await SendJsonWithAntiforgeryAsync(
            client,
            HttpMethod.Post,
            "/api/identity/login",
            new { loginIdentifier = "participant-demo", password = "ParticipantPassword123" },
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
