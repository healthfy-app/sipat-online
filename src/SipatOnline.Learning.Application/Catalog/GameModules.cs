namespace SipatOnline.Learning.Application.Catalog;

public sealed record GameQuestion(string Text, IReadOnlyList<string> Options, int CorrectIndex);

public sealed record GameModule(
    Guid Id,
    string Title,
    GamificationGameType GameType,
    IReadOnlyList<GameQuestion> Questions,
    DateTimeOffset CreatedAt);

public sealed record LibraryGameModule(GameModule Module, int UsageCount);

/// <summary>Places a game module in the course track after the given number of videos (0 = before the first).</summary>
public sealed record CourseModulePlacement(Guid ModuleId, int AfterVideoCount);

/// <summary>Pauses a video at the given time to show a game module.</summary>
public sealed record VideoCheckpoint(long TimeMilliseconds, Guid ModuleId);
