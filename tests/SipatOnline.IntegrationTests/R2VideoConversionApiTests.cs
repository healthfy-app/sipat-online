using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

/// <summary>The conversion with <c>Provider=R2</c>: the original waits in the bucket, the work folder is only scratch.</summary>
public sealed class R2VideoConversionApiTests : IDisposable
{
    private const string Host = "ops.localhost";
    private const string MissingOriginal = "O arquivo enviado não foi encontrado para a conversão. Envie o vídeo de novo.";

    private readonly string root = Path.Combine(Path.GetTempPath(), $"sipat-r2-conversion-{Guid.NewGuid():N}");

    private string WorkPath => Path.Combine(root, "work");

    public void Dispose()
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [DockerFfmpegFact]
    public async Task Multipart_upload_keeps_the_original_in_the_bucket_not_on_disk()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio);
        using var client = await OperatorClient(factory);
        var bytes = await File.ReadAllBytesAsync(await GenerateVideo("source.mp4", seconds: 2, size: "1920x1080"));

        var videoId = (await Upload(client, bytes)).GetProperty("id").GetGuid();

        Assert.Equal(bytes, await minio.ReadAsync($"uploads/{videoId:N}/source"));
        Assert.False(Directory.Exists(Path.Combine(WorkPath, videoId.ToString("N"))));
        Assert.False(await minio.ExistsAsync($"videos/{videoId:N}/720p.mp4"));

        Assert.True(await ConvertNext(factory));

        var ready = await LibraryVideo(client, videoId);
        Assert.Equal("Ready", ready.GetProperty("status").GetString());
        Assert.True(ready.GetProperty("hasFhd1080").GetBoolean());
        Assert.False(ready.GetProperty("hasSd480").GetBoolean());
        Assert.True(await minio.ExistsAsync($"videos/{videoId:N}/720p.mp4"));
        Assert.True(await minio.ExistsAsync($"videos/{videoId:N}/1080p.mp4"));
        Assert.False(await minio.ExistsAsync($"videos/{videoId:N}/480p.mp4"));
        Assert.False(await minio.ExistsAsync($"uploads/{videoId:N}/source"));
        Assert.Empty(Directory.EnumerateFileSystemEntries(Path.Combine(WorkPath, "jobs")));
        Assert.False(Directory.Exists(Path.Combine(WorkPath, videoId.ToString("N"))));
    }

    [DockerFfmpegFact]
    public async Task Backfill_480p_copies_inside_the_bucket()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio);
        var bytes = await File.ReadAllBytesAsync(await GenerateVideo("old.mp4", seconds: 2));
        var videoId = Guid.NewGuid();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var storage = scope.ServiceProvider.GetRequiredService<IPlatformCourseVideoStorage>();
            Assert.True((await storage.SaveAsync(videoId, new MemoryStream(bytes), "video/mp4", bytes.Length, default)).IsSuccess);
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
        }

        Assert.Empty(Directory.Exists(WorkPath) ? Directory.EnumerateFiles(WorkPath, "*", SearchOption.AllDirectories) : []);
        Assert.True(await minio.ExistsAsync($"uploads/{videoId:N}/source"));

        Assert.True(await ConvertNext(factory));

        Assert.True(await minio.ExistsAsync($"videos/{videoId:N}/480p.mp4"));
        Assert.Equal(bytes, await minio.ReadAsync($"videos/{videoId:N}/720p.mp4"));
        Assert.False(await minio.ExistsAsync($"uploads/{videoId:N}/source"));
    }

    [DockerFfmpegFact]
    public async Task A_missing_original_fails_the_video()
    {
        await using var postgres = await StartPostgres();
        await using var minio = await MinioFixture.StartAsync();
        await using var factory = await StartFactory(postgres.GetConnectionString(), minio);
        using var client = await OperatorClient(factory);
        var videoId = (await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("gone.mp4", seconds: 2))))
            .GetProperty("id").GetGuid();
        await minio.Client.DeleteObjectAsync(MinioFixture.Bucket, $"uploads/{videoId:N}/source");

        Assert.True(await ConvertNext(factory));

        var failed = await LibraryVideo(client, videoId);
        Assert.Equal("Failed", failed.GetProperty("status").GetString());
        Assert.Equal(MissingOriginal, failed.GetProperty("processingError").GetString());
    }

    private async Task<WebApplicationFactory<Program>> StartFactory(string connectionString, MinioFixture minio)
    {
        var factory = new SipatOnlineApiFactory(connectionString).WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in minio.ApiSettings)
            {
                builder.UseSetting(key, value);
            }

            builder.UseSetting("SipatOnline:VideoConversion:Enabled", "true");
            builder.UseSetting("SipatOnline:VideoConversion:WorkPath", WorkPath);
            builder.UseSetting("SipatOnline:VideoConversion:RunInBackground", "false");
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

    private static async Task<HttpClient> OperatorClient(WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{Host}"),
            AllowAutoRedirect = false
        });
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>($"https://{Host}/api/identity/antiforgery");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://{Host}/api/platform/identity/login")
        {
            Content = JsonContent.Create(new LoginRequest("platform-operator", "PlatformPassword123"))
        };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var login = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
        return client;
    }

    private static async Task<JsonElement> Upload(HttpClient client, byte[] bytes)
    {
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>($"https://{Host}/api/identity/antiforgery");
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue("video/mp4");
        content.Add(file, "video", "video.mp4");
        content.Add(new StringContent("Vídeo"), "title");
        content.Add(new StringContent("1234"), "durationMilliseconds");
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://{Host}/api/platform/catalog/videos") { Content = content };
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync());
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.Clone();
    }

    private static async Task<JsonElement> LibraryVideo(HttpClient client, Guid videoId)
    {
        var library = await client.GetFromJsonAsync<JsonElement>($"https://{Host}/api/platform/catalog/videos");
        return library.EnumerateArray()
            .Select(item => item.GetProperty("video"))
            .Single(video => video.GetProperty("id").GetGuid() == videoId);
    }

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
