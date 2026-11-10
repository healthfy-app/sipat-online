namespace SipatOnline.Learning.Application.Catalog;

public enum PlatformCourseStatus
{
    Draft = 0,
    Published = 1
}

public sealed record PlatformCourse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    PlatformCourseStatus Status,
    bool GamificationEnabled,
    IReadOnlyList<PlatformCourseVideo> Videos);

public sealed record PlatformCourseVideo(
    Guid Id,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt);

public sealed record PlatformLibraryVideo(PlatformCourseVideo Video, int CourseCount);

public sealed record StoredPlatformVideo(string ContentType, long SizeBytes);
