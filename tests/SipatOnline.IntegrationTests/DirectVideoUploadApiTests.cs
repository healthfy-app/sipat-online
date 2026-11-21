using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

/// <summary>The operator's browser PUTs the original straight to the bucket; the API issues the URL and registers the object.</summary>
public sealed class DirectVideoUploadApiTests : IDisposable
{
    private const string Host = "ops.localhost";
    private const long MaxSize = PlatformCourseCatalogService.MaximumVideoSizeBytes;

    private static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 9, 9, 9, 9];

    private readonly string root = Path.Combine(Path.GetTempPath(), $"sipat-direct-upload-{Guid.NewGuid():N}");

    public void Dispose()
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [DockerFact]
    public async Task Start_says_multipart_when_the_storage_is_file()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio: null, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);

        using var response = await Start(client, "video/mp4", 1234);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await Read(response);
        Assert.Equal("multipart", body.GetProperty("mode").GetString());
        Assert.Equal(MaxSize, body.GetProperty("maxSizeBytes").GetInt64());
        Assert.False(body.TryGetProperty("uploadUrl", out _));
    }

    [DockerFact]
    public async Task Start_says_multipart_when_direct_upload_is_off()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: false, converts: false);
        using var client = await OperatorClient(factory);

        using var response = await Start(client, "video/mp4", 1234);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await Read(response);
        Assert.Equal("multipart", body.GetProperty("mode").GetString());
        Assert.Equal(MaxSize, body.GetProperty("maxSizeBytes").GetInt64());
    }

    [DockerFact]
    public async Task Start_refuses_a_type_other_than_mp4_or_webm()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);

        using var response = await Start(client, "text/html", 1234);

        await AssertProblem(response, HttpStatusCode.BadRequest, "learning.platform_course.video_type_invalid");
    }

    [DockerFact]
    public async Task Start_refuses_more_than_250_MB()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);

        using var tooBig = await Start(client, "video/mp4", MaxSize + 1);
        using var empty = await Start(client, "video/mp4", 0);

        await AssertProblem(tooBig, HttpStatusCode.BadRequest, "learning.platform_course.video_size_invalid");
        await AssertProblem(empty, HttpStatusCode.BadRequest, "learning.platform_course.video_size_invalid");
    }

    [DockerFact]
    public async Task Direct_upload_then_complete_creates_a_processing_video_and_queues_it()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: true);
        using var client = await OperatorClient(factory);

        var ticket = await StartDirect(client, "video/mp4", Mp4.Length);
        Assert.Equal("PUT", ticket.GetProperty("method").GetString());
        Assert.Equal("video/mp4", ticket.GetProperty("headers").GetProperty("Content-Type").GetString());
        Assert.Equal(MaxSize, ticket.GetProperty("maxSizeBytes").GetInt64());
        Assert.True(ticket.GetProperty("expiresAt").GetDateTimeOffset() > DateTimeOffset.UtcNow.AddMinutes(59));
        var videoId = ticket.GetProperty("videoId").GetGuid();
        await PutOriginal(ticket, Mp4);

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, null);

        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        Assert.Equal($"/api/platform/catalog/videos/{videoId:D}/file", response.Headers.Location!.OriginalString);
        var video = await Read(response);
        Assert.Equal(videoId, video.GetProperty("id").GetGuid());
        Assert.Equal("Uso de EPI", video.GetProperty("title").GetString());
        Assert.Equal("Processing", video.GetProperty("status").GetString());
        Assert.Equal(Mp4.Length, video.GetProperty("sizeBytes").GetInt64());
        Assert.Equal("video/mp4", video.GetProperty("contentType").GetString());
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var job = await db.VideoConversionJobs.AsNoTracking().SingleAsync();
            Assert.Equal(videoId, job.VideoId);
            Assert.Equal(VideoConversionJobEntity.Pending, job.Status);
        }

        Assert.Equal(Mp4, await minio.ReadAsync($"uploads/{videoId:N}/source"));
        Assert.False(await minio.ExistsAsync($"videos/{videoId:N}/720p.mp4"));
    }

    [DockerFact]
    public async Task Direct_upload_then_complete_without_conversion_creates_a_ready_video()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);
        var ticket = await StartDirect(client, "video/mp4", Mp4.Length);
        var videoId = ticket.GetProperty("videoId").GetGuid();
        await PutOriginal(ticket, Mp4);

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, null);

        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        var video = await Read(response);
        Assert.Equal("Ready", video.GetProperty("status").GetString());
        Assert.Equal(Mp4.Length, video.GetProperty("sizeBytes").GetInt64());
        Assert.Equal(Mp4, await minio.ReadAsync($"videos/{videoId:N}/720p.mp4"));
        Assert.False(await minio.ExistsAsync($"uploads/{videoId:N}/source"));
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.ToListAsync());
    }

    [DockerFact]
    public async Task Complete_into_a_course_adds_the_video_to_it()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);
        using var created = await Send(client, "/api/platform/catalog/courses", new { title = "EPI", description = (string?)null });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var courseId = (await Read(created)).GetProperty("id").GetGuid();
        var ticket = await StartDirect(client, "video/mp4", Mp4.Length);
        var videoId = ticket.GetProperty("videoId").GetGuid();
        await PutOriginal(ticket, Mp4);

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, courseId);

        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        var courses = await client.GetFromJsonAsync<JsonElement>($"https://{Host}/api/platform/catalog/courses");
        var course = courses.EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == courseId);
        Assert.Equal([videoId], course.GetProperty("videos").EnumerateArray().Select(item => item.GetProperty("id").GetGuid()));
    }

    [DockerFact]
    public async Task Complete_without_an_uploaded_object_is_not_found()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);
        var videoId = (await StartDirect(client, "video/mp4", Mp4.Length)).GetProperty("videoId").GetGuid();

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, null);

        await AssertProblem(response, HttpStatusCode.NotFound, "learning.platform_course.upload_not_found");
        Assert.Equal(0, await CountVideos(factory));
    }

    [DockerFact]
    public async Task Complete_twice_is_a_conflict()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: true);
        using var client = await OperatorClient(factory);
        var ticket = await StartDirect(client, "video/mp4", Mp4.Length);
        var videoId = ticket.GetProperty("videoId").GetGuid();
        await PutOriginal(ticket, Mp4);
        using var first = await Complete(client, videoId, "Uso de EPI", 90000, null);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);

        using var second = await Complete(client, videoId, "Uso de EPI", 90000, null);

        await AssertProblem(second, HttpStatusCode.Conflict, "learning.platform_course.upload_already_completed");
        Assert.Equal(1, await CountVideos(factory));
        // The registered video keeps its original.
        Assert.True(await minio.ExistsAsync($"uploads/{videoId:N}/source"));
    }

    [DockerFact]
    public async Task Complete_with_a_file_that_is_not_a_video_deletes_it()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var client = await OperatorClient(factory);
        var html = "<html><body>not a video</body></html>"u8.ToArray();
        var ticket = await StartDirect(client, "video/mp4", html.Length);
        var videoId = ticket.GetProperty("videoId").GetGuid();
        await PutOriginal(ticket, html);

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, null);

        await AssertProblem(response, HttpStatusCode.BadRequest, "learning.platform_course.video_content_invalid");
        Assert.False(await minio.ExistsAsync($"uploads/{videoId:N}/source"));
        Assert.Equal(0, await CountVideos(factory));
    }

    [DockerFact]
    public async Task Complete_of_an_object_larger_than_250_MB_deletes_it()
    {
        await using var postgres = await StartPostgres();
        var fake = new FakeDirectVideoUploadStore(new UploadedObject(MaxSize + 1, "video/mp4", Mp4[..12]));
        await using var started = await StartFactory(postgres.GetConnectionString(), minio: null, directUpload: false, converts: false);
        await using var factory = started.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddSingleton<IDirectVideoUploadStore>(fake)));
        using var client = await OperatorClient(factory);
        var videoId = Guid.NewGuid();

        using var response = await Complete(client, videoId, "Uso de EPI", 90000, null);

        await AssertProblem(response, HttpStatusCode.BadRequest, "learning.platform_course.video_size_invalid");
        Assert.Equal([videoId], fake.Deleted);
        Assert.Equal(0, await CountVideos(factory));
    }

    [DockerFact]
    public async Task A_company_admin_cannot_start_an_upload()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio, directUpload: true, converts: false);
        using var admin = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://integration-test.localhost"),
            AllowAutoRedirect = false
        });
        using (var login = await Send(admin, "/api/identity/login", new LoginRequest("admin-root", "AdminPassword123")))
        {
            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        }

        using var start = await Send(admin, "/api/platform/catalog/videos/uploads", new { contentType = "video/mp4", sizeBytes = 1234L });
        using var complete = await Send(
            admin, $"/api/platform/catalog/videos/uploads/{Guid.NewGuid():D}/complete",
            new { title = "Uso de EPI", durationMilliseconds = 90000L, courseId = (Guid?)null });

        Assert.Equal(HttpStatusCode.NotFound, start.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, complete.StatusCode);
    }

    private async Task<WebApplicationFactory<Program>> StartFactory(
        string connectionString, MinioFixture? minio, bool directUpload, bool converts)
    {
        var factory = new SipatOnlineApiFactory(connectionString).WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:PlatformCatalog:StoragePath", Path.Combine(root, "storage"));
            if (minio is not null)
            {
                foreach (var (key, value) in minio.ApiSettings)
                {
                    builder.UseSetting(key, value);
                }
            }

            builder.UseSetting($"{R2StorageOptions.SectionName}:DirectUpload", directUpload ? "true" : "false");
            if (converts)
            {
                builder.UseSetting("SipatOnline:VideoConversion:Enabled", "true");
                builder.UseSetting("SipatOnline:VideoConversion:WorkPath", Path.Combine(root, "work"));
                builder.UseSetting("SipatOnline:VideoConversion:RunInBackground", "false");
            }
        });
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        return factory;
    }

    private static async Task<HttpClient> OperatorClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{Host}"),
            AllowAutoRedirect = false
        });
        using var login = await Send(client, "/api/platform/identity/login", new LoginRequest("platform-operator", "PlatformPassword123"));
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        return client;
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, string path, object body)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        return await client.SendAsync(request);
    }

    private static Task<HttpResponseMessage> Start(HttpClient client, string contentType, long sizeBytes) =>
        Send(client, "/api/platform/catalog/videos/uploads", new { contentType, sizeBytes });

    private static async Task<JsonElement> StartDirect(HttpClient client, string contentType, long sizeBytes)
    {
        using var response = await Start(client, contentType, sizeBytes);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var body = await Read(response);
        Assert.Equal("direct", body.GetProperty("mode").GetString());
        return body;
    }

    private static Task<HttpResponseMessage> Complete(
        HttpClient client, Guid videoId, string title, long durationMilliseconds, Guid? courseId) =>
        Send(client, $"/api/platform/catalog/videos/uploads/{videoId:D}/complete", new { title, durationMilliseconds, courseId });

    private static async Task PutOriginal(JsonElement ticket, byte[] bytes)
    {
        using var put = await R2DirectVideoUploadStoreTests.PutAsync(
            new Uri(ticket.GetProperty("uploadUrl").GetString()!),
            bytes,
            ticket.GetProperty("headers").GetProperty("Content-Type").GetString()!);
        Assert.True(put.IsSuccessStatusCode, await put.Content.ReadAsStringAsync());
    }

    private static async Task<int> CountVideos(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().PlatformCourseVideos.CountAsync();
    }

    private static async Task AssertProblem(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == status, $"{response.StatusCode}: {text}");
        Assert.Equal(code, JsonDocument.Parse(text).RootElement.GetProperty("code").GetString());
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private sealed class FakeDirectVideoUploadStore(UploadedObject uploaded) : IDirectVideoUploadStore
    {
        public List<Guid> Deleted { get; } = [];

        public bool IsEnabled => true;

        public Task<DirectUploadTicket> CreateAsync(Guid videoId, string contentType, TimeSpan validFor, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<UploadedObject?> InspectAsync(Guid videoId, CancellationToken ct) => Task.FromResult<UploadedObject?>(uploaded);

        public Task PromoteAsync(Guid videoId, string contentType, CancellationToken ct) => throw new NotSupportedException();

        public Task DeleteAsync(Guid videoId, CancellationToken ct)
        {
            Deleted.Add(videoId);
            return Task.CompletedTask;
        }
    }
}
