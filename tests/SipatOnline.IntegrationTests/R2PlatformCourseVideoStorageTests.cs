using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class R2PlatformCourseVideoStorageTests
{
    private static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];

    [Fact]
    public void Key_layout_is_stable() =>
        Assert.Equal(
            "videos/0f8fad5bd9cb469fa16570867728950e/720p.mp4",
            R2PlatformCourseVideoStorage.KeyFor(Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e"), VideoRendition.Hd720));

    [DockerFact]
    public async Task Saves_opens_and_deletes_a_video()
    {
        await using var minio = await MinioFixture.StartAsync();
        var storage = CreateStorage(minio);
        var id = Guid.NewGuid();

        var saved = await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default);
        Assert.True(saved.IsSuccess);

        await using (var stream = await storage.OpenReadAsync(id, VideoRendition.Hd720, default))
        {
            Assert.NotNull(stream);
            using var copy = new MemoryStream();
            await stream!.CopyToAsync(copy);
            Assert.Equal(Mp4, copy.ToArray());
        }

        await storage.DeleteAsync(id, default);
        Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Hd720, default));
    }

    [DockerFact]
    public async Task Rejects_a_declared_size_that_does_not_match()
    {
        await using var minio = await MinioFixture.StartAsync();
        var storage = CreateStorage(minio);
        var id = Guid.NewGuid();

        var result = await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length + 1, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("learning.platform_course.video_content_invalid", result.Error.Code);
        Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Hd720, default));
    }

    [DockerFact]
    public async Task Signs_a_playback_url_that_downloads_the_file()
    {
        await using var minio = await MinioFixture.StartAsync();
        var storage = CreateStorage(minio);
        var id = Guid.NewGuid();
        Assert.True((await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default)).IsSuccess);

        var url = await storage.GetPlaybackUrlAsync(id, VideoRendition.Hd720, TimeSpan.FromHours(2), default);

        Assert.NotNull(url);
        Assert.Equal("http", url!.Scheme);
        // The SDK applies its own clock-skew correction, so the lifetime can differ from 2 h by a second.
        var expires = int.Parse(System.Web.HttpUtility.ParseQueryString(url.Query)["X-Amz-Expires"]!);
        Assert.InRange(expires, 7200, 7202);
        using var http = new HttpClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Range = new System.Net.Http.Headers.RangeHeaderValue(0, 3);
        using var response = await http.SendAsync(request);
        Assert.Equal(System.Net.HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(Mp4[..4], await response.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public void Key_layout_is_stable_for_480p() =>
        Assert.Equal(
            "videos/0f8fad5bd9cb469fa16570867728950e/480p.mp4",
            R2PlatformCourseVideoStorage.KeyFor(Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e"), VideoRendition.Sd480));

    [DockerFact]
    public async Task Keeps_both_renditions_apart()
    {
        await using var minio = await MinioFixture.StartAsync();
        var storage = CreateStorage(minio);
        var id = Guid.NewGuid();
        var hd = Path.Combine(Path.GetTempPath(), $"sipat-hd-{Guid.NewGuid():N}.mp4");
        var sd = Path.Combine(Path.GetTempPath(), $"sipat-sd-{Guid.NewGuid():N}.mp4");
        await File.WriteAllBytesAsync(hd, [1, 1, 1, 1, 1]);
        await File.WriteAllBytesAsync(sd, [2, 2, 2]);
        try
        {
            await storage.SaveRenditionAsync(id, VideoRendition.Hd720, hd, default);
            await storage.SaveRenditionAsync(id, VideoRendition.Sd480, sd, default);
        }
        finally
        {
            File.Delete(hd);
            File.Delete(sd);
        }

        Assert.Equal(new byte[] { 1, 1, 1, 1, 1 }, await Read(storage, id, VideoRendition.Hd720));
        Assert.Equal(new byte[] { 2, 2, 2 }, await Read(storage, id, VideoRendition.Sd480));

        await storage.DeleteAsync(id, default);
        Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Hd720, default));
        Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Sd480, default));
    }

    [DockerFact]
    public async Task Signs_a_url_per_rendition()
    {
        await using var minio = await MinioFixture.StartAsync();
        var storage = CreateStorage(minio);

        var url = await storage.GetPlaybackUrlAsync(Guid.NewGuid(), VideoRendition.Sd480, TimeSpan.FromHours(2), default);

        Assert.NotNull(url);
        Assert.EndsWith("/480p.mp4", url!.AbsolutePath);
    }

    private static async Task<byte[]?> Read(R2PlatformCourseVideoStorage storage, Guid id, VideoRendition rendition)
    {
        await using var stream = await storage.OpenReadAsync(id, rendition, default);
        if (stream is null)
        {
            return null;
        }

        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy);
        return copy.ToArray();
    }

    private static R2PlatformCourseVideoStorage CreateStorage(MinioFixture minio) =>
        new(minio.Client, minio.Options, TimeProvider.System);
}
