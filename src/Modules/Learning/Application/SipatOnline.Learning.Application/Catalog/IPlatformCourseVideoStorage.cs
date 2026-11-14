using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public interface IPlatformCourseVideoStorage
{
    Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken);

    Task<Stream?> OpenReadAsync(Guid videoId, CancellationToken cancellationToken);

    /// <summary>A time-limited direct URL for the file, or null when the file is served by the API.</summary>
    Task<Uri?> GetPlaybackUrlAsync(Guid videoId, TimeSpan validFor, CancellationToken cancellationToken);

    Task DeleteAsync(Guid videoId, CancellationToken cancellationToken);
}
