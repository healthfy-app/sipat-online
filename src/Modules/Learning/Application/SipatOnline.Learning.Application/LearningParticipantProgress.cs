namespace SipatOnline.Learning.Application;

public sealed record LearningParticipantProgress(
    Guid ParticipantId,
    string LoginIdentifier,
    string DisplayName,
    Guid TrackId,
    string TrackTitle,
    DateTimeOffset AssignedAt,
    int LessonCount,
    int CompletedLessonCount,
    int ProgressPercentage,
    bool IsCompleted,
    long WatchedMilliseconds = 0,
    DateTimeOffset? CompletedAt = null,
    DateTimeOffset? LastAccessedAt = null);
