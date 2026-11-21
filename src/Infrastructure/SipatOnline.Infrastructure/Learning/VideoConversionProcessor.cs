using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>
/// Runs one queued conversion at a time: the upload becomes the library 720p and 480p.
/// A broken file ends as "Failed" with the reason; it never throws at the worker.
/// </summary>
public sealed class VideoConversionProcessor(
    PlatformDbContext db,
    IPlatformCourseVideoStorage storage,
    FfmpegVideoTranscoder transcoder,
    VideoConversionOptions options,
    TimeProvider clock,
    ILogger<VideoConversionProcessor> logger)
{
    /// <summary>A job cut short this many times (the API keeps dying during it) stops instead of looping.</summary>
    public const int MaximumAttempts = 3;

    private const int VideoErrorLength = 500;
    private const int JobErrorLength = 2000;
    private const string SipatProvider = nameof(VideoProvider.Sipat);
    private const string Ready = nameof(PlatformVideoStatus.Ready);
    private const string Processing = nameof(PlatformVideoStatus.Processing);
    private const string FailedVideo = nameof(PlatformVideoStatus.Failed);

    /// <summary>At startup: jobs left "Running" by a stopped API go back to the queue.</summary>
    public async Task<int> RequeueInterruptedAsync(CancellationToken cancellationToken)
    {
        var exhausted = await db.VideoConversionJobs.AsNoTracking()
            .Where(job => job.Status == VideoConversionJobEntity.Running && job.Attempts >= MaximumAttempts)
            .Select(job => new { job.Id, job.VideoId })
            .ToListAsync(cancellationToken);
        foreach (var job in exhausted)
        {
            await FailAsync(job.Id, job.VideoId, "A conversão foi interrompida várias vezes. Envie o vídeo de novo.");
        }

        return await db.VideoConversionJobs
            .Where(job => job.Status == VideoConversionJobEntity.Running)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(job => job.Status, VideoConversionJobEntity.Pending)
                .SetProperty(job => job.StartedAt, (DateTimeOffset?)null), cancellationToken);
    }

    /// <summary>Converts the oldest pending job. False when the queue is empty.</summary>
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var next = await db.VideoConversionJobs.AsNoTracking()
            .Where(job => job.Status == VideoConversionJobEntity.Pending)
            .OrderBy(job => job.CreatedAt)
            .ThenBy(job => job.Id)
            .Select(job => new { job.Id, job.VideoId })
            .FirstOrDefaultAsync(cancellationToken);
        if (next is null)
        {
            return false;
        }

        var claimed = await db.VideoConversionJobs
            .Where(job => job.Id == next.Id && job.Status == VideoConversionJobEntity.Pending)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(job => job.Status, VideoConversionJobEntity.Running)
                .SetProperty(job => job.Attempts, job => job.Attempts + 1)
                .SetProperty(job => job.StartedAt, clock.GetUtcNow())
                .SetProperty(job => job.FinishedAt, (DateTimeOffset?)null)
                .SetProperty(job => job.Error, (string?)null), cancellationToken);
        if (claimed == 0)
        {
            return true;
        }

        try
        {
            var error = await ConvertAsync(next.Id, next.VideoId, cancellationToken);
            if (error is not null)
            {
                logger.LogWarning("Conversion of video {VideoId} failed: {Error}", next.VideoId, error);
                await FailAsync(next.Id, next.VideoId, error);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Shutdown, not a failure: the job and the source stay for the next start.
            await RequeueCanceledAsync(next.Id, next.VideoId);
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Conversion of video {VideoId} failed", next.VideoId);
            await FailAsync(next.Id, next.VideoId, $"Falha ao converter o vídeo: {exception.Message}");
        }

        return true;
    }

    /// <summary>Queues every ready video that has no 480p yet; it gains only the 480p, made from its current 720p, which is never re-encoded. It stays online meanwhile.</summary>
    public async Task<int> EnqueueMissingSd480Async(CancellationToken cancellationToken)
    {
        var queued = db.VideoConversionJobs
            .Where(job => job.Status == VideoConversionJobEntity.Pending || job.Status == VideoConversionJobEntity.Running)
            .Select(job => job.VideoId);
        var videoIds = await db.PlatformCourseVideos.AsNoTracking()
            .Where(video => video.Provider == SipatProvider && video.Status == Ready && !video.HasSd480 && !queued.Contains(video.Id))
            .OrderBy(video => video.CreatedAt)
            .ThenBy(video => video.Id)
            .Select(video => video.Id)
            .ToListAsync(cancellationToken);

        var count = 0;
        foreach (var videoId in videoIds)
        {
            await using (var current = await storage.OpenReadAsync(videoId, VideoRendition.Hd720, cancellationToken))
            {
                if (current is null)
                {
                    logger.LogWarning("Video {VideoId} has no file in the storage; it was not queued", videoId);
                    continue;
                }

                Directory.CreateDirectory(EfVideoConversionQueue.WorkFolder(options, videoId));
                await using var source = new FileStream(
                    EfVideoConversionQueue.SourcePath(options, videoId),
                    FileMode.Create,
                    FileAccess.Write,
                    FileShare.None,
                    81_920,
                    FileOptions.Asynchronous | FileOptions.SequentialScan);
                await current.CopyToAsync(source, cancellationToken);
            }

            db.VideoConversionJobs.Add(new VideoConversionJobEntity
            {
                Id = Guid.NewGuid(),
                VideoId = videoId,
                Status = VideoConversionJobEntity.Pending,
                CreatedAt = clock.GetUtcNow()
            });
            await db.SaveChangesAsync(cancellationToken);
            count++;
        }

        return count;
    }

    /// <summary>Null when the video is converted; otherwise the reason it could not be.</summary>
    private async Task<string?> ConvertAsync(Guid jobId, Guid videoId, CancellationToken cancellationToken)
    {
        var status = await db.PlatformCourseVideos.AsNoTracking()
            .Where(video => video.Id == videoId)
            .Select(video => video.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (status is null)
        {
            return "O vídeo foi excluído antes da conversão.";
        }

        var source = EfVideoConversionQueue.SourcePath(options, videoId);
        if (!File.Exists(source))
        {
            return "O arquivo enviado não foi encontrado para a conversão. Envie o vídeo de novo.";
        }

        // A video that is already ready may be playing right now: rewriting its 720p would answer
        // the viewers' range requests from another encoding. It only gains the 480p, made from that 720p.
        var addsSd480Only = status == Ready;
        var hd = OutputPath(videoId, VideoRendition.Hd720);
        var sd = OutputPath(videoId, VideoRendition.Sd480);
        var renditions = addsSd480Only
            ? new[] { (VideoRendition.Sd480, sd) }
            : new[] { (VideoRendition.Hd720, hd), (VideoRendition.Sd480, sd) };
        foreach (var (rendition, output) in renditions)
        {
            var result = await transcoder.TranscodeAsync(source, output, rendition, cancellationToken);
            if (result.Canceled)
            {
                throw new OperationCanceledException(cancellationToken);
            }

            if (!result.Succeeded)
            {
                return $"Não foi possível converter o vídeo: {result.Error}";
            }
        }

        long? duration = null;
        long size = 0;
        if (!addsSd480Only)
        {
            duration = await transcoder.ProbeDurationMillisecondsAsync(hd, cancellationToken);
            size = new FileInfo(hd).Length;
            await storage.SaveRenditionAsync(videoId, VideoRendition.Hd720, hd, cancellationToken);
        }

        await storage.SaveRenditionAsync(videoId, VideoRendition.Sd480, sd, cancellationToken);

        await using (var transaction = await db.Database.BeginTransactionAsync(cancellationToken))
        {
            var updated = await db.PlatformCourseVideos
                .Where(video => video.Id == videoId)
                .ExecuteUpdateAsync(setters =>
                {
                    setters.SetProperty(video => video.HasSd480, true);
                    if (addsSd480Only)
                    {
                        // The 720p, its size and its type stay exactly as they were.
                        return;
                    }

                    setters
                        .SetProperty(video => video.Status, Ready)
                        .SetProperty(video => video.ProcessingError, (string?)null)
                        // Both versions are mp4 now (R2 stores them as video/mp4), whatever was uploaded.
                        .SetProperty(video => video.ContentType, "video/mp4")
                        .SetProperty(video => video.SizeBytes, size);
                    if (duration is { } milliseconds)
                    {
                        setters.SetProperty(video => video.DurationMilliseconds, milliseconds);
                    }
                }, cancellationToken);
            if (updated == 0)
            {
                // Deleted while converting: do not leave orphan files behind.
                await transaction.RollbackAsync(cancellationToken);
                await storage.DeleteAsync(videoId, cancellationToken);
                return "O vídeo foi excluído durante a conversão.";
            }

            await db.VideoConversionJobs
                .Where(job => job.Id == jobId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(job => job.Status, VideoConversionJobEntity.Done)
                    .SetProperty(job => job.FinishedAt, clock.GetUtcNow()), cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        }

        DeleteWorkFolder(videoId);
        if (addsSd480Only)
        {
            logger.LogInformation("Video {VideoId} gained its 480p; its 720p was left untouched", videoId);
        }
        else
        {
            logger.LogInformation("Video {VideoId} converted to 720p and 480p", videoId);
        }
        return null;
    }

    private async Task FailAsync(Guid jobId, Guid videoId, string error)
    {
        try
        {
            var now = clock.GetUtcNow();
            await db.VideoConversionJobs
                .Where(job => job.Id == jobId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(job => job.Status, VideoConversionJobEntity.Failed)
                    .SetProperty(job => job.Error, Truncate(error, JobErrorLength))
                    .SetProperty(job => job.FinishedAt, now), CancellationToken.None);
            // A new upload fails; a video that was already ready (a reconversion) stays online as it was.
            await db.PlatformCourseVideos
                .Where(video => video.Id == videoId && video.Status == Processing)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(video => video.Status, FailedVideo)
                    .SetProperty(video => video.ProcessingError, Truncate(error, VideoErrorLength)), CancellationToken.None);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Could not record the failed conversion of video {VideoId}", videoId);
        }
        finally
        {
            DeleteWorkFolder(videoId);
        }
    }

    private async Task RequeueCanceledAsync(Guid jobId, Guid videoId)
    {
        foreach (var rendition in Enum.GetValues<VideoRendition>())
        {
            TryDelete(OutputPath(videoId, rendition));
        }

        try
        {
            // The cut-short run does not count towards the attempts limit.
            await db.VideoConversionJobs
                .Where(job => job.Id == jobId && job.Status == VideoConversionJobEntity.Running)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(job => job.Status, VideoConversionJobEntity.Pending)
                    .SetProperty(job => job.Attempts, job => job.Attempts - 1)
                    .SetProperty(job => job.StartedAt, (DateTimeOffset?)null), CancellationToken.None);
        }
        catch (Exception exception)
        {
            // Left as Running: RequeueInterruptedAsync picks it up at the next start.
            logger.LogWarning(exception, "Could not return the conversion of video {VideoId} to the queue", videoId);
        }
    }

    private string OutputPath(Guid videoId, VideoRendition rendition) =>
        Path.Combine(
            EfVideoConversionQueue.WorkFolder(options, videoId),
            rendition == VideoRendition.Sd480 ? "480p.mp4" : "720p.mp4");

    private void DeleteWorkFolder(Guid videoId)
    {
        try
        {
            EfVideoConversionQueue.DeleteFolder(EfVideoConversionQueue.WorkFolder(options, videoId));
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Could not delete the work folder of video {VideoId}", videoId);
        }
    }

    private void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Could not delete {Path}", path);
        }
    }

    private static string Truncate(string text, int length) =>
        text.Length <= length ? text : text[..length];
}
