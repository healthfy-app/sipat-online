namespace SipatOnline.Learning.Application;

public sealed record LearningTrackCard(
    Guid Id,
    Guid SipatEventId,
    string Title,
    string? Description,
    int RevisionNumber,
    int LessonCount,
    int CompletedLessonCount,
    int ProgressPercentage);

public sealed record LearningLessonProgress(
    Guid Id,
    string Title,
    string? Description,
    int Position,
    long DurationMilliseconds,
    long LastPlaybackPositionMilliseconds,
    int WatchedPercentage,
    bool IsCompleted,
    DateTimeOffset? CompletedAt);

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
