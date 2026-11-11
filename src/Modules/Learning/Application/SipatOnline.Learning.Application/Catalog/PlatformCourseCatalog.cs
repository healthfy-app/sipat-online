namespace SipatOnline.Learning.Application.Catalog;

public enum PlatformCourseStatus
{
    Draft = 0,
    Published = 1
}

public enum GamificationGameType
{
    Quiz = 0,
    RiskSpotting = 1,
    Puzzle = 2,
    Memory = 3,
    Scenario = 4,
    Ordering = 5
}

public sealed record PlatformCourse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    PlatformCourseStatus Status,
    bool GamificationEnabled,
    IReadOnlyList<PlatformCourseVideo> Videos,
    IReadOnlyList<CourseModulePlacement> Modules,
    GamificationGameType GameType = GamificationGameType.Quiz,
    string? CoverContentType = null,
    DateTimeOffset? CoverUpdatedAt = null);

public sealed record PlatformCourseCover(string ContentType, byte[] Data);

public sealed record PlatformCourseVideo(
    Guid Id,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt,
    IReadOnlyList<VideoCheckpoint> Checkpoints);

public sealed record PlatformLibraryVideo(PlatformCourseVideo Video, int CourseCount);

public sealed record StoredPlatformVideo(string ContentType, long SizeBytes);
