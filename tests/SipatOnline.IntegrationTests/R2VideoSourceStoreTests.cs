using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class R2VideoSourceStoreTests : IDisposable
{
    private static readonly byte[] Mp4 = [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0];

    private readonly string jobFolder = Path.Combine(Path.GetTempPath(), $"sipat-source-{Guid.NewGuid():N}");

    public void Dispose()
    {
        if (Directory.Exists(jobFolder))
        {
            Directory.Delete(jobFolder, recursive: true);
        }
    }

    [Fact]
    public void Key_layout_is_stable() =>
        Assert.Equal(
            "uploads/0f8fad5bd9cb469fa16570867728950e/source",
            R2VideoSourceStore.KeyFor(Guid.Parse("0f8fad5b-d9cb-469f-a165-70867728950e")));

    [DockerFact]
    public async Task Saves_downloads_and_deletes_a_source()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = new R2VideoSourceStore(minio.Client, minio.Options);
        var id = Guid.NewGuid();

        var saved = await store.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default);

        Assert.True(saved.IsSuccess);
        Assert.Equal(Mp4.Length, saved.Value.SizeBytes);
        Assert.Equal(Mp4, await minio.ReadAsync(R2VideoSourceStore.KeyFor(id)));
        var local = await store.GetLocalCopyAsync(id, jobFolder, default);
        Assert.NotNull(local);
        Assert.StartsWith(jobFolder, local);
        Assert.Equal(Mp4, await File.ReadAllBytesAsync(local!));

        await store.DeleteAsync(id, default);

        Assert.False(await minio.ExistsAsync(R2VideoSourceStore.KeyFor(id)));
        Assert.Null(await store.GetLocalCopyAsync(id, jobFolder, default));
        // Deleting what is gone is not an error.
        await store.DeleteAsync(id, default);
    }

    [DockerFact]
    public async Task Refuses_a_declared_size_that_does_not_match()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = new R2VideoSourceStore(minio.Client, minio.Options);
        var id = Guid.NewGuid();

        var result = await store.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length + 1, default);

        Assert.False(result.IsSuccess);
        Assert.Equal("learning.platform_course.video_content_invalid", result.Error.Code);
        Assert.False(await minio.ExistsAsync(R2VideoSourceStore.KeyFor(id)));
    }

    [DockerFact]
    public async Task Copies_the_720p_into_the_source_key_inside_the_bucket()
    {
        await using var minio = await MinioFixture.StartAsync();
        var store = new R2VideoSourceStore(minio.Client, minio.Options);
        var storage = new R2PlatformCourseVideoStorage(minio.Client, minio.Options, TimeProvider.System);
        var id = Guid.NewGuid();
        Assert.False(await store.CopyFromRenditionAsync(id, VideoRendition.Hd720, default));
        Assert.True((await storage.SaveAsync(id, new MemoryStream(Mp4), "video/mp4", Mp4.Length, default)).IsSuccess);

        Assert.True(await store.CopyFromRenditionAsync(id, VideoRendition.Hd720, default));

        Assert.Equal(Mp4, await minio.ReadAsync(R2VideoSourceStore.KeyFor(id)));
        // The rendition stays where it was.
        Assert.Equal(Mp4, await minio.ReadAsync(R2PlatformCourseVideoStorage.KeyFor(id, VideoRendition.Hd720)));
    }
}
