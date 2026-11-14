using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public sealed record CatalogVideoCopyLine(Guid VideoId, string Title, bool Copied, double Mbps, bool TooHeavy);

/// <summary>Copies every library video from file storage to another storage, reporting its bitrate.</summary>
public sealed class CatalogVideoCopier(
    PlatformDbContext db,
    FilePlatformCourseVideoStorage source,
    IPlatformCourseVideoStorage target)
{
    public const double HeavyMbps = 3.0;

    public async Task<IReadOnlyList<CatalogVideoCopyLine>> CopyAllAsync(CancellationToken cancellationToken)
    {
        var videos = await db.PlatformCourseVideos
            .AsNoTracking()
            .OrderBy(video => video.CreatedAt)
            .ThenBy(video => video.Id)
            .ToListAsync(cancellationToken);

        var lines = new List<CatalogVideoCopyLine>(videos.Count);
        foreach (var video in videos)
        {
            var mbps = video.DurationMilliseconds > 0
                ? video.SizeBytes * 8 / (video.DurationMilliseconds / 1000.0) / 1_000_000
                : 0;
            var copied = false;
            await using var stream = await source.OpenReadAsync(video.Id, cancellationToken);
            if (stream is not null)
            {
                var saved = await target.SaveAsync(
                    video.Id, stream, video.ContentType, video.SizeBytes, cancellationToken);
                copied = saved.IsSuccess;
            }

            lines.Add(new CatalogVideoCopyLine(video.Id, video.Title, copied, mbps, mbps > HeavyMbps));
        }

        return lines;
    }
}
