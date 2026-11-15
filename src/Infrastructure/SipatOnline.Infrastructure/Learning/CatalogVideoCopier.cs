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
            var actualSize = video.SizeBytes;
            var status = CatalogVideoCopyStatus.SourceMissing;
            string? error = null;
            try
            {
                await using var stream = await source.OpenReadAsync(video.Id, VideoRendition.Hd720, cancellationToken);
                if (stream is not null)
                {
                    // The file on the volume is the truth: it may have been converted in place
                    // after the upload, so its length can differ from the stored SizeBytes.
                    actualSize = stream.CanSeek ? stream.Length : video.SizeBytes;
                    var saved = await target.SaveAsync(
                        video.Id, stream, video.ContentType, actualSize, cancellationToken);
                    if (saved.IsSuccess)
                    {
                        status = CatalogVideoCopyStatus.Copied;
                        if (actualSize != video.SizeBytes)
                        {
                            await db.PlatformCourseVideos
                                .Where(item => item.Id == video.Id)
                                .ExecuteUpdateAsync(
                                    setters => setters.SetProperty(item => item.SizeBytes, actualSize),
                                    cancellationToken);
                        }
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

            var mbps = video.DurationMilliseconds > 0
                ? actualSize * 8 / (video.DurationMilliseconds / 1000.0) / 1_000_000
                : 0;
            lines.Add(new CatalogVideoCopyLine(video.Id, video.Title, status, mbps, mbps > HeavyMbps, error));
        }

        return lines;
    }
}
