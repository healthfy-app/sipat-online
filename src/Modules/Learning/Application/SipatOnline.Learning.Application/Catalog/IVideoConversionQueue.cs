using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

/// <summary>Background conversion of uploaded videos to the library formats (720p and 480p).</summary>
public interface IVideoConversionQueue
{
    bool IsEnabled { get; }

    /// <summary>Validates the upload like the file storage does and keeps it as the conversion source.</summary>
    Task<Result<StoredPlatformVideo>> SaveSourceAsync(
        Guid videoId,
        Stream content,
        string contentType,
        long declaredSize,
        CancellationToken cancellationToken);

    /// <summary>Writes the queue row; it is committed by the caller's transaction.</summary>
    Task EnqueueAsync(Guid videoId, CancellationToken cancellationToken);

    Task DiscardSourceAsync(Guid videoId, CancellationToken cancellationToken);
}
