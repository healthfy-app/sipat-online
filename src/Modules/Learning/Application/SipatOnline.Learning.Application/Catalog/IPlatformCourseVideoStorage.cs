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

    Task DeleteAsync(Guid videoId, CancellationToken cancellationToken);
}
