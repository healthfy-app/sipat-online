using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class PlatformCourseCatalogApiTests
{
    private const string Host = "ops.localhost";

    [DockerFact]
    public async Task PlatformOperator_ManagesCourseLifecycleWithSharedVideoLibrary()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>()
                .InitializeAsync(CancellationToken.None);
        }

        using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        using var login = await SendAsync(
            client,
            HttpMethod.Post,
            "/api/platform/identity/login",
            new LoginRequest("platform-operator", "PlatformPassword123"));
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);

        var firstVideo = await SeedVideoAsync(factory, "Abertura");
        var secondVideo = await SeedVideoAsync(factory, "Encerramento");

        using var createResponse = await SendAsync(
            client,
            HttpMethod.Post,
            "/api/platform/catalog/courses",
            new CreatePlatformCourseRequest("Ergonomia", "Postura", true));
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var course = await ReadAsync(createResponse);
        var courseId = course.GetProperty("id").GetGuid();
        Assert.Equal("Draft", course.GetProperty("status").GetString());
        Assert.True(course.GetProperty("gamificationEnabled").GetBoolean());

        using var emptyPublish = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}",
            new UpdatePlatformCourseRequest("Ergonomia", "Postura", "Published", true));
        Assert.Equal(HttpStatusCode.BadRequest, emptyPublish.StatusCode);

        using var linkResponse = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}/videos",
            new SetPlatformCourseVideosRequest([secondVideo, firstVideo]));
        Assert.Equal(HttpStatusCode.OK, linkResponse.StatusCode);
        var linked = await ReadAsync(linkResponse);
        Assert.Equal(
            ["Encerramento", "Abertura"],
            linked.GetProperty("videos").EnumerateArray().Select(video => video.GetProperty("title").GetString()));

        using var missingVideo = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}/videos",
            new SetPlatformCourseVideosRequest([Guid.NewGuid()]));
        Assert.Equal(HttpStatusCode.NotFound, missingVideo.StatusCode);

        using var publishResponse = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}",
            new UpdatePlatformCourseRequest("Ergonomia 2026", "Postura", "Published", false, "Puzzle"));
        Assert.Equal(HttpStatusCode.OK, publishResponse.StatusCode);
        var published = await ReadAsync(publishResponse);
        Assert.Equal("Published", published.GetProperty("status").GetString());
        Assert.False(published.GetProperty("gamificationEnabled").GetBoolean());
        Assert.Equal("Puzzle", published.GetProperty("gameType").GetString());

        using var emptyQuiz = await SendAsync(
            client,
            HttpMethod.Post,
            "/api/platform/catalog/modules",
            new SaveGameModuleRequest("Quiz vazio", "Quiz", []));
        Assert.Equal(HttpStatusCode.BadRequest, emptyQuiz.StatusCode);

        using var moduleResponse = await SendAsync(
            client,
            HttpMethod.Post,
            "/api/platform/catalog/modules",
            new SaveGameModuleRequest(
                "Quiz de postura",
                "Quiz",
                [new GameQuestionDto("Qual a postura correta?", ["Curvada", "Ereta"], 1)]));
        Assert.Equal(HttpStatusCode.Created, moduleResponse.StatusCode);
        var moduleId = (await ReadAsync(moduleResponse)).GetProperty("id").GetGuid();

        using var placementResponse = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}/modules",
            new SetCourseModulesRequest([new CourseModulePlacementDto(moduleId, 1)]));
        Assert.Equal(HttpStatusCode.OK, placementResponse.StatusCode);
        var placed = (await ReadAsync(placementResponse)).GetProperty("modules");
        Assert.Equal(1, Assert.Single(placed.EnumerateArray()).GetProperty("afterVideoCount").GetInt32());

        using var farPlacement = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/courses/{courseId}/modules",
            new SetCourseModulesRequest([new CourseModulePlacementDto(moduleId, 9)]));
        Assert.Equal(HttpStatusCode.BadRequest, farPlacement.StatusCode);

        using var checkpointResponse = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/videos/{firstVideo}/checkpoints",
            new SetVideoCheckpointsRequest([new VideoCheckpointDto(30_000, moduleId)]));
        Assert.Equal(HttpStatusCode.OK, checkpointResponse.StatusCode);

        using var lateCheckpoint = await SendAsync(
            client,
            HttpMethod.Put,
            $"/api/platform/catalog/videos/{firstVideo}/checkpoints",
            new SetVideoCheckpointsRequest([new VideoCheckpointDto(120_000, moduleId)]));
        Assert.Equal(HttpStatusCode.BadRequest, lateCheckpoint.StatusCode);

        using var modulesList = await client.GetAsync("https://ops.localhost/api/platform/catalog/modules");
        var listed = Assert.Single((await ReadAsync(modulesList)).EnumerateArray());
        Assert.Equal(2, listed.GetProperty("usageCount").GetInt32());
        using var fakeCover = await SendCoverAsync(client, courseId, [1, 2, 3, 4], "image/png");
        Assert.Equal(HttpStatusCode.BadRequest, fakeCover.StatusCode);
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        using var coverResponse = await SendCoverAsync(client, courseId, png, "image/png");
        Assert.Equal(HttpStatusCode.OK, coverResponse.StatusCode);
        Assert.Contains("/cover?v=", (await ReadAsync(coverResponse)).GetProperty("coverUrl").GetString());
        using var coverFile = await client.GetAsync($"https://{Host}/api/platform/catalog/courses/{courseId}/cover");
        Assert.Equal("image/png", coverFile.Content.Headers.ContentType?.MediaType);
        Assert.Equal(png, await coverFile.Content.ReadAsByteArrayAsync());

        using var duplicateResponse = await SendAsync(
            client,
            HttpMethod.Post,
            $"/api/platform/catalog/courses/{courseId}/duplicate",
            (object?)null);
        Assert.Equal(HttpStatusCode.Created, duplicateResponse.StatusCode);
        var copy = await ReadAsync(duplicateResponse);
        Assert.NotEqual(courseId, copy.GetProperty("id").GetGuid());
        Assert.Equal("Ergonomia 2026 (cópia)", copy.GetProperty("title").GetString());
        Assert.Equal("Draft", copy.GetProperty("status").GetString());
        Assert.Equal(2, copy.GetProperty("videos").GetArrayLength());
        Assert.Equal(1, copy.GetProperty("modules").GetArrayLength());
        Assert.NotNull(copy.GetProperty("coverUrl").GetString());
        var copyId = copy.GetProperty("id").GetGuid();
        using var copiedCover = await client.GetAsync($"https://{Host}/api/platform/catalog/courses/{copyId}/cover");
        Assert.Equal(png, await copiedCover.Content.ReadAsByteArrayAsync());

        using var deleteCover = await SendAsync(client, HttpMethod.Delete,
            $"/api/platform/catalog/courses/{courseId}/cover", (object?)null);
        Assert.Equal(HttpStatusCode.OK, deleteCover.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await ReadAsync(deleteCover)).GetProperty("coverUrl").ValueKind);
        using var missingCover = await client.GetAsync($"https://{Host}/api/platform/catalog/courses/{courseId}/cover");
        Assert.Equal(HttpStatusCode.NotFound, missingCover.StatusCode);
        using var remainingCopy = await client.GetAsync($"https://{Host}/api/platform/catalog/courses/{copyId}/cover");
        Assert.Equal(png, await remainingCopy.Content.ReadAsByteArrayAsync());

        using var libraryResponse = await client.GetAsync("https://ops.localhost/api/platform/catalog/videos");
        Assert.Equal(HttpStatusCode.OK, libraryResponse.StatusCode);
        var library = await ReadAsync(libraryResponse);
        Assert.All(
            library.EnumerateArray(),
            item => Assert.Equal(2, item.GetProperty("courseCount").GetInt32()));

        // a video that a theme still uses cannot be deleted; the theme can, and then the video is free
        using var videoInUse = await SendAsync(client, HttpMethod.Delete, $"/api/platform/catalog/videos/{firstVideo}", (object?)null);
        Assert.Equal(HttpStatusCode.Conflict, videoInUse.StatusCode);
        Assert.Contains("em uso", await videoInUse.Content.ReadAsStringAsync());

        using var deleteCopy = await SendAsync(client, HttpMethod.Delete, $"/api/platform/catalog/courses/{copyId}", (object?)null);
        Assert.Equal(HttpStatusCode.NoContent, deleteCopy.StatusCode);
        using var deleteCourse = await SendAsync(client, HttpMethod.Delete, $"/api/platform/catalog/courses/{courseId}", (object?)null);
        Assert.Equal(HttpStatusCode.NoContent, deleteCourse.StatusCode);
        using var courseAgain = await SendAsync(client, HttpMethod.Delete, $"/api/platform/catalog/courses/{courseId}", (object?)null);
        Assert.Equal(HttpStatusCode.NotFound, courseAgain.StatusCode);

        using var freeVideo = await SendAsync(client, HttpMethod.Delete, $"/api/platform/catalog/videos/{firstVideo}", (object?)null);
        Assert.Equal(HttpStatusCode.NoContent, freeVideo.StatusCode);
        using var libraryAfter = await client.GetAsync("https://ops.localhost/api/platform/catalog/videos");
        Assert.Equal(secondVideo, Assert.Single((await ReadAsync(libraryAfter)).EnumerateArray()).GetProperty("video").GetProperty("id").GetGuid());
    }

    [DockerFact]
    public async Task Course_GroupsVideosInLessons_WithCourseOnlyTitlesAndCopies()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var factory = new SipatOnlineApiFactory(postgres.GetConnectionString());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        }

        using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        using var login = await SendAsync(client, HttpMethod.Post, "/api/platform/identity/login",
            new LoginRequest("platform-operator", "PlatformPassword123"));
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        var a = await SeedVideoAsync(factory, "Abertura");
        var b = await SeedVideoAsync(factory, "Postura");
        var c = await SeedVideoAsync(factory, "Encerramento");

        using var created = await SendAsync(client, HttpMethod.Post, "/api/platform/catalog/courses",
            new CreatePlatformCourseRequest("Ergonomia", "Postura", false));
        var courseId = (await ReadAsync(created)).GetProperty("id").GetGuid();

        // vincular vídeos pelo modo antigo cria a "Aula 1" automaticamente
        using var linked = await SendAsync(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/videos",
            new SetPlatformCourseVideosRequest([a, b]));
        var first = await ReadAsync(linked);
        var lessons = first.GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Single(lessons);
        Assert.Equal("Aula 1", lessons[0].GetProperty("title").GetString());
        Assert.Equal(2, lessons[0].GetProperty("videoIds").GetArrayLength());

        // estrutura: duas aulas, um vídeo movido, título só neste curso
        var lessonId = lessons[0].GetProperty("id").GetGuid();
        using var structure = await SendAsync(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/structure",
            new SetPlatformCourseStructureRequest(
            [
                new CourseLessonRequest(lessonId, "Introdução", "Boas-vindas", [new CourseLessonVideoRequest(a, "Boas-vindas à ergonomia")]),
                new CourseLessonRequest(null, "Prática", null, [new CourseLessonVideoRequest(b, null), new CourseLessonVideoRequest(c, null)])
            ]));
        Assert.Equal(HttpStatusCode.OK, structure.StatusCode);
        var saved = await ReadAsync(structure);
        var savedLessons = saved.GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal(["Introdução", "Prática"], savedLessons.Select(item => item.GetProperty("title").GetString()));
        Assert.Equal(lessonId, savedLessons[0].GetProperty("id").GetGuid());
        var videos = saved.GetProperty("videos").EnumerateArray().ToArray();
        Assert.Equal(["Boas-vindas à ergonomia", "Postura", "Encerramento"], videos.Select(item => item.GetProperty("title").GetString()));
        Assert.Equal("Abertura", videos[0].GetProperty("libraryTitle").GetString());
        Assert.Equal(savedLessons[1].GetProperty("id").GetGuid(), videos[1].GetProperty("lessonId").GetGuid());

        // o título da biblioteca continua o original
        using (var library = await client.GetAsync($"https://{Host}/api/platform/catalog/videos"))
        {
            var titles = (await ReadAsync(library)).EnumerateArray().Select(item => item.GetProperty("video").GetProperty("title").GetString()).ToArray();
            Assert.Contains("Abertura", titles);
            Assert.DoesNotContain("Boas-vindas à ergonomia", titles);
        }

        // validações
        foreach (var invalid in new SetPlatformCourseStructureRequest[]
        {
            new([new CourseLessonRequest(null, "  ", null, [])]),
            new([new CourseLessonRequest(null, "A", null, [new CourseLessonVideoRequest(a, null)]), new CourseLessonRequest(null, "B", null, [new CourseLessonVideoRequest(a, null)])]),
        })
        {
            using var rejected = await SendAsync(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/structure", invalid);
            Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        }
        using (var unknownVideo = await SendAsync(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/structure",
            new SetPlatformCourseStructureRequest([new CourseLessonRequest(null, "A", null, [new CourseLessonVideoRequest(Guid.NewGuid(), null)])])))
            Assert.Equal(HttpStatusCode.NotFound, unknownVideo.StatusCode);

        // um vídeo novo vinculado depois cai na última aula, e a cópia leva aulas e títulos
        var d = await SeedVideoAsync(factory, "Extra");
        using var extra = await SendAsync(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/videos",
            new SetPlatformCourseVideosRequest([a, b, c, d]));
        var withExtra = (await ReadAsync(extra)).GetProperty("lessons").EnumerateArray().ToArray();
        Assert.Equal(1, withExtra[0].GetProperty("videoIds").GetArrayLength());
        Assert.Equal(3, withExtra[1].GetProperty("videoIds").GetArrayLength());

        using var copy = await SendAsync<object>(client, HttpMethod.Post, $"/api/platform/catalog/courses/{courseId}/duplicate", null);
        var copied = await ReadAsync(copy);
        Assert.Equal(["Introdução", "Prática"], copied.GetProperty("lessons").EnumerateArray().Select(item => item.GetProperty("title").GetString()));
        Assert.Equal("Boas-vindas à ergonomia", copied.GetProperty("videos")[0].GetProperty("title").GetString());
        Assert.NotEqual(lessonId, copied.GetProperty("lessons")[0].GetProperty("id").GetGuid());
    }

    private static async Task<Guid> SeedVideoAsync(SipatOnlineApiFactory factory, string title)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var video = new PlatformCourseVideoEntity
        {
            Id = Guid.NewGuid(),
            Title = title,
            ContentType = "video/mp4",
            SizeBytes = 1024,
            DurationMilliseconds = 60_000,
            CreatedAt = DateTimeOffset.UtcNow
        };
        dbContext.PlatformCourseVideos.Add(video);
        await dbContext.SaveChangesAsync();
        return video.Id;
    }

    private static async Task<HttpResponseMessage> SendCoverAsync(
        HttpClient client,
        Guid courseId,
        byte[] bytes,
        string contentType)
    {
        using var tokenResponse = await client.GetAsync($"https://{Host}/api/identity/antiforgery");
        var token = await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        content.Add(file, "cover", "capa");
        using var request = new HttpRequestMessage(
            HttpMethod.Put,
            $"https://{Host}/api/platform/catalog/courses/{courseId}/cover")
        { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> ReadAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static async Task<HttpResponseMessage> SendAsync<TRequest>(
        HttpClient client,
        HttpMethod method,
        string path,
        TRequest? body)
    {
        using var tokenResponse = await client.GetAsync($"https://{Host}/api/identity/antiforgery");
        tokenResponse.EnsureSuccessStatusCode();
        var token = await tokenResponse.Content.ReadFromJsonAsync<AntiforgeryTokenResponse>();
        Assert.NotNull(token?.RequestToken);

        using var request = new HttpRequestMessage(method, $"https://{Host}{path}")
        {
            Content = body is null ? null : JsonContent.Create(body)
        };
        request.Headers.Add("X-CSRF-TOKEN", token.RequestToken);
        return await client.SendAsync(request);
    }
}
