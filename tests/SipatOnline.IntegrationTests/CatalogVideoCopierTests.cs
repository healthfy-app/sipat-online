using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;
using SipatOnline.Infrastructure;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.Minio;
using Testcontainers.PostgreSql;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class CatalogVideoCopierTests
{
    private const string Bucket = "videos";

    [DockerFact]
    public async Task Copies_every_library_video_and_flags_heavy_ones()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        await using var minio = new MinioBuilder("cgr.dev/chainguard/minio:latest").Build();
        await minio.StartAsync();
        using var s3 = new AmazonS3Client(
            new BasicAWSCredentials(minio.GetAccessKey(), minio.GetSecretKey()),
            new AmazonS3Config
            {
                ServiceURL = minio.GetConnectionString(),
                ForcePathStyle = true,
                AuthenticationRegion = "auto",
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
            });
        await s3.PutBucketAsync(new PutBucketRequest { BucketName = Bucket });
        var target = new R2PlatformCourseVideoStorage(
            s3,
            new R2StorageOptions
            {
                ServiceUrl = minio.GetConnectionString(),
                AccessKeyId = minio.GetAccessKey(),
                SecretAccessKey = minio.GetSecretKey(),
                Bucket = Bucket
            },
            TimeProvider.System);

        var directory = Path.Combine(Path.GetTempPath(), $"sipat-copier-{Guid.NewGuid():N}");
        try
        {
            var source = new FilePlatformCourseVideoStorage(directory, isDevelopment: false);
            var heavyId = Guid.NewGuid();
            var lightId = Guid.NewGuid();
            var missingId = Guid.NewGuid();
            await SaveSource(source, heavyId, 1_000_000);
            await SaveSource(source, lightId, 100_000);

            var options = new DbContextOptionsBuilder<PlatformDbContext>()
                .UseNpgsql(
                    postgres.GetConnectionString(),
                    npgsql => npgsql.MigrationsAssembly(typeof(PlatformDbContext).Assembly.FullName))
                .Options;
            await using var db = new PlatformDbContext(options);
            await db.Database.MigrateAsync();
            db.PlatformCourseVideos.AddRange(
                Video(heavyId, "Pesado", 1_000_000, 1_000),
                Video(lightId, "Leve", 100_000, 10_000),
                Video(missingId, "Sem arquivo", 100_000, 10_000));
            await db.SaveChangesAsync();

            var copier = new CatalogVideoCopier(db, source, target);
            var lines = await copier.CopyAllAsync(CancellationToken.None);

            Assert.Equal(3, lines.Count);
            var heavy = lines.Single(line => line.VideoId == heavyId);
            Assert.True(heavy.Copied);
            Assert.True(heavy.TooHeavy);
            Assert.Equal(8.0, heavy.Mbps, 3);
            var light = lines.Single(line => line.VideoId == lightId);
            Assert.True(light.Copied);
            Assert.False(light.TooHeavy);
            Assert.Equal(0.08, light.Mbps, 3);
            Assert.Equal(CatalogVideoCopyStatus.SourceMissing, lines.Single(line => line.VideoId == missingId).Status);
            await AssertExists(target, heavyId, 1_000_000);
            await AssertExists(target, lightId, 100_000);
            Assert.Null(await target.OpenReadAsync(missingId, default));

            var again = await copier.CopyAllAsync(CancellationToken.None);
            Assert.Equal(2, again.Count(line => line.Copied));
            await AssertExists(target, heavyId, 1_000_000);
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    [DockerFact]
    public async Task Tells_a_failed_upload_from_a_missing_file_and_survives_errors()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();
        await postgres.StartAsync();
        var sourceDir = Path.Combine(Path.GetTempPath(), $"sipat-copier-{Guid.NewGuid():N}");
        var targetDir = Path.Combine(Path.GetTempPath(), $"sipat-copier-{Guid.NewGuid():N}");
        try
        {
            var source = new FilePlatformCourseVideoStorage(sourceDir, isDevelopment: false);
            var okId = Guid.NewGuid();
            var mismatchId = Guid.NewGuid();
            var throwsId = Guid.NewGuid();
            var missingId = Guid.NewGuid();
            await SaveSource(source, okId, 1_000);
            await SaveSource(source, mismatchId, 1_000);
            await SaveSource(source, throwsId, 1_000);

            var options = new DbContextOptionsBuilder<PlatformDbContext>()
                .UseNpgsql(
                    postgres.GetConnectionString(),
                    npgsql => npgsql.MigrationsAssembly(typeof(PlatformDbContext).Assembly.FullName))
                .Options;
            await using var db = new PlatformDbContext(options);
            await db.Database.MigrateAsync();
            db.PlatformCourseVideos.AddRange(
                Video(okId, "Ok", 1_000, 10_000),
                Video(mismatchId, "Tamanho errado", 2_000, 10_000),
                Video(throwsId, "Rede cai", 1_000, 10_000),
                Video(missingId, "Sem arquivo", 1_000, 10_000));
            await db.SaveChangesAsync();

            var target = new ThrowingStorage(new FilePlatformCourseVideoStorage(targetDir, isDevelopment: false), throwsId);
            var lines = await new CatalogVideoCopier(db, source, target).CopyAllAsync(CancellationToken.None);

            Assert.Equal(4, lines.Count);
            Assert.Equal(CatalogVideoCopyStatus.Copied, lines.Single(line => line.VideoId == okId).Status);
            var mismatch = lines.Single(line => line.VideoId == mismatchId);
            Assert.Equal(CatalogVideoCopyStatus.SaveFailed, mismatch.Status);
            Assert.False(string.IsNullOrWhiteSpace(mismatch.Error));
            var threw = lines.Single(line => line.VideoId == throwsId);
            Assert.Equal(CatalogVideoCopyStatus.SaveFailed, threw.Status);
            Assert.Equal("403 simulado", threw.Error);
            Assert.Equal(CatalogVideoCopyStatus.SourceMissing, lines.Single(line => line.VideoId == missingId).Status);
        }
        finally
        {
            foreach (var directory in new[] { sourceDir, targetDir })
            {
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory, recursive: true);
                }
            }
        }
    }

    private sealed class ThrowingStorage(IPlatformCourseVideoStorage inner, Guid failingId) : IPlatformCourseVideoStorage
    {
        public Task<Result<StoredPlatformVideo>> SaveAsync(
            Guid videoId, Stream content, string contentType, long declaredSize, CancellationToken cancellationToken) =>
            videoId == failingId
                ? throw new InvalidOperationException("403 simulado")
                : inner.SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);

        public Task<Stream?> OpenReadAsync(Guid videoId, CancellationToken cancellationToken) =>
            inner.OpenReadAsync(videoId, cancellationToken);

        public Task<Uri?> GetPlaybackUrlAsync(Guid videoId, TimeSpan validFor, CancellationToken cancellationToken) =>
            inner.GetPlaybackUrlAsync(videoId, validFor, cancellationToken);

        public Task DeleteAsync(Guid videoId, CancellationToken cancellationToken) =>
            inner.DeleteAsync(videoId, cancellationToken);
    }

    private static PlatformCourseVideoEntity Video(Guid id, string title, long size, long durationMs) => new()
    {
        Id = id,
        Title = title,
        ContentType = "video/mp4",
        SizeBytes = size,
        DurationMilliseconds = durationMs,
        CreatedAt = DateTimeOffset.UtcNow
    };

    private static async Task SaveSource(FilePlatformCourseVideoStorage source, Guid id, int size)
    {
        var bytes = new byte[size];
        new byte[] { 0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109 }.CopyTo(bytes, 0);
        await using var stream = new MemoryStream(bytes);
        Assert.True((await source.SaveAsync(id, stream, "video/mp4", size, default)).IsSuccess);
    }

    private static async Task AssertExists(R2PlatformCourseVideoStorage target, Guid id, int size)
    {
        await using var stream = await target.OpenReadAsync(id, default);
        Assert.NotNull(stream);
        using var copy = new MemoryStream();
        await stream!.CopyToAsync(copy);
        Assert.Equal(size, copy.Length);
    }
}
