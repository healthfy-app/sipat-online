using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Keeps the upload in <c>WorkPath/{videoId:N}/</c> and queues it in <c>learning."VideoConversionJobs"</c>.</summary>
public sealed class EfVideoConversionQueue(
    PlatformDbContext db,
    VideoConversionOptions options,
    TimeProvider clock) : IVideoConversionQueue
{
    public bool IsEnabled => options.Enabled;

    /// <summary>The absolute folder that holds the source and the converted files of one video.</summary>
    public static string WorkFolder(VideoConversionOptions options, Guid videoId) =>
        Path.Combine(Path.GetFullPath(options.WorkPath), videoId.ToString("N"));

    /// <summary>The source is stored with the file storage's own rules, as <c>{videoId:N}.video</c> in the work folder.</summary>
    public static FilePlatformCourseVideoStorage SourceStorage(VideoConversionOptions options, Guid videoId) =>
        new(WorkFolder(options, videoId), isDevelopment: false);

    /// <summary>Where <see cref="SourceStorage"/> keeps the upload (its 720p slot).</summary>
    public static string SourcePath(VideoConversionOptions options, Guid videoId) =>
        Path.Combine(WorkFolder(options, videoId), $"{videoId:N}.video");

    public async Task<Result<StoredPlatformVideo>> SaveSourceAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(options.WorkPath))
        {
            return Result<StoredPlatformVideo>.Failure(new DomainError(
                "learning.platform_course.storage_unconfigured",
                "A pasta de conversão de vídeos não está configurada neste ambiente."));
        }

        var saved = false;
        try
        {
            var result = await SourceStorage(options, videoId)
                .SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);
            saved = result.IsSuccess;
            return result;
        }
        finally
        {
            if (!saved)
            {
                DeleteFolder(WorkFolder(options, videoId));
            }
        }
    }

    public async Task EnqueueAsync(Guid videoId, CancellationToken cancellationToken)
    {
        db.VideoConversionJobs.Add(new VideoConversionJobEntity
        {
            Id = Guid.NewGuid(),
            VideoId = videoId,
            Status = VideoConversionJobEntity.Pending,
            CreatedAt = clock.GetUtcNow()
        });
        await db.SaveChangesAsync(cancellationToken);
    }

    public Task DiscardSourceAsync(Guid videoId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(options.WorkPath))
        {
            DeleteFolder(WorkFolder(options, videoId));
        }

        return Task.CompletedTask;
    }

    internal static void DeleteFolder(string folder)
    {
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
        }
    }
}
