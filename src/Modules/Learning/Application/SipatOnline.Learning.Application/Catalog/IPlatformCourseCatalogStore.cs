using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Application.Catalog;

public interface IPlatformCourseCatalogStore
{
    Task<IReadOnlyList<PlatformCourse>> ListAsync(CancellationToken cancellationToken);

    Task<PlatformCourse?> FindCourseAsync(Guid courseId, CancellationToken cancellationToken);

    Task<PlatformCourseVideo?> FindVideoAsync(Guid videoId, CancellationToken cancellationToken);

    Task<Result<bool>> AddCourseAsync(PlatformCourse course, CancellationToken cancellationToken);

    Task<IReadOnlyList<PlatformLibraryVideo>> ListVideosAsync(CancellationToken cancellationToken);

    Task AddVideoAsync(
        PlatformCourseVideo video,
        Guid? courseId,
        CancellationToken cancellationToken);

    Task<bool> UpdateCourseAsync(
        Guid courseId,
        string title,
        string? description,
        PlatformCourseStatus status,
        bool gamificationEnabled,
        GamificationGameType gameType,
        CancellationToken cancellationToken);

    Task DuplicateCourseAsync(
        Guid sourceCourseId,
        PlatformCourse copy,
        CancellationToken cancellationToken);

    Task<bool> SetCoverAsync(
        Guid courseId,
        string contentType,
        byte[] data,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken);

    Task<bool> RemoveCoverAsync(Guid courseId, CancellationToken cancellationToken);

    Task<PlatformCourseCover?> GetCoverAsync(Guid courseId, CancellationToken cancellationToken);

    /// <summary>Replaces lessons and the videos inside them; returns false when a video does not exist.</summary>
    Task<bool> SetCourseStructureAsync(
        Guid courseId,
        IReadOnlyList<CourseLessonDraft> lessons,
        CancellationToken cancellationToken);

    /// <summary>Replaces the ordered video links of a course; returns false when a video does not exist.</summary>
    Task<bool> SetCourseVideosAsync(
        Guid courseId,
        IReadOnlyList<Guid> videoIds,
        CancellationToken cancellationToken);
}
