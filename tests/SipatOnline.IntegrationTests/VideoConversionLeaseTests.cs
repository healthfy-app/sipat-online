using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class VideoConversionLeaseTests : IDisposable
{
    private const string Host = "ops.localhost";

    private readonly string root = Path.Combine(Path.GetTempPath(), $"sipat-lease-{Guid.NewGuid():N}");

    private string WorkPath => Path.Combine(root, "work");

    private string JobsPath => Path.Combine(WorkPath, "jobs");

    public void Dispose()
    {
        if (Directory.Exists(root))
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [DockerFact]
    public async Task Parallel_claims_never_take_the_same_job()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        await InsertJobs(factory, Enumerable.Range(0, 20).Select(index => PendingJob(DateTimeOffset.UtcNow.AddSeconds(index))));

        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var loops = Enumerable.Range(0, 4).Select(_ => Task.Run(async () =>
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var processor = scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>();
            var claimed = new List<Guid>();
            await start.Task;
            while (await processor.ClaimNextAsync(CancellationToken.None) is { } job)
            {
                claimed.Add(job.JobId);
            }

            return claimed;
        })).ToList();
        start.SetResult();
        var claims = (await Task.WhenAll(loops)).SelectMany(ids => ids).ToList();

        Assert.Equal(20, claims.Count);
        Assert.Equal(20, claims.Distinct().Count());
        var rows = await Jobs(factory);
        Assert.All(rows, row =>
        {
            Assert.Equal(VideoConversionJobEntity.Running, row.Status);
            Assert.Equal(1, row.Attempts);
            Assert.NotNull(row.LeasedBy);
            Assert.NotNull(row.LeaseUntil);
            Assert.NotNull(row.StartedAt);
        });
    }

    [DockerFact]
    public async Task A_running_job_with_a_live_lease_is_not_requeued()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        var job = RunningJob(attempts: 1, leaseUntil: DateTimeOffset.UtcNow.AddMinutes(5));
        await InsertJobs(factory, [job]);

        Assert.Equal(0, await Requeue(factory));

        var row = (await Jobs(factory)).Single();
        Assert.Equal(VideoConversionJobEntity.Running, row.Status);
        Assert.Equal("someone-else", row.LeasedBy);
    }

    [DockerFact]
    public async Task A_job_whose_lease_expired_is_requeued()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        await InsertJobs(factory, [RunningJob(attempts: 1, leaseUntil: DateTimeOffset.UtcNow.AddMinutes(-1))]);

        Assert.Equal(1, await Requeue(factory));

        var row = (await Jobs(factory)).Single();
        Assert.Equal(VideoConversionJobEntity.Pending, row.Status);
        Assert.Null(row.LeasedBy);
        Assert.Null(row.LeaseUntil);
        Assert.Null(row.StartedAt);
        Assert.Equal(1, row.Attempts);
    }

    [DockerFact]
    public async Task An_expired_job_out_of_attempts_fails_its_video()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        var job = RunningJob(attempts: VideoConversionProcessor.MaximumAttempts, leaseUntil: DateTimeOffset.UtcNow.AddMinutes(-1));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
            {
                Id = job.VideoId,
                Title = "Interrompido",
                ContentType = "video/mp4",
                SizeBytes = 10,
                CreatedAt = DateTimeOffset.UtcNow,
                Status = "Processing"
            });
            db.VideoConversionJobs.Add(job);
            await db.SaveChangesAsync();
        }

        Assert.Equal(0, await Requeue(factory));

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal(VideoConversionJobEntity.Failed, (await db.VideoConversionJobs.AsNoTracking().SingleAsync()).Status);
            var video = await db.PlatformCourseVideos.AsNoTracking().SingleAsync(item => item.Id == job.VideoId);
            Assert.Equal("Failed", video.Status);
            Assert.Equal("A conversão foi interrompida várias vezes. Envie o vídeo de novo.", video.ProcessingError);
        }
    }

    [DockerFact]
    public async Task Lease_is_renewed_and_reports_a_takeover()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(
            postgres.GetConnectionString(), leaseDuration: "00:00:02", leaseRenewInterval: "00:00:00.200");
        await InsertJobs(factory, [PendingJob(DateTimeOffset.UtcNow)]);
        ClaimedConversionJob claimed;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            claimed = (await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().ClaimNextAsync(CancellationToken.None))!;
            Assert.NotNull(claimed);
        }

        var instance = factory.Services.GetRequiredService<VideoConversionInstance>();
        await using var lease = VideoConversionLease.Start(
            factory.Services.GetRequiredService<IServiceScopeFactory>(),
            claimed.JobId,
            instance.Id,
            factory.Services.GetRequiredService<VideoConversionOptions>(),
            TimeProvider.System,
            NullLogger.Instance);

        await Task.Delay(TimeSpan.FromSeconds(1));
        var renewed = (await Jobs(factory)).Single();
        Assert.Equal(instance.Id, renewed.LeasedBy);
        Assert.True(renewed.LeaseUntil > DateTimeOffset.UtcNow.AddSeconds(1), $"lease not renewed: {renewed.LeaseUntil:O}");
        Assert.False(lease.IsLost);

        var lost = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var registration = lease.Lost.Register(() => lost.TrySetResult());
        await TakeOver(factory);

        await lost.Task.WaitAsync(TimeSpan.FromSeconds(1));
        Assert.True(lease.IsLost);
    }

    [DockerFfmpegFact]
    public async Task A_processor_that_lost_its_lease_leaves_the_job_alone()
    {
        // The default renewal (30 s) never ticks during a 2 s conversion: the fenced Done write is what refuses.
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        await AssertTakenOverJobIsLeftAlone(factory, seconds: 2);
    }

    [DockerFfmpegFact]
    public async Task A_processor_stops_converting_as_soon_as_its_lease_is_taken()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(
            postgres.GetConnectionString(), leaseDuration: "00:00:05", leaseRenewInterval: "00:00:00.200");
        var watch = Stopwatch.StartNew();
        await AssertTakenOverJobIsLeftAlone(factory, seconds: 90, watch);
        // A 90 s source takes far longer than this to become 720p and 480p: ffmpeg was cancelled.
        Assert.True(watch.Elapsed < TimeSpan.FromSeconds(3), $"took {watch.Elapsed}");
    }

    [DockerFfmpegFact]
    public async Task Converts_in_a_folder_per_job_and_removes_it()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        using var client = await OperatorClient(factory);
        var videoId = await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("job.mp4", seconds: 2)));

        Assert.True(await ConvertNext(factory));

        Assert.True(Directory.Exists(JobsPath), "the conversion did not work in WorkPath/jobs");
        Assert.Empty(Directory.EnumerateFileSystemEntries(JobsPath));
        Assert.False(Directory.Exists(Path.Combine(WorkPath, videoId.ToString("N"))));
        Assert.Equal(VideoConversionJobEntity.Done, (await Jobs(factory)).Single().Status);
    }

    [Fact]
    public void Does_not_start_the_worker_when_RunInBackground_is_false()
    {
        using var factory = new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:VideoConversion:Enabled", "true");
            builder.UseSetting("SipatOnline:VideoConversion:WorkPath", WorkPath);
            builder.UseSetting("SipatOnline:VideoConversion:RunInBackground", "false");
        });

        Assert.DoesNotContain(factory.Services.GetServices<IHostedService>(), service => service is VideoConversionWorker);
    }

    [DockerFact]
    public async Task An_exhausted_job_that_could_not_be_failed_is_not_requeued_for_another_attempt()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(postgres.GetConnectionString());
        var job = RunningJob(attempts: VideoConversionProcessor.MaximumAttempts, leaseUntil: DateTimeOffset.UtcNow.AddMinutes(-1));
        await InsertJobs(factory, [job]);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            // The database refuses to record the failure, so the sweep finds the exhausted job still Running.
            await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().Database.ExecuteSqlRawAsync(
                """
                CREATE FUNCTION learning.refuse_failed_jobs() RETURNS trigger LANGUAGE plpgsql AS '
                BEGIN
                    IF NEW."Status" = ''Failed'' THEN RAISE EXCEPTION ''refused''; END IF;
                    RETURN NEW;
                END';
                CREATE TRIGGER refuse_failed_jobs BEFORE UPDATE ON learning."VideoConversionJobs"
                    FOR EACH ROW EXECUTE FUNCTION learning.refuse_failed_jobs();
                """);
        }

        Assert.Equal(0, await Requeue(factory));

        var row = (await Jobs(factory)).Single();
        Assert.Equal(VideoConversionJobEntity.Running, row.Status);
        Assert.Equal(VideoConversionProcessor.MaximumAttempts, row.Attempts);
        Assert.False(await ConvertNext(factory));
    }

    [DockerFfmpegFact]
    public async Task A_processor_that_lost_its_lease_uploads_no_more_renditions()
    {
        await using var postgres = await StartPostgres();
        await using var factory = await StartFactory(
            postgres.GetConnectionString(), leaseDuration: "00:00:05", leaseRenewInterval: "00:00:00.200");
        using var client = await OperatorClient(factory);
        var videoId = await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo("lost-upload.mp4", seconds: 2)));
        var uploads = new List<VideoRendition>();
        using var decorated = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            var original = services.Single(service => service.ServiceType == typeof(IPlatformCourseVideoStorage));
            services.Remove(original);
            services.AddSingleton<IPlatformCourseVideoStorage>(provider => new TakeOverAfterFirstUpload(
                (IPlatformCourseVideoStorage)original.ImplementationFactory!(provider),
                uploads,
                async () =>
                {
                    await TakeOver(factory);
                    // Several renewals: the processor has noticed by now.
                    await Task.Delay(TimeSpan.FromSeconds(1.5));
                }));
        }));

        await using (var scope = decorated.Services.CreateAsyncScope())
        {
            Assert.True(await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().ProcessNextAsync(CancellationToken.None));
        }

        Assert.Equal(new[] { VideoRendition.Hd720 }, uploads);
        var row = (await Jobs(factory)).Single();
        Assert.Equal(VideoConversionJobEntity.Running, row.Status);
        Assert.Equal("other", row.LeasedBy);
        Assert.Equal(videoId, row.VideoId);
    }

    private sealed class TakeOverAfterFirstUpload(
        IPlatformCourseVideoStorage inner, List<VideoRendition> uploads, Func<Task> afterFirstUpload) : IPlatformCourseVideoStorage
    {
        public Task<Result<StoredPlatformVideo>> SaveAsync(
            Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken) =>
            inner.SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);

        public async Task SaveRenditionAsync(
            Guid videoId, VideoRendition rendition, string filePath, CancellationToken cancellationToken)
        {
            // The token is ignored on purpose: only the processor's own check can stop a later upload.
            await inner.SaveRenditionAsync(videoId, rendition, filePath, CancellationToken.None);
            uploads.Add(rendition);
            if (uploads.Count == 1)
            {
                await afterFirstUpload();
            }
        }

        public Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken) =>
            inner.OpenReadAsync(videoId, rendition, cancellationToken);

        public Task<Uri?> GetPlaybackUrlAsync(
            Guid videoId, VideoRendition rendition, TimeSpan validFor, CancellationToken cancellationToken) =>
            inner.GetPlaybackUrlAsync(videoId, rendition, validFor, cancellationToken);

        public Task DeleteAsync(Guid videoId, CancellationToken cancellationToken) => inner.DeleteAsync(videoId, cancellationToken);
    }

    private async Task AssertTakenOverJobIsLeftAlone(WebApplicationFactory<Program> factory, int seconds, Stopwatch? watch = null)
    {
        using var client = await OperatorClient(factory);
        var videoId = await Upload(client, await File.ReadAllBytesAsync(await GenerateVideo($"taken-{seconds}.mp4", seconds)));
        await using var scope = factory.Services.CreateAsyncScope();
        var processor = scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>();
        var claimed = await processor.ClaimNextAsync(CancellationToken.None);
        Assert.NotNull(claimed);
        Assert.Equal(videoId, claimed!.VideoId);
        await TakeOver(factory);
        watch?.Restart();

        await processor.ProcessClaimedAsync(claimed, CancellationToken.None);
        watch?.Stop();

        var job = (await Jobs(factory)).Single();
        Assert.Equal(VideoConversionJobEntity.Running, job.Status);
        Assert.Equal("other", job.LeasedBy);
        Assert.Null(job.Error);
        await using (var check = factory.Services.CreateAsyncScope())
        {
            var video = await check.ServiceProvider.GetRequiredService<PlatformDbContext>().PlatformCourseVideos.AsNoTracking()
                .SingleAsync(item => item.Id == videoId);
            Assert.Equal("Processing", video.Status);
            Assert.Null(video.ProcessingError);
        }

        // The new owner still needs the original.
        Assert.True(File.Exists(EfVideoConversionQueue.SourcePath(factory.Services.GetRequiredService<VideoConversionOptions>(), videoId)));
        Assert.True(Directory.Exists(JobsPath), "the conversion did not work in WorkPath/jobs");
        Assert.Empty(Directory.EnumerateFileSystemEntries(JobsPath));
    }

    private static VideoConversionJobEntity PendingJob(DateTimeOffset createdAt) => new()
    {
        Id = Guid.NewGuid(),
        VideoId = Guid.NewGuid(),
        Status = VideoConversionJobEntity.Pending,
        CreatedAt = createdAt
    };

    private static VideoConversionJobEntity RunningJob(int attempts, DateTimeOffset leaseUntil) => new()
    {
        Id = Guid.NewGuid(),
        VideoId = Guid.NewGuid(),
        Status = VideoConversionJobEntity.Running,
        Attempts = attempts,
        CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
        StartedAt = DateTimeOffset.UtcNow.AddMinutes(-10),
        LeaseUntil = leaseUntil,
        LeasedBy = "someone-else"
    };

    private static async Task InsertJobs(WebApplicationFactory<Program> factory, IEnumerable<VideoConversionJobEntity> jobs)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        db.VideoConversionJobs.AddRange(jobs);
        await db.SaveChangesAsync();
    }

    private static async Task<List<VideoConversionJobEntity>> Jobs(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs.AsNoTracking().ToListAsync();
    }

    private static async Task TakeOver(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<PlatformDbContext>().VideoConversionJobs
            .ExecuteUpdateAsync(update => update.SetProperty(job => job.LeasedBy, "other"));
    }

    private static async Task<int> Requeue(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().RequeueInterruptedAsync(CancellationToken.None);
    }

    private static async Task<bool> ConvertNext(WebApplicationFactory<Program> factory)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<VideoConversionProcessor>().ProcessNextAsync(CancellationToken.None);
    }

    private async Task<WebApplicationFactory<Program>> StartFactory(
        string connectionString, string? leaseDuration = null, string? leaseRenewInterval = null)
    {
        var factory = new SipatOnlineApiFactory(connectionString).WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:PlatformCatalog:StoragePath", Path.Combine(root, "storage"));
            builder.UseSetting("SipatOnline:VideoConversion:Enabled", "true");
            builder.UseSetting("SipatOnline:VideoConversion:WorkPath", WorkPath);
            builder.UseSetting("SipatOnline:VideoConversion:RunInBackground", "false");
            if (leaseDuration is not null)
            {
                builder.UseSetting("SipatOnline:VideoConversion:LeaseDuration", leaseDuration);
            }

            if (leaseRenewInterval is not null)
            {
                builder.UseSetting("SipatOnline:VideoConversion:LeaseRenewInterval", leaseRenewInterval);
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

    private static async Task<Guid> Upload(HttpClient client, byte[] bytes)
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
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private async Task<string> GenerateVideo(string name, int seconds)
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
                     "-f", "lavfi", "-i", $"testsrc=duration={seconds}:size=1280x720:rate=25",
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
