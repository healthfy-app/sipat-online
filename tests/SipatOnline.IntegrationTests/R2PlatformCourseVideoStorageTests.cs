using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using SipatOnline.Infrastructure.Learning;
using Testcontainers.Minio;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class R2PlatformCourseVideoStorageTests
{
    private const string Bucket = "videos";
    private static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];

    [Fact]
    public void Key_layout_is_stable() =>
        Assert.Equal(
            "videos/0f8fad5bd9cb469fa16570867728950e/720p.mp4",
            R2PlatformCourseVideoStorage.KeyFor(Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e")));

    [DockerFact]
    public async Task Saves_opens_and_deletes_a_video()
    {
        await using var minio = await StartMinio();
        using var s3 = await CreateClient(minio);
        var storage = CreateStorage(s3, minio);
        var id = Guid.NewGuid();

        var saved = await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default);
        Assert.True(saved.IsSuccess);

        await using (var stream = await storage.OpenReadAsync(id, default))
        {
            Assert.NotNull(stream);
            using var copy = new MemoryStream();
            await stream!.CopyToAsync(copy);
            Assert.Equal(Mp4, copy.ToArray());
        }

        await storage.DeleteAsync(id, default);
        Assert.Null(await storage.OpenReadAsync(id, default));
    }

    [DockerFact]
    public async Task Rejects_a_declared_size_that_does_not_match()
    {
        await using var minio = await StartMinio();
        using var s3 = await CreateClient(minio);
        var storage = CreateStorage(s3, minio);
        var id = Guid.NewGuid();

        var result = await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length + 1, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("learning.platform_course.video_content_invalid", result.Error.Code);
        Assert.Null(await storage.OpenReadAsync(id, default));
    }

    [DockerFact]
    public async Task Signs_a_playback_url_that_downloads_the_file()
    {
        await using var minio = await StartMinio();
        using var s3 = await CreateClient(minio);
        var storage = CreateStorage(s3, minio);
        var id = Guid.NewGuid();
        Assert.True((await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default)).IsSuccess);

        var url = await storage.GetPlaybackUrlAsync(id, TimeSpan.FromHours(2), default);

        Assert.NotNull(url);
        Assert.Equal("http", url!.Scheme);
        Assert.Contains("X-Amz-Expires=7200", url.Query);
        using var http = new HttpClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 3);
        using var response = await http.SendAsync(request);
        Assert.Equal(System.Net.HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(Mp4[..4], await response.Content.ReadAsByteArrayAsync());
    }

    private static async Task<MinioContainer> StartMinio()
    {
        var minio = new MinioBuilder("cgr.dev/chainguard/minio:latest").Build();
        await minio.StartAsync();
        return minio;
    }

    private static async Task<AmazonS3Client> CreateClient(MinioContainer minio)
    {
        var client = new AmazonS3Client(
            new BasicAWSCredentials(minio.GetAccessKey(), minio.GetSecretKey()),
            new AmazonS3Config
            {
                ServiceURL = minio.GetConnectionString(),
                ForcePathStyle = true,
                AuthenticationRegion = "auto",
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED
            });
        await client.PutBucketAsync(new PutBucketRequest { BucketName = Bucket });
        return client;
    }

    private static R2PlatformCourseVideoStorage CreateStorage(IAmazonS3 s3, MinioContainer minio) =>
        new(
            s3,
            new R2StorageOptions
            {
                ServiceUrl = minio.GetConnectionString(),
                AccessKeyId = minio.GetAccessKey(),
                SecretAccessKey = minio.GetSecretKey(),
                Bucket = Bucket
            },
            TimeProvider.System);

    // The SDK corrects its clock by a skew it learns from the server; a manual correction reproduces that
    // deterministically (a fractional skew used to turn 2 h into 7201 s). Not parallelized with other users of the global.
    [Theory]
    [InlineData(600)]
    [InlineData(900)]
    [InlineData(-600)]
    [InlineData(-900)]
    [InlineData(2300)]
    public async Task Signed_link_lasts_exactly_the_requested_whole_seconds(int skewMilliseconds)
    {
        var previous = AWSConfigs.ManualClockCorrection;
        AWSConfigs.ManualClockCorrection = TimeSpan.FromMilliseconds(skewMilliseconds);
        try
        {
            using var s3 = new AmazonS3Client(
                new BasicAWSCredentials("key", "secret"),
                new AmazonS3Config { ServiceURL = "https://account.r2.cloudflarestorage.com", ForcePathStyle = true, AuthenticationRegion = "auto" });
            var storage = new R2PlatformCourseVideoStorage(
                s3,
                new R2StorageOptions { ServiceUrl = "https://account.r2.cloudflarestorage.com", Bucket = Bucket },
                TimeProvider.System);

            var url = await storage.GetPlaybackUrlAsync(Guid.NewGuid(), TimeSpan.FromHours(2), default);

            Assert.Contains("X-Amz-Expires=7200&", url!.Query + "&");
        }
        finally
        {
            AWSConfigs.ManualClockCorrection = previous;
        }
    }
}
