using Microsoft.EntityFrameworkCore;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

public enum CatalogVideoCopyStatus
{
    Copied,
    SourceMissing,
    SaveFailed
}

public sealed record CatalogVideoCopyLine(
    Guid VideoId,
    string Title,
    CatalogVideoCopyStatus Status,
    double Mbps,
    bool TooHeavy,
    string? Error = null)
{
    public bool Copied => Status == CatalogVideoCopyStatus.Copied;
}

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
            var status = CatalogVideoCopyStatus.SourceMissing;
            string? error = null;
            try
            {
                await using var stream = await source.OpenReadAsync(video.Id, cancellationToken);
                if (stream is not null)
                {
                    var saved = await target.SaveAsync(
                        video.Id, stream, video.ContentType, video.SizeBytes, cancellationToken);
                    if (saved.IsSuccess)
                    {
                        status = CatalogVideoCopyStatus.Copied;
                    }
                    else
                    {
                        status = CatalogVideoCopyStatus.SaveFailed;
                        error = saved.Error.Message;
                    }
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                status = CatalogVideoCopyStatus.SaveFailed;
                error = exception.Message;
            }

            lines.Add(new CatalogVideoCopyLine(video.Id, video.Title, status, mbps, mbps > HeavyMbps, error));
        }

        return lines;
    }
}
