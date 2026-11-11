namespace SipatOnline.Learning.Application;

public sealed record LearningTrackSummary(
    Guid Id,
    Guid SipatEventId,
    string Title,
    string? Description,
    int RevisionNumber,
    int LessonCount,
    bool IsPublished);
