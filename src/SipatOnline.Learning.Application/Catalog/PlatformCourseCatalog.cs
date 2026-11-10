namespace SipatOnline.Learning.Application.Catalog;

public sealed record PlatformCourse(
    Guid Id,
    string Title,
    string? Description,
    DateTimeOffset CreatedAt,
    IReadOnlyList<PlatformCourseVideo> Videos);

public sealed record PlatformCourseVideo(
    Guid Id,
    Guid CourseId,
    string Title,
    string ContentType,
    long SizeBytes,
    long DurationMilliseconds,
    DateTimeOffset CreatedAt);

public sealed record StoredPlatformVideo(string ContentType, long SizeBytes);
