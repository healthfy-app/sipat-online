using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class VideoConversionApiTests : IDisposable
{
    private const string Host = "ops.localhost";
    private static readonly byte[] TinyMp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];

    private readonly string root = Path.Combine(Path.GetTempPath(), $"sipat-conversion-{Guid.NewGuid():N}");

    private string WorkPath => Path.Combine(root, "work");

    private string StoragePath => Path.Combine(root, "storage");

    public void Dispose()
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [DockerFfmpegFact]
    public async Task Uploads_as_processing_then_converts_a_full_hd_original_to_1080p_and_720p()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var source = await GenerateVideo("source.mp4", seconds: 2, size: "1920x1080");

        var uploaded = await Upload(client, await File.ReadAllBytesAsync(source), "Uso de EPI");
        Assert.Equal("Processing", uploaded.GetProperty("status").GetString());
        Assert.False(uploaded.GetProperty("hasSd480").GetBoolean());
        Assert.False(uploaded.GetProperty("hasFhd1080").GetBoolean());
        var videoId = uploaded.GetProperty("id").GetGuid();
        Assert.Equal("Processing", (await LibraryVideo(client, videoId)).GetProperty("status").GetString());
        Assert.True(Directory.Exists(SourceFolder(videoId)));

        Assert.True(await ConvertNext(factory));

        var ready = await LibraryVideo(client, videoId);
        Assert.Equal("Ready", ready.GetProperty("status").GetString());
        Assert.True(ready.GetProperty("hasFhd1080").GetBoolean());
        // New uploads no longer get a 480p.
        Assert.False(ready.GetProperty("hasSd480").GetBoolean());
        Assert.Equal("video/mp4", ready.GetProperty("contentType").GetString());
        Assert.InRange(ready.GetProperty("durationMilliseconds").GetInt64(), 1850, 2150);
        var storage = factory.Services.GetRequiredService<IPlatformCourseVideoStorage>();
        await using (var fhd = await storage.OpenReadAsync(videoId, VideoRendition.Fhd1080, default))
        {
            Assert.NotNull(fhd);
        }

        await using (var sd = await storage.OpenReadAsync(videoId, VideoRendition.Sd480, default))
        {
            Assert.Null(sd);
        }

        await using (var hd = await storage.OpenReadAsync(videoId, VideoRendition.Hd720, default))
        {
            Assert.NotNull(hd);
            Assert.Equal(hd!.Length, ready.GetProperty("sizeBytes").GetInt64());
        }

        Assert.False(Directory.Exists(SourceFolder(videoId)));
        Assert.False(await ConvertNext(factory));
        await using var scope = factory.Services.CreateAsyncScope();
        var job = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.SingleAsync();
        Assert.Equal("Done", job.Status);
        Assert.Equal(1, job.Attempts);
        Assert.NotNull(job.FinishedAt);
    }

    [DockerFfmpegFact]
    public async Task Refuses_a_processing_video_in_a_day()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var uploaded = await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("day.mp4", seconds: 2)), "Abertura");
        var videoId = uploaded.GetProperty("id").GetGuid();
        var program = new
        {
            title = "SIPAT 2026",
            days = new[]
            {
                new { id = (Guid?)null, title = "Dia 1", date = (string?)null, subject = (string?)null, videoIds = new[] { videoId }, gameIds = Array.Empty<Guid>() }
            }
        };

        using (var refused = await Send(client, HttpMethod.Post, "/api/platform/catalog/programs", program))
        {
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            var problem = await Read(refused);
            Assert.Equal("learning.program.video_processing", problem.GetProperty("code").GetString());
            Assert.Contains("\"Abertura\" ainda está sendo preparado", problem.GetProperty("detail").GetString());
        }

        Assert.True(await ConvertNext(factory));

        using var accepted = await Send(client, HttpMethod.Post, "/api/platform/catalog/programs", program);
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
    }

    [DockerFfmpegFact]
    public async Task Resumes_a_job_left_running_by_a_restart()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var videoId = (await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("restart.mp4", seconds: 2)), "Reinício"))
            .GetProperty("id").GetGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            // The API was killed while ffmpeg was running: the row says Running, nobody is converting.
            await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs
                .ExecuteUpdateAsync(update => update
                    .SetProperty(job => job.Status, "Running")
                    .SetProperty(job => job.Attempts, 1)
                    .SetProperty(job => job.StartedAt, DateTimeOffset.UtcNow));
        }

        Assert.False(await ConvertNext(factory));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>()
                .RequeueInterruptedAsync(CancellationToken.None));
        }

        Assert.True(await ConvertNext(factory));
        var ready = await LibraryVideo(client, videoId);
        Assert.Equal("Ready", ready.GetProperty("status").GetString());
        // A 720-line original gives only the 720p: a 1080p would be the same picture enlarged.
        Assert.False(ready.GetProperty("hasFhd1080").GetBoolean());
        Assert.False(ready.GetProperty("hasSd480").GetBoolean());
        await using var fhd = await factory.Services.GetRequiredService<IPlatformCourseVideoStorage>()
            .OpenReadAsync(videoId, VideoRendition.Fhd1080, default);
        Assert.Null(fhd);
    }

    [DockerFfmpegFact]
    public async Task Requeues_a_conversion_cancelled_by_a_graceful_shutdown()
    {
        await using var postgres = await StartPostgres();
        var connectionString = postgres.GetConnectionString();
        var source = await GenerateVideo("long.mp4", seconds: 40);
        Guid videoId;
        var first = await StartFactory(connectionString, runInBackground: true);
        try
        {
            using var client = await OperatorClient(first);
            videoId = (await Upload(client, await File.ReadAllBytesAsync(source), "Longo")).GetProperty("id").GetGuid();
            var watch = Stopwatch.StartNew();
            while (await JobStatus(first) != "Running")
            {
                Assert.True(watch.Elapsed < TimeSpan.FromSeconds(30), "the worker never started the conversion");
                await Task.Delay(50);
            }
        }
        finally
        {
            // Stops the host the way a deploy does: the worker is cancelled mid-conversion.
            await first.DisposeAsync();
        }

        await using var restarted = await StartFactory(connectionString);
        await using (var scope = restarted.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var job = await db.VideoConversionJobs.AsNoTracking().SingleAsync();
            Assert.Equal("Pending", job.Status);
            Assert.Null(job.Error);
            Assert.Equal(0, job.Attempts);
            var video = await db.PlatformCourseVideos.AsNoTracking().SingleAsync(item => item.Id == videoId);
            Assert.Equal("Processing", video.Status);
            Assert.Null(video.ProcessingError);
        }

        Assert.True(File.Exists(Path.Combine(SourceFolder(videoId), $"{videoId:N}.video")));
        Assert.False(File.Exists(Path.Combine(SourceFolder(videoId), "720p.mp4")));
        await using (var scope = restarted.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().RequeueInterruptedAsync(CancellationToken.None);
        }

        Assert.True(await ConvertNext(restarted));
        using var operatorClient = await OperatorClient(restarted);
        var ready = await LibraryVideo(operatorClient, videoId);
        Assert.Equal("Ready", ready.GetProperty("status").GetString());
        Assert.False(ready.GetProperty("hasSd480").GetBoolean());
        Assert.InRange(ready.GetProperty("durationMilliseconds").GetInt64(), 39_500, 40_500);
    }

    [DockerFfmpegFact]
    public async Task Marks_a_corrupt_upload_as_failed_and_moves_on()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var corrupt = new byte[64 * 1024];
        System.Security.Cryptography.RandomNumberGenerator.Fill(corrupt);
        TinyMp4.AsSpan(0, 12).CopyTo(corrupt);
        var corruptId = (await Upload(client, corrupt, "Corrompido")).GetProperty("id").GetGuid();
        var goodId = (await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("good.mp4", seconds: 2)), "Bom"))
            .GetProperty("id").GetGuid();

        Assert.True(await ConvertNext(factory));
        Assert.True(await ConvertNext(factory));
        Assert.False(await ConvertNext(factory));

        var failed = await LibraryVideo(client, corruptId);
        Assert.Equal("Failed", failed.GetProperty("status").GetString());
        Assert.False(string.IsNullOrWhiteSpace(failed.GetProperty("processingError").GetString()));
        Assert.True(failed.GetProperty("processingError").GetString()!.Length <= 500);
        Assert.Equal("Ready", (await LibraryVideo(client, goodId)).GetProperty("status").GetString());
        Assert.False(Directory.Exists(SourceFolder(corruptId)));
        await using var scope = factory.Services.CreateAsyncScope();
        var jobs = await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.AsNoTracking().ToListAsync();
        var failedJob = jobs.Single(job => job.VideoId == corruptId);
        Assert.Equal("Failed", failedJob.Status);
        Assert.False(string.IsNullOrWhiteSpace(failedJob.Error));
        Assert.Equal("Done", jobs.Single(job => job.VideoId == goodId).Status);
        using var file = await client.GetAsync($"https://{Host}/api/platform/catalog/videos/{corruptId}/file");
        Assert.Equal(HttpStatusCode.Conflict, file.StatusCode);
    }

    [DockerFfmpegFact]
    public async Task Converts_older_videos_without_taking_them_offline()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var bytes = await File.ReadAllBytesAsync(await GenerateVideo("old.mp4", seconds: 2));
        var videoId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var storage = scope.ServiceProvider.GetRequiredService<IPlatformCourseVideoStorage>();
            await using var stream = new MemoryStream(bytes);
            Assert.True((await storage.SaveAsync(videoId, stream, "video/mp4", bytes.Length, default)).IsSuccess);
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
            {
                Id = videoId,
                Title = "Vídeo antigo",
                ContentType = "video/mp4",
                SizeBytes = bytes.Length,
                DurationMilliseconds = 2000,
                CreatedAt = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync();
            Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>()
                .EnqueueMissingSd480Async(CancellationToken.None));
            // Asking again does not queue the same video twice.
            Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>()
                .EnqueueMissingSd480Async(CancellationToken.None));
        }

        var queued = await LibraryVideo(client, videoId);
        Assert.Equal("Ready", queued.GetProperty("status").GetString());
        Assert.False(queued.GetProperty("hasSd480").GetBoolean());
        Assert.True(Directory.Exists(SourceFolder(videoId)));
        Assert.Equal(bytes, await Read720p(factory, videoId));

        Assert.True(await ConvertNext(factory));

        var converted = await LibraryVideo(client, videoId);
        Assert.Equal("Ready", converted.GetProperty("status").GetString());
        Assert.True(converted.GetProperty("hasSd480").GetBoolean());
        // People may be watching: the 720p is not re-encoded, byte for byte the same file, same metadata.
        Assert.Equal(bytes, await Read720p(factory, videoId));
        Assert.Equal(bytes.Length, converted.GetProperty("sizeBytes").GetInt64());
        Assert.Equal("video/mp4", converted.GetProperty("contentType").GetString());
        await using (var sd = await factory.Services.GetRequiredService<IPlatformCourseVideoStorage>()
                         .OpenReadAsync(videoId, VideoRendition.Sd480, default))
        {
            Assert.NotNull(sd);
        }

        Assert.False(Directory.Exists(SourceFolder(videoId)));
    }

    private static async Task<byte[]> Read720p(WebApplicationFactory<Program> factory, Guid videoId)
    {
        await using var stream = await factory.Services.GetRequiredService<IPlatformCourseVideoStorage>()
            .OpenReadAsync(videoId, VideoRendition.Hd720, default);
        Assert.NotNull(stream);
        using var copy = new MemoryStream();
        await stream!.CopyToAsync(copy);
        return copy.ToArray();
    }

    [DockerFact]
    public async Task Keeps_uploading_as_before_when_conversion_is_off()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString(), enabled: false);
        using var client = await OperatorClient(factory);

        var uploaded = await Upload(client, TinyMp4, "Sem conversão");

        Assert.Equal("Ready", uploaded.GetProperty("status").GetString());
        Assert.False(uploaded.GetProperty("hasSd480").GetBoolean());
        Assert.False(Directory.Exists(WorkPath));
        await using var scope = factory.Services.CreateAsyncScope();
        Assert.Equal(0, await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.CountAsync());
    }

    [DockerFact]
    public async Task Previews_a_processing_video_as_conflict()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var videoId = (await Upload(client, TinyMp4, "Processando")).GetProperty("id").GetGuid();

        using var file = await client.GetAsync($"https://{Host}/api/platform/catalog/videos/{videoId}/file");

        Assert.Equal(HttpStatusCode.Conflict, file.StatusCode);
        Assert.Equal("learning.platform_course.video_processing", (await Read(file)).GetProperty("code").GetString());
    }

    [DockerFact]
    public async Task Refuses_adding_a_processing_video_to_a_course_but_keeps_one_uploaded_into_it()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var other = (await Upload(client, TinyMp4, "Convertendo")).GetProperty("id").GetGuid();
        using var created = await Send(client, HttpMethod.Post, "/api/platform/catalog/courses", new { title = "Curso", description = (string?)null });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var courseId = (await Read(created)).GetProperty("id").GetGuid();

        using (var byVideos = await Send(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/videos", new { videoIds = new[] { other } }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, byVideos.StatusCode);
            var problem = await Read(byVideos);
            Assert.Equal("learning.platform_course.video_not_ready", problem.GetProperty("code").GetString());
            Assert.Contains("\"Convertendo\" ainda não está pronto", problem.GetProperty("detail").GetString());
        }

        var structure = new
        {
            lessons = new[] { new { id = (Guid?)null, title = "Aula 1", description = (string?)null, videos = new[] { new { videoId = other, titleOverride = (string?)null } } } }
        };
        using (var byStructure = await Send(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/structure", structure))
        {
            Assert.Equal(HttpStatusCode.BadRequest, byStructure.StatusCode);
            Assert.Equal("learning.platform_course.video_not_ready", (await Read(byStructure)).GetProperty("code").GetString());
        }

        var inside = (await UploadInto(client, courseId, TinyMp4, "Dentro do curso")).GetProperty("id").GetGuid();
        using var kept = await Send(client, HttpMethod.Put, $"/api/platform/catalog/courses/{courseId}/videos", new { videoIds = new[] { inside } });
        Assert.Equal(HttpStatusCode.OK, kept.StatusCode);
    }

    private string SourceFolder(Guid videoId) => Path.Combine(WorkPath, videoId.ToString("N"));

    private async Task<WebApplicationFactory<Program>> StartFactory(
        string connectionString, bool enabled = true, bool runInBackground = false)
    {
        var factory = new SipatOnlineApiFactory(connectionString).WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:PlatformCatalog:StoragePath", StoragePath);
            if (enabled)
            {
                builder.UseSetting("SipatOnline:VideoConversion:Enabled", "true");
                builder.UseSetting("SipatOnline:VideoConversion:WorkPath", WorkPath);
                builder.UseSetting("SipatOnline:VideoConversion:RunInBackground", runInBackground ? "true" : "false");
            }
        });
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        return factory;
    }

    private static async Task<bool> ConvertNext(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().ProcessNextAsync(CancellationToken.None);
    }

    private static async Task<string?> JobStatus(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.AsNoTracking()
            .Select(job => job.Status).SingleOrDefaultAsync();
    }

    private static async Task<HttpClient> OperatorClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{Host}"),
            AllowAutoRedirect = false
        });
        using var login = await Send(client, HttpMethod.Post, "/api/platform/identity/login",
            new LoginRequest("platform-operator", "PlatformPassword123"));
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        return client;
    }

    private static async Task<JsonElement> Upload(HttpClient client, byte[] bytes, string title)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>($"https://{Host}/api/identity/antiforgery");
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        content.Add(file, "video", "video.mp4");
        content.Add(new StringContent(title), "title");
        content.Add(new StringContent("1234"), "durationMilliseconds");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://{Host}/api/platform/catalog/videos") { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await Read(response);
    }

    private static async Task<JsonElement> UploadInto(HttpClient client, Guid courseId, byte[] bytes, string title)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>($"https://{Host}/api/identity/antiforgery");
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        content.Add(file, "video", "video.mp4");
        content.Add(new StringContent(title), "title");
        content.Add(new StringContent("1234"), "durationMilliseconds");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://{Host}/api/platform/catalog/courses/{courseId}/videos") { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return await Read(response);
    }

    private static async Task<JsonElement> LibraryVideo(HttpClient client, Guid videoId)
    {
        var library = await client.GetFromJsonAsync<JsonElement>($"https://{Host}/api/platform/catalog/videos");
        return library.EnumerateArray()
            .Select(item => item.GetProperty("video"))
            .Single(video => video.GetProperty("id").GetGuid() == videoId);
    }

    private static async Task<HttpResponseMessage> Send(HttpClient client, HttpMethod method, string path, object body)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>($"https://{Host}/api/identity/antiforgery");
        using var request = new HttpRequestMessage(method, $"https://{Host}{path}") { Content = JsonContent.Create(body) };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        return await client.SendAsync(request);
    }

    private static async Task<JsonElement> Read(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private async Task<string> GenerateVideo(string name, int seconds, string size = "1280x720")
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, name);
        var info = new ProcessStartInfo("ffmpeg")
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        foreach (var argument in new[]
                 {
                     "-hide_banner", "-nostdin", "-y",
                     "-f", "lavfi", "-i", $"testsrc=duration={seconds}:size={size}:rate=25",
                     "-f", "lavfi", "-i", $"sine=duration={seconds}",
                     "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path
                 })
        {
            info.ArgumentList.Add(argument);
        }

        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        await output;
        Assert.True(process.ExitCode == 0, await error);
        return path;
    }
}
