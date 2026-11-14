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

    /// <summary>Deletes a theme (course) with its links, cover and lessons. Videos stay in the library. False when it does not exist.</summary>
    Task<bool> DeleteCourseAsync(Guid courseId, CancellationToken cancellationToken);

    /// <summary>Where a video is still used, so it is only deleted when nothing depends on it.</summary>
    Task<PlatformVideoUsage> GetVideoUsageAsync(Guid videoId, CancellationToken cancellationToken);

    /// <summary>Deletes a video of the library (and its checkpoints). False when it does not exist.</summary>
    Task<bool> DeleteVideoAsync(Guid videoId, CancellationToken cancellationToken);

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

public sealed record PlatformVideoUsage(int Themes, int Programs, int DeliveredLessons)
{
    public bool IsInUse => Themes > 0 || Programs > 0 || DeliveredLessons > 0;
}
