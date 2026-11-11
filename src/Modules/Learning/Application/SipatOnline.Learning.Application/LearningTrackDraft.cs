namespace SipatOnline.Learning.Application;

public sealed record LearningTrackDraft(
    Guid TrackId,
    Guid SipatEventId,
    string Title,
    string? Description,
    Guid RevisionId,
    int RevisionNumber,
    IReadOnlyList<LearningDraftLesson> Lessons);

public sealed record LearningDraftLesson(
    Guid Id,
    string Title,
    string? Description,
    string ProviderAssetReference,
    int Position,
    long DurationMilliseconds);
