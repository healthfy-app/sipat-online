using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.EntityFrameworkCore;
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
            Assert.False(lines.Single(line => line.VideoId == missingId).Copied);
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
