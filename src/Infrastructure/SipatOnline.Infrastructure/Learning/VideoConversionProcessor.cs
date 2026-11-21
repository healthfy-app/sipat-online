using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>A job this instance has just claimed; <see cref="Attempts"/> already counts this run.</summary>
public sealed record ClaimedConversionJob(Guid JobId, Guid VideoId, int Attempts);

/// <summary>
/// Runs queued conversions: the upload becomes the library 720p and 480p. Several instances may share the queue:
/// a job is claimed by one statement with <c>FOR UPDATE SKIP LOCKED</c>, kept with a renewed lease, and every later
/// write is fenced by <c>LeasedBy</c>. A broken file ends as "Failed" with the reason; it never throws at the worker.
/// </summary>
public sealed class VideoConversionProcessor(
    PlatformDbContext db,
    IPlatformCourseVideoStorage storage,
    FfmpegVideoTranscoder transcoder,
    VideoConversionOptions options,
    VideoConversionInstance instance,
    IServiceScopeFactory scopes,
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

    /// <summary>
    /// Jobs left "Running" by a worker that stopped renewing them (its process died) go back to the queue.
    /// A job whose lease is still live is someone's current work and is left alone. Rows from before leases
    /// existed have none and count as abandoned.
    /// </summary>
    public async Task<int> RequeueInterruptedAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        Expression<Func<VideoConversionJobEntity, bool>> abandoned = job =>
            job.Status == VideoConversionJobEntity.Running && (job.LeaseUntil == null || job.LeaseUntil < now);

        var exhausted = await db.VideoConversionJobs.AsNoTracking()
            .Where(abandoned)
            .Where(job => job.Attempts >= MaximumAttempts)
            .Select(job => new { job.Id, job.VideoId })
            .ToListAsync(cancellationToken);
        foreach (var job in exhausted)
        {
            await FailAsync(job.Id, job.VideoId, "A conversão foi interrompida várias vezes. Envie o vídeo de novo.", abandoned);
        }

        return await db.VideoConversionJobs
            .Where(abandoned)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(job => job.Status, VideoConversionJobEntity.Pending)
                .SetProperty(job => job.StartedAt, (DateTimeOffset?)null)
                .SetProperty(job => job.LeaseUntil, (DateTimeOffset?)null)
                .SetProperty(job => job.LeasedBy, (string?)null), cancellationToken);
    }

    /// <summary>
    /// Takes the oldest pending job for this instance in one statement: two workers never get the same row,
    /// and a row another worker is claiming right now is skipped instead of waited for. Null when nothing is pending.
    /// </summary>
    public async Task<ClaimedConversionJob?> ClaimNextAsync(CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var leaseUntil = now + options.LeaseDuration;
        var rows = await db.Database.SqlQuery<ClaimRow>(
                $"""
                UPDATE learning."VideoConversionJobs" AS job
                SET "Status" = {VideoConversionJobEntity.Running},
                    "Attempts" = job."Attempts" + 1,
                    "StartedAt" = {now},
                    "LeaseUntil" = {leaseUntil},
                    "LeasedBy" = {instance.Id},
                    "FinishedAt" = NULL,
                    "Error" = NULL
                WHERE job."Id" = (
                    SELECT next."Id"
                    FROM learning."VideoConversionJobs" AS next
                    WHERE next."Status" = {VideoConversionJobEntity.Pending}
                    ORDER BY next."CreatedAt", next."Id"
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED)
                RETURNING job."Id" AS "JobId", job."VideoId", job."Attempts"
                """)
            .ToListAsync(cancellationToken);
        return rows.SingleOrDefault() is { } row ? new ClaimedConversionJob(row.JobId, row.VideoId, row.Attempts) : null;
    }

    /// <summary>Claims and converts the oldest pending job. False when the queue is empty.</summary>
    public async Task<bool> ProcessNextAsync(CancellationToken cancellationToken)
    {
        var job = await ClaimNextAsync(cancellationToken);
        if (job is null)
        {
            return false;
        }

        await ProcessClaimedAsync(job, cancellationToken);
        return true;
    }

    /// <summary>Converts a job this instance claimed, renewing its lease meanwhile; stops and writes nothing once the lease is lost.</summary>
    public async Task ProcessClaimedAsync(ClaimedConversionJob job, CancellationToken cancellationToken)
    {
        await using var lease = VideoConversionLease.Start(scopes, job.JobId, instance.Id, options, clock, logger);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, lease.Lost);
        try
        {
            var outcome = await ConvertAsync(job, linked.Token);
            if (outcome.LeaseLost)
            {
                LogLeaseLost(job);
            }
            else if (outcome.Error is { } error)
            {
                logger.LogWarning("Conversion of video {VideoId} failed: {Error}", job.VideoId, error);
                await FailAsync(job.JobId, job.VideoId, error, OwnedBy(job.JobId));
            }
        }
        catch (OperationCanceledException) when (lease.IsLost && !cancellationToken.IsCancellationRequested)
        {
            // Another worker owns the job now: its row, its source and its result are not ours to touch.
            LogLeaseLost(job);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Shutdown, not a failure: the job and the source stay for the next start.
            await RequeueCanceledAsync(job);
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Conversion of video {VideoId} failed", job.VideoId);
            await FailAsync(job.JobId, job.VideoId, $"Falha ao converter o vídeo: {exception.Message}", OwnedBy(job.JobId));
        }
        finally
        {
            DeleteJobFolder(job.JobId);
        }
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

    private async Task<ConversionOutcome> ConvertAsync(ClaimedConversionJob job, CancellationToken cancellationToken)
    {
        var videoId = job.VideoId;
        var status = await db.PlatformCourseVideos.AsNoTracking()
            .Where(video => video.Id == videoId)
            .Select(video => video.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (status is null)
        {
            return ConversionOutcome.Failure("O vídeo foi excluído antes da conversão.");
        }

        var source = EfVideoConversionQueue.SourcePath(options, videoId);
        if (!File.Exists(source))
        {
            return ConversionOutcome.Failure("O arquivo enviado não foi encontrado para a conversão. Envie o vídeo de novo.");
        }

        // A video that is already ready may be playing right now: rewriting its 720p would answer
        // the viewers' range requests from another encoding. It only gains the 480p, made from that 720p.
        var addsSd480Only = status == Ready;
        Directory.CreateDirectory(EfVideoConversionQueue.JobFolder(options, job.JobId));
        var hd = OutputPath(job.JobId, VideoRendition.Hd720);
        var sd = OutputPath(job.JobId, VideoRendition.Sd480);
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
                return ConversionOutcome.Failure($"Não foi possível converter o vídeo: {result.Error}");
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
            var owned = await db.VideoConversionJobs
                .Where(OwnedBy(job.JobId))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(entity => entity.Status, VideoConversionJobEntity.Done)
                    .SetProperty(entity => entity.FinishedAt, clock.GetUtcNow()), cancellationToken);
            if (owned == 0)
            {
                // Taken over: the new owner writes the same renditions and records the result.
                await transaction.RollbackAsync(cancellationToken);
                return ConversionOutcome.Lost;
            }

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
                return ConversionOutcome.Failure("O vídeo foi excluído durante a conversão.");
            }

            await transaction.CommitAsync(cancellationToken);
        }

        DeleteSourceFolder(videoId);
        if (addsSd480Only)
        {
            logger.LogInformation("Video {VideoId} gained its 480p; its 720p was left untouched", videoId);
        }
        else
        {
            logger.LogInformation("Video {VideoId} converted to 720p and 480p", videoId);
        }

        return ConversionOutcome.Converted;
    }

    /// <summary>Fails the job, and a new upload with it, only while <paramref name="guard"/> still holds for the job.</summary>
    private async Task FailAsync(Guid jobId, Guid videoId, string error, Expression<Func<VideoConversionJobEntity, bool>> guard)
    {
        try
        {
            var now = clock.GetUtcNow();
            await using var transaction = await db.Database.BeginTransactionAsync(CancellationToken.None);
            var failed = await db.VideoConversionJobs
                .Where(job => job.Id == jobId)
                .Where(guard)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(job => job.Status, VideoConversionJobEntity.Failed)
                    .SetProperty(job => job.Error, Truncate(error, JobErrorLength))
                    .SetProperty(job => job.FinishedAt, now), CancellationToken.None);
            if (failed == 0)
            {
                // Another worker owns the job now; the video and its source are its business.
                logger.LogWarning("The failed conversion of video {VideoId} was not recorded: the job is no longer this worker's", videoId);
                return;
            }

            // A new upload fails; a video that was already ready (a reconversion) stays online as it was.
            await db.PlatformCourseVideos
                .Where(video => video.Id == videoId && video.Status == Processing)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(video => video.Status, FailedVideo)
                    .SetProperty(video => video.ProcessingError, Truncate(error, VideoErrorLength)), CancellationToken.None);
            await transaction.CommitAsync(CancellationToken.None);
            DeleteSourceFolder(videoId);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Could not record the failed conversion of video {VideoId}", videoId);
        }
    }

    private async Task RequeueCanceledAsync(ClaimedConversionJob claimed)
    {
        try
        {
            // The cut-short run does not count towards the attempts limit.
            await db.VideoConversionJobs
                .Where(OwnedBy(claimed.JobId))
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(job => job.Status, VideoConversionJobEntity.Pending)
                    .SetProperty(job => job.Attempts, job => job.Attempts - 1)
                    .SetProperty(job => job.StartedAt, (DateTimeOffset?)null)
                    .SetProperty(job => job.LeaseUntil, (DateTimeOffset?)null)
                    .SetProperty(job => job.LeasedBy, (string?)null), CancellationToken.None);
        }
        catch (Exception exception)
        {
            // Left as Running: RequeueInterruptedAsync picks it up once its lease expires.
            logger.LogWarning(exception, "Could not return the conversion of video {VideoId} to the queue", claimed.VideoId);
        }
    }

    /// <summary>The job is still "Running" and still this instance's: the fence on every write after the claim.</summary>
    private Expression<Func<VideoConversionJobEntity, bool>> OwnedBy(Guid jobId)
    {
        var me = instance.Id;
        return job => job.Id == jobId && job.Status == VideoConversionJobEntity.Running && job.LeasedBy == me;
    }

    private void LogLeaseLost(ClaimedConversionJob job) =>
        logger.LogWarning(
            "Conversion of video {VideoId} stopped: job {JobId} was taken over by another worker; nothing was recorded",
            job.VideoId,
            job.JobId);

    private string OutputPath(Guid jobId, VideoRendition rendition) =>
        Path.Combine(
            EfVideoConversionQueue.JobFolder(options, jobId),
            rendition == VideoRendition.Sd480 ? "480p.mp4" : "720p.mp4");

    private void DeleteSourceFolder(Guid videoId) =>
        TryDeleteFolder(EfVideoConversionQueue.WorkFolder(options, videoId), "the work folder of video", videoId);

    private void DeleteJobFolder(Guid jobId) =>
        TryDeleteFolder(EfVideoConversionQueue.JobFolder(options, jobId), "the folder of conversion job", jobId);

    private void TryDeleteFolder(string folder, string what, Guid id)
    {
        try
        {
            EfVideoConversionQueue.DeleteFolder(folder);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Could not delete {What} {Id}", what, id);
        }
    }

    private static string Truncate(string text, int length) =>
        text.Length <= length ? text : text[..length];

    private sealed class ClaimRow
    {
        public Guid JobId { get; init; }

        public Guid VideoId { get; init; }

        public int Attempts { get; init; }
    }

    private readonly record struct ConversionOutcome(string? Error, bool LeaseLost)
    {
        public static ConversionOutcome Converted => default;

        public static ConversionOutcome Lost => new(null, LeaseLost: true);

        public static ConversionOutcome Failure(string error) => new(error, LeaseLost: false);
    }
}
