using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public interface IPlatformCourseCatalogStore
{
    Task<IReadOnlyList<PlatformCourse>> ListAsync(CancellationToken cancellationToken);

    Task<PlatformCourse?> FindCourseAsync(Guid courseId, CancellationToken cancellationToken);

    Task<PlatformCourseVideo?> FindVideoAsync(Guid videoId, CancellationToken cancellationToken);

    Task<Result<bool>> AddCourseAsync(PlatformCourse course, CancellationToken cancellationToken);

    Task AddVideoAsync(PlatformCourseVideo video, CancellationToken cancellationToken);
}
