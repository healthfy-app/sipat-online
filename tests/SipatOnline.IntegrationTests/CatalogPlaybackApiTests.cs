using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SipatOnline.Api.Endpoints;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Identity;
using SipatOnline.Infrastructure.Learning;
using SipatOnline.BuildingBlocks.Application;
using SipatOnline.Learning.Application.Catalog;
using Testcontainers.Minio;
using Testcontainers.PostgreSql;

namespace SipatOnline.IntegrationTests;

public sealed class CatalogPlaybackApiTests
{
    private static readonly byte[] VideoBytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];
    private static readonly byte[] WebmBytes = [0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    // Different from VideoBytes so a test can tell which rendition was served.
    private static readonly byte[] Sd480Bytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 9, 9, 9, 9, 8, 8, 8, 8];
    private static readonly byte[] Fhd1080Bytes = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 7, 7, 7, 7, 6, 6, 6, 6];

    [DockerFact]
    public async Task Plays_a_catalog_video_outside_the_development_provider()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
            Assert.False(playback.GetProperty("isDevelopmentDemo").GetBoolean());
            Assert.Equal($"/api/learning/lessons/{seed.LessonId}/media", playback.GetProperty("url").GetString());
            var expiresAt = playback.GetProperty("expiresAt").GetDateTimeOffset();
            Assert.InRange(expiresAt, DateTimeOffset.UtcNow.AddHours(2).AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(2).AddMinutes(1));
            using var request = new HttpRequestMessage(HttpMethod.Get, playback.GetProperty("url").GetString());
            request.Headers.Range = new RangeHeaderValue(0, 7);
            using var media = await participant.SendAsync(request);
            Assert.Equal(HttpStatusCode.PartialContent, media.StatusCode);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Offers_both_renditions_when_the_video_has_480p()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory, hasSd480: true);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Equal(2, sources.Length);
            Assert.Equal($"/api/learning/lessons/{seed.LessonId}/media", sources[0].GetProperty("url").GetString());
            Assert.Equal("720p", sources[0].GetProperty("quality").GetString());
            Assert.Equal($"/api/learning/lessons/{seed.LessonId}/media?quality=480p", sources[1].GetProperty("url").GetString());
            Assert.Equal("480p", sources[1].GetProperty("quality").GetString());
            Assert.Equal(sources[0].GetProperty("url").GetString(), playback.GetProperty("url").GetString());
            using var sd = await participant.GetAsync(sources[1].GetProperty("url").GetString());
            Assert.Equal(HttpStatusCode.OK, sd.StatusCode);
            Assert.Equal(Sd480Bytes, await sd.Content.ReadAsByteArrayAsync());
            using var hd = await participant.GetAsync(sources[0].GetProperty("url").GetString());
            Assert.Equal(HttpStatusCode.OK, hd.StatusCode);
            Assert.Equal(VideoBytes, await hd.Content.ReadAsByteArrayAsync());
            using var request = new HttpRequestMessage(HttpMethod.Get, sources[1].GetProperty("url").GetString());
            request.Headers.Range = new RangeHeaderValue(0, 7);
            using var ranged = await participant.SendAsync(request);
            Assert.Equal(HttpStatusCode.PartialContent, ranged.StatusCode);
            Assert.Equal(Sd480Bytes[..8], await ranged.Content.ReadAsByteArrayAsync());
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Offers_1080p_first_then_720p_for_a_new_upload()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory, hasFhd1080: true, webm: true);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Equal(["1080p", "720p"], sources.Select(source => source.GetProperty("quality").GetString()));
            Assert.Equal($"/api/learning/lessons/{seed.LessonId}/media?quality=1080p", sources[0].GetProperty("url").GetString());
            // The session's main url stays the 720p, the file every video has.
            Assert.Equal($"/api/learning/lessons/{seed.LessonId}/media", playback.GetProperty("url").GetString());
            using var fhd = await participant.GetAsync(sources[0].GetProperty("url").GetString());
            Assert.Equal(HttpStatusCode.OK, fhd.StatusCode);
            Assert.Equal("video/mp4", fhd.Content.Headers.ContentType?.MediaType);
            Assert.Equal(Fhd1080Bytes, await fhd.Content.ReadAsByteArrayAsync());
            using var missing = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media?quality=480p");
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Offers_a_single_source_for_older_videos()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Single(sources);
            Assert.Equal(playback.GetProperty("url").GetString(), sources[0].GetProperty("url").GetString());
            Assert.Equal(JsonValueKind.Null, sources[0].GetProperty("quality").ValueKind);
            using var missing = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media?quality=480p");
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_media_of_a_revoked_assignment()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            using (var allowed = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media"))
            {
                Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
            }

            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
                await db.LearningAssignments.ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
            }

            using var refused = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media");
            Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Serves_the_480p_as_mp4_whatever_the_stored_type_of_the_video()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory, hasSd480: true, webm: true);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            using var hd = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media");
            Assert.Equal("video/webm", hd.Content.Headers.ContentType?.MediaType);
            using var sd = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media?quality=480p");
            Assert.Equal("video/mp4", sd.Content.Headers.ContentType?.MediaType);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Signs_each_rendition_with_its_own_key_in_the_r2_storage()
    {
        await using var postgres = await StartPostgres();
        await using var minio = new MinioBuilder(TestImages.Minio).Build();
        await minio.StartAsync();
        using (var s3 = new AmazonS3Client(
            new BasicAWSCredentials(minio.GetAccessKey(), minio.GetSecretKey()),
            new AmazonS3Config
            {
                ServiceURL = minio.GetConnectionString(),
                ForcePathStyle = true,
                AuthenticationRegion = "auto",
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
            }))
        {
            await s3.PutBucketAsync(new PutBucketRequest { BucketName = "videos" });
        }

        await using var factory = CatalogFactory(postgres.GetConnectionString()).WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:VideoStorage:Provider", "R2");
            builder.UseSetting("SipatOnline:VideoStorage:R2:ServiceUrl", minio.GetConnectionString());
            builder.UseSetting("SipatOnline:VideoStorage:R2:AccessKeyId", minio.GetAccessKey());
            builder.UseSetting("SipatOnline:VideoStorage:R2:SecretAccessKey", minio.GetSecretKey());
            builder.UseSetting("SipatOnline:VideoStorage:R2:Bucket", "videos");
        });
        var withBoth = await Seed(factory, hasSd480: true);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{withBoth.TrackId}/lessons/{withBoth.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Equal(["720p", "480p"], sources.Select(source => source.GetProperty("quality").GetString()));

            // With signed links the session carries the storage links themselves, one per rendition.
            var hdUrl = new Uri(sources[0].GetProperty("url").GetString()!);
            var sdUrl = new Uri(sources[1].GetProperty("url").GetString()!);
            Assert.EndsWith($"/videos/{withBoth.VideoId:N}/720p.mp4", hdUrl.AbsolutePath);
            Assert.EndsWith($"/videos/{withBoth.VideoId:N}/480p.mp4", sdUrl.AbsolutePath);
            Assert.Contains("X-Amz-Signature=", hdUrl.Query);
            Assert.Contains("X-Amz-Signature=", sdUrl.Query);
            Assert.Equal(sources[0].GetProperty("url").GetString(), playback.GetProperty("url").GetString());
        }
        finally { await Cleanup(factory, withBoth); }

        var onlyHd = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{onlyHd.TrackId}/lessons/{onlyHd.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Single(sources);
            using var missing = await participant.GetAsync($"/api/learning/lessons/{onlyHd.LessonId}/media?quality=480p");
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        }
        finally { await Cleanup(factory, onlyHd); }

        var full = await Seed(factory, hasFhd1080: true);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{full.TrackId}/lessons/{full.LessonId}/playback", HttpMethod.Post, new { });
            var sources = playback.GetProperty("sources").EnumerateArray().ToArray();
            Assert.Equal(["1080p", "720p"], sources.Select(source => source.GetProperty("quality").GetString()));
            Assert.EndsWith($"/videos/{full.VideoId:N}/1080p.mp4", new Uri(sources[0].GetProperty("url").GetString()!).AbsolutePath);
            Assert.EndsWith($"/videos/{full.VideoId:N}/720p.mp4", new Uri(sources[1].GetProperty("url").GetString()!).AbsolutePath);
        }
        finally { await Cleanup(factory, full); }
    }

    [DockerFact]
    public async Task Accepts_plausible_ranges_and_refuses_impossible_ones()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var sessionId = await StartSession(participant, seed);
            var ranges = $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/ranges";
            await Call(participant, ranges, HttpMethod.Post,
                new { sessionId, startMilliseconds = 0, endMilliseconds = 899, positionMilliseconds = 899 });
            var refused = await Call(participant, ranges, HttpMethod.Post,
                new { sessionId, startMilliseconds = 899, endMilliseconds = 3_600_000, positionMilliseconds = 899 }, HttpStatusCode.BadRequest);
            Assert.Equal("learning.evidence_invalid", refused.GetProperty("code").GetString());
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Refuses_a_session_of_another_participant()
    {
        await using var postgres = await StartPostgres();
        await using var factory = CatalogFactory(postgres.GetConnectionString());
        var seed = await Seed(factory, "second-participant");
        try
        {
            using var first = Client(factory);
            using var second = Client(factory);
            await Login(first, "participant-demo");
            await Login(second, "second-participant");
            var sessionId = await StartSession(first, seed);
            var refused = await Call(second, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/ranges", HttpMethod.Post,
                new { sessionId, startMilliseconds = 0, endMilliseconds = 500, positionMilliseconds = 500 }, HttpStatusCode.BadRequest);
            Assert.Equal("learning.evidence_invalid", refused.GetProperty("code").GetString());
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Keeps_sessions_across_an_api_restart()
    {
        await using var postgres = await StartPostgres();
        var connectionString = postgres.GetConnectionString();
        Guid sessionId;
        Seeded seed;
        var first = CatalogFactory(connectionString);
        try
        {
            seed = await Seed(first);
            using var participant = Client(first);
            await Login(participant, "participant-demo");
            sessionId = await StartSession(participant, seed);
        }
        finally { await first.DisposeAsync(); }

        await using var restarted = CatalogFactory(connectionString);
        try
        {
            await using (var scope = restarted.Services.CreateAsyncScope())
                await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
            using var participant = Client(restarted);
            await Login(participant, "participant-demo");
            await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/ranges", HttpMethod.Post,
                new { sessionId, startMilliseconds = 0, endMilliseconds = 500, positionMilliseconds = 500 });
        }
        finally { await Cleanup(restarted, seed); }
    }

    [DockerFact]
    public async Task Signs_the_storage_link_for_longer_than_the_session()
    {
        await using var postgres = await StartPostgres();
        await using var factory = SignedLinkFactory(postgres.GetConnectionString());
        var seed = await Seed(factory);
        try
        {
            SignedLinkStorage.LastValidFor = null;
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
            Assert.Equal(SignedLinkStorage.Link.ToString(), playback.GetProperty("url").GetString());
            var expiresAt = playback.GetProperty("expiresAt").GetDateTimeOffset();
            Assert.InRange(expiresAt, DateTimeOffset.UtcNow.AddHours(2).AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(2).AddMinutes(1));
            Assert.Equal(TimeSpan.FromHours(2) + TimeSpan.FromMinutes(10), SignedLinkStorage.LastValidFor);
        }
        finally { await Cleanup(factory, seed); }
    }

    [DockerFact]
    public async Task Redirects_both_file_routes_to_the_signed_link_after_the_access_checks()
    {
        await using var postgres = await StartPostgres();
        await using var factory = SignedLinkFactory(postgres.GetConnectionString());
        var seed = await Seed(factory, "second-participant");
        try
        {
            using var participant = Client(factory);
            await Login(participant, "participant-demo");
            using var media = await participant.GetAsync($"/api/learning/lessons/{seed.LessonId}/media");
            Assert.Equal(HttpStatusCode.Redirect, media.StatusCode);
            Assert.Equal(SignedLinkStorage.Link, media.Headers.Location);

            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
                var outsiderId = await db.Users
                    .Where(user => user.EmployeeIdentifier == "second-participant")
                    .Select(user => user.Id).SingleAsync();
                await db.LearningAssignments.Where(item => item.ParticipantId == outsiderId)
                    .ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
            }

            using var outsider = Client(factory);
            await Login(outsider, "second-participant");
            using var refused = await outsider.GetAsync($"/api/learning/lessons/{seed.LessonId}/media");
            Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
            Assert.Null(refused.Headers.Location);

            using var platform = Client(factory, "ops.localhost");
            using var anonymous = await platform.GetAsync($"/api/platform/catalog/videos/{seed.VideoId}/file");
            Assert.NotEqual(HttpStatusCode.Redirect, anonymous.StatusCode);
            Assert.Null(anonymous.Headers.Location);

            await Call(platform, "/api/platform/identity/login", HttpMethod.Post,
                new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
            using var file = await platform.GetAsync($"/api/platform/catalog/videos/{seed.VideoId}/file");
            Assert.Equal(HttpStatusCode.Redirect, file.StatusCode);
            Assert.Equal(SignedLinkStorage.Link, file.Headers.Location);

            using var unknown = await platform.GetAsync($"/api/platform/catalog/videos/{Guid.NewGuid()}/file");
            Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        }
        finally { await Cleanup(factory, seed); }
    }

    [Fact]
    public void Startup_fails_when_an_r2_field_is_missing()
    {
        using var factory = new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("SipatOnline:VideoStorage:Provider", "R2");
            builder.UseSetting("SipatOnline:VideoStorage:R2:ServiceUrl", "https://account.r2.cloudflarestorage.com");
            builder.UseSetting("SipatOnline:VideoStorage:R2:AccessKeyId", "key");
            builder.UseSetting("SipatOnline:VideoStorage:R2:SecretAccessKey", "secret");
        });

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("Configure SipatOnline:VideoStorage:R2:Bucket.", error.ToString());
    }

    [Fact]
    public void Startup_fails_on_an_unknown_storage_provider()
    {
        using var factory = new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
            builder.UseSetting("SipatOnline:VideoStorage:Provider", "Cloudflare"));

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("Configure SipatOnline:VideoStorage:Provider como File ou R2.", error.ToString());
    }

    [Fact]
    public void Startup_fails_when_the_development_playback_provider_runs_outside_development()
    {
        using var factory = new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("SipatOnline:Learning:Playback:Provider", "Development");
        });

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains(
            "SipatOnline:Learning:Playback:Provider=Development só pode ser usado em desenvolvimento.",
            error.ToString());
    }

    [Fact]
    public void Startup_fails_on_an_unknown_playback_provider()
    {
        using var factory = new SipatOnlineApiFactory().WithWebHostBuilder(builder =>
            builder.UseSetting("SipatOnline:Learning:Playback:Provider", "Cloudflare"));

        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("Configure SipatOnline:Learning:Playback:Provider como Development ou Catalog.", error.ToString());
    }

    private static WebApplicationFactory<Program> SignedLinkFactory(string connectionString) =>
        CatalogFactory(connectionString).WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPlatformCourseVideoStorage>();
            services.AddSingleton<IPlatformCourseVideoStorage, SignedLinkStorage>();
        }));

    /// <summary>Pretends to be a storage with signed links; the file itself is never served.</summary>
    private sealed class SignedLinkStorage : IPlatformCourseVideoStorage
    {
        public static readonly Uri Link = new("https://videos.example.test/signed?X-Amz-Signature=abc");
        public static TimeSpan? LastValidFor { get; set; }

        public Task<SipatOnline.BuildingBlocks.Domain.Result<StoredPlatformVideo>> SaveAsync(
            Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken) =>
            Task.FromResult(SipatOnline.BuildingBlocks.Domain.Result<StoredPlatformVideo>.Success(
                new StoredPlatformVideo(contentType, declaredSize)));

        public Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken) =>
            Task.FromResult<Stream?>(new MemoryStream());

        public Task SaveRenditionAsync(
            Guid videoId, VideoRendition rendition, string filePath, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<Uri?> GetPlaybackUrlAsync(
            Guid videoId, VideoRendition rendition, TimeSpan validFor, CancellationToken cancellationToken) =>
            Task.FromResult<Uri?>(RememberLink(validFor));

        private static Uri RememberLink(TimeSpan validFor)
        {
            LastValidFor = validFor;
            return Link;
        }

        public Task DeleteAsync(Guid videoId, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    private sealed record Seeded(Guid VideoId, Guid TrackId, Guid LessonId);

    private static async Task<PostgreSqlContainer> StartPostgres()
    {
        var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        return postgres;
    }

    private static WebApplicationFactory<Program> CatalogFactory(string connectionString) =>
        new SipatOnlineApiFactory(connectionString, developmentSampleEnabled: true)
            .WithWebHostBuilder(builder => builder.UseSetting("SipatOnline:Learning:Playback:Provider", "Catalog"));

    private static async Task<Seeded> Seed(WebApplicationFactory<Program> factory, string? secondParticipant = null, bool hasSd480 = false, bool webm = false, bool hasFhd1080 = false)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseInitializer>().InitializeAsync(CancellationToken.None);
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var sipatId = await db.SipatEvents.Select(item => item.Id).SingleAsync();
        await db.LearningAssignments.ExecuteUpdateAsync(update => update.SetProperty(item => item.RevokedAt, DateTimeOffset.UtcNow));
        if (secondParticipant is not null)
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<PlatformIdentityUser>>();
            var user = new PlatformIdentityUser
            {
                Id = Guid.NewGuid(),
                UserName = $"account-{Guid.NewGuid():N}",
                TenantId = SipatOnlineApiFactory.DefaultTenantId,
                EmployeeIdentifier = secondParticipant,
                NormalizedEmployeeIdentifier = secondParticipant.ToUpperInvariant(),
                DisplayName = secondParticipant,
                IsActive = true,
                CreatedAt = DateTimeOffset.UtcNow
            };
            Assert.True((await users.CreateAsync(user, "ParticipantPassword123")).Succeeded);
            Assert.True((await users.AddToRoleAsync(user, PlatformRoles.Participant)).Succeeded);
        }

        var videoId = Guid.NewGuid();
        var sourceBytes = webm ? WebmBytes : VideoBytes;
        var contentType = webm ? "video/webm" : "video/mp4";
        var storage = scope.ServiceProvider.GetRequiredService<IPlatformCourseVideoStorage>();
        await using var stream = new MemoryStream(sourceBytes);
        Assert.True((await storage.SaveAsync(videoId, stream, contentType, sourceBytes.Length, CancellationToken.None)).IsSuccess);
        if (hasSd480)
        {
            var path = Path.GetTempFileName();
            try
            {
                await File.WriteAllBytesAsync(path, Sd480Bytes);
                await storage.SaveRenditionAsync(videoId, VideoRendition.Sd480, path, CancellationToken.None);
            }
            finally { File.Delete(path); }
        }

        if (hasFhd1080)
        {
            var path = Path.GetTempFileName();
            try
            {
                await File.WriteAllBytesAsync(path, Fhd1080Bytes);
                await storage.SaveRenditionAsync(videoId, VideoRendition.Fhd1080, path, CancellationToken.None);
            }
            finally { File.Delete(path); }
        }

        db.PlatformCourseVideos.Add(new PlatformCourseVideoEntity
        {
            Id = videoId,
            Title = "Vídeo de produção",
            ContentType = contentType,
            SizeBytes = sourceBytes.Length,
            DurationMilliseconds = 1000,
            HasSd480 = hasSd480,
            HasFhd1080 = hasFhd1080,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();

        using var platform = Client(factory, "ops.localhost");
        await Call(platform, "/api/platform/identity/login", HttpMethod.Post,
            new LoginRequest("platform-operator", "PlatformPassword123"), HttpStatusCode.NoContent);
        var course = await Call(platform, "/api/platform/catalog/courses", HttpMethod.Post,
            new { title = "Curso de produção", description = "Curso do teste", gamificationEnabled = false }, HttpStatusCode.Created);
        var courseId = course.GetProperty("id").GetGuid();
        await Call(platform, $"/api/platform/catalog/courses/{courseId}/videos", HttpMethod.Put, new { videoIds = new[] { videoId } });
        await Call(platform, $"/api/platform/catalog/courses/{courseId}", HttpMethod.Put,
            new { title = "Curso de produção", description = "Curso do teste", status = "Published", gamificationEnabled = false });
        var association = await Call(platform,
            $"/api/platform/companies/{SipatOnlineApiFactory.DefaultTenantId:D}/learning/sipats/{sipatId}/courses/{courseId}",
            HttpMethod.Post, new { });
        var trackId = association.GetProperty("trackId").GetGuid();
        using var participant = Client(factory);
        await Login(participant, "participant-demo");
        var experience = await participant.GetFromJsonAsync<JsonElement>($"/api/learning/tracks/{trackId}");
        return new Seeded(videoId, trackId, experience.GetProperty("lessons")[0].GetProperty("id").GetGuid());
    }

    private static async Task Cleanup(WebApplicationFactory<Program> factory, Seeded seed)
    {
        await factory.Services.GetRequiredService<IPlatformCourseVideoStorage>().DeleteAsync(seed.VideoId, CancellationToken.None);
    }

    private static async Task<Guid> StartSession(HttpClient participant, Seeded seed)
    {
        var playback = await Call(participant, $"/api/learning/tracks/{seed.TrackId}/lessons/{seed.LessonId}/playback", HttpMethod.Post, new { });
        return playback.GetProperty("sessionId").GetGuid();
    }

    private static Task Login(HttpClient client, string identifier) =>
        Call(client, "/api/identity/login", HttpMethod.Post,
            new LoginRequest(identifier, "ParticipantPassword123"), HttpStatusCode.NoContent);

    private static HttpClient Client(WebApplicationFactory<Program> factory, string host = "integration-test.localhost") =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false
        });

    private static async Task<JsonElement> Call(HttpClient client, string path, HttpMethod method, object body,
        HttpStatusCode expected = HttpStatusCode.OK)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        var token = await client.GetFromJsonAsync<AntiforgeryTokenResponse>("/api/identity/antiforgery");
        request.Headers.Add("X-CSRF-TOKEN", token!.RequestToken);
        using var response = await client.SendAsync(request);
        Assert.True(response.StatusCode == expected, $"{path}: expected {expected}, received {response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        if (expected == HttpStatusCode.NoContent) return default;
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.Clone();
    }
}
