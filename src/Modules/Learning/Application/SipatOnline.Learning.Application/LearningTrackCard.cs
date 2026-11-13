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
    int? CoursePosition = null);

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
    long WatchedMilliseconds = 0);

public sealed record LearningExperience(
    LearningTrackCard Track,
    IReadOnlyList<LearningLessonProgress> Lessons);

public sealed record PlaybackSession(
    string Url,
    string? ContentType,
    DateTimeOffset ExpiresAt,
    Guid SessionId,
    bool IsDevelopmentDemo);

public sealed record LearningLessonContext(
    Guid TrackId,
    Guid RevisionId,
    Guid LessonId,
    string ProviderAssetReference,
    long DurationMilliseconds);

public sealed record LearningParticipantReport(
    Guid ParticipantId,
    string LoginIdentifier,
    string DisplayName,
    IReadOnlyList<LearningExperience> Tracks);
