using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Application.Catalog;

namespace SipatOnline.Infrastructure.Learning;

/// <summary>Hands the upload to the <see cref="IVideoSourceStore"/> and queues it in <c>learning."VideoConversionJobs"</c>.</summary>
public sealed class EfVideoConversionQueue(
    PlatformDbContext db,
    VideoConversionOptions options,
    IVideoSourceStore sourceStore,
    TimeProvider clock) : IVideoConversionQueue
{
    public bool IsEnabled => options.Enabled;

    /// <summary>The absolute folder that holds the uploaded source of one video until its conversion succeeds or fails.</summary>
    public static string WorkFolder(VideoConversionOptions options, Guid videoId) =>
        Path.Combine(Path.GetFullPath(options.WorkPath), videoId.ToString("N"));

    /// <summary>The scratch folder of one conversion run (its outputs), <c>WorkPath/jobs/{jobId:N}/</c>; deleted when the run ends.</summary>
    public static string JobFolder(VideoConversionOptions options, Guid jobId) =>
        Path.Combine(Path.GetFullPath(options.WorkPath), "jobs", jobId.ToString("N"));

    /// <summary>With the file storage the source is kept by its own rules, as <c>{videoId:N}.video</c> in the work folder.</summary>
    public static FilePlatformCourseVideoStorage SourceStorage(VideoConversionOptions options, Guid videoId) =>
        new(WorkFolder(options, videoId), isDevelopment: false);

    /// <summary>Where <see cref="SourceStorage"/> keeps the upload (its 720p slot).</summary>
    public static string SourcePath(VideoConversionOptions options, Guid videoId) =>
        Path.Combine(WorkFolder(options, videoId), $"{videoId:N}.video");

    public Task<Result<StoredPlatformVideo>> SaveSourceAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken) =>
        sourceStore.SaveAsync(videoId, content, contentType, declaredSize, cancellationToken);

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

    public Task DiscardSourceAsync(Guid videoId, CancellationToken cancellationToken) =>
        sourceStore.DeleteAsync(videoId, cancellationToken);

    internal static void DeleteFolder(string folder)
    {
        if (Directory.Exists(folder))
        {
            Directory.Delete(folder, recursive: true);
        }
    }
}
