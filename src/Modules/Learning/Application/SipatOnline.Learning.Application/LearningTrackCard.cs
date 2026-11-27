namespace SipatOnline.Learning.Application;

public sealed record LearningTrackCard(
    Guid Id,
    Guid SipatEventId,
    string Title,
    string? Description,
    int RevisionNumber,
    int LessonCount,
    int CompletedLessonCount,
    int ProgressPercentage,
    string? CoverUrl = null,
    string? DayTitle = null,
    int? DayPosition = null,
    int? CoursePosition = null,
    DateOnly? DayDate = null,
    long DurationMilliseconds = 0,
    string? SipatTitle = null,
    DateTimeOffset? SipatStartsAt = null,
    string? SipatStatus = null,
    DateTimeOffset? SipatEndsAt = null);

public sealed record LearningLessonProgress(
    Guid Id,
    string Title,
    string? Description,
    int Position,
    long DurationMilliseconds,
    long LastPlaybackPositionMilliseconds,
    int WatchedPercentage,
    bool IsCompleted,
    DateTimeOffset? CompletedAt,
    string? SectionTitle = null,
    long WatchedMilliseconds = 0,
    bool IsBonus = false,
    string? Provider = null,
    string? ExternalId = null,
    string? ThumbnailUrl = null);

public sealed record LearningExperience(
    LearningTrackCard Track,
    IReadOnlyList<LearningLessonProgress> Lessons);

/// <summary>One address of the same video; <paramref name="Quality"/> is "1080p", "720p", "480p" or null for a single version.</summary>
public sealed record PlaybackSource(string Url, string? Quality);

public sealed record PlaybackSession(
    string Url,
    string? ContentType,
    DateTimeOffset ExpiresAt,
    Guid SessionId,
    bool IsDevelopmentDemo,
    IReadOnlyList<PlaybackSource>? Sources = null);

public sealed record LearningLessonContext(
    Guid TrackId,
    Guid RevisionId,
    Guid LessonId,
    string ProviderAssetReference,
    long DurationMilliseconds,
    bool IsBonus = false);

public sealed record LearningParticipantReport(
    Guid ParticipantId,
    string LoginIdentifier,
    string DisplayName,
    IReadOnlyList<LearningExperience> Tracks);
