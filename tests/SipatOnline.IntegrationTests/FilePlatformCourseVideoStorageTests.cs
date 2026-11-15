using SipatOnline.Infrastructure.Learning;
using SipatOnline.Learning.Application.Catalog;
using Xunit;

namespace SipatOnline.IntegrationTests;

public sealed class FilePlatformCourseVideoStorageTests
{
    [Fact]
    public async Task Keeps_both_renditions_apart()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"sipat-file-storage-{Guid.NewGuid():N}");
        try
        {
            var storage = new FilePlatformCourseVideoStorage(directory, isDevelopment: false);
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

            Assert.True(File.Exists(Path.Combine(directory, $"{id:N}.video")));
            Assert.True(File.Exists(Path.Combine(directory, $"{id:N}.480p.video")));
            Assert.Equal(new byte[] { 1, 1, 1, 1, 1 }, await Read(storage, id, VideoRendition.Hd720));
            Assert.Equal(new byte[] { 2, 2, 2 }, await Read(storage, id, VideoRendition.Sd480));
            Assert.Null(await storage.GetPlaybackUrlAsync(id, VideoRendition.Sd480, TimeSpan.FromHours(1), default));

            await storage.DeleteAsync(id, default);
            Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Hd720, default));
            Assert.Null(await storage.OpenReadAsync(id, VideoRendition.Sd480, default));
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, recursive: true);
            }
        }
    }

    private static async Task<byte[]?> Read(FilePlatformCourseVideoStorage storage, Guid id, VideoRendition rendition)
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
}
