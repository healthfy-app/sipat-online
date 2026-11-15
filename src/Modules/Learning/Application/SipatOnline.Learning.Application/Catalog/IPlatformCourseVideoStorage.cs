using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public interface IPlatformCourseVideoStorage
{
    /// <summary>Validates and stores the uploaded file as the 720p version.</summary>
    Task<Result<StoredPlatformVideo>> SaveAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken);

    /// <summary>Stores an already converted mp4 as the given version, without size checks.</summary>
    Task SaveRenditionAsync(
        Guid videoId,
        VideoRendition rendition,
        string filePath,
        CancellationToken cancellationToken);

    Task<Stream?> OpenReadAsync(Guid videoId, VideoRendition rendition, CancellationToken cancellationToken);

    /// <summary>A time-limited direct URL for the file, or null when the file is served by the API.</summary>
    Task<Uri?> GetPlaybackUrlAsync(
        Guid videoId,
        VideoRendition rendition,
        TimeSpan validFor,
        CancellationToken cancellationToken);

    /// <summary>Deletes every version of the video.</summary>
    Task DeleteAsync(Guid videoId, CancellationToken cancellationToken);
}
