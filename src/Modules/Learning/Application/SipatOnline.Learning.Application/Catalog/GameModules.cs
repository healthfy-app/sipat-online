namespace SipatOnline.Learning.Application.Catalog;

public sealed record GameQuestion(string Text, IReadOnlyList<string> Options, int CorrectIndex);

public sealed record GameModule(
    Guid Id,
    string Title,
    GamificationGameType GameType,
    IReadOnlyList<GameQuestion> Questions,
    DateTimeOffset CreatedAt,
    GameContent? Content = null);

public sealed record GamePair(string First, string Second);

public sealed record GameRisk(string Label, decimal X, decimal Y, decimal Width, decimal Height);

/// <summary>One card of the "Seguro ou arriscado?" game: a situation, whether it is safe, and why.</summary>
public sealed record GameCard(string Text, bool Safe, string? Explanation = null);

public sealed record GameContent(
    string? ImageUrl,
    IReadOnlyList<string>? Items,
    IReadOnlyList<GamePair>? Pairs,
    IReadOnlyList<GameRisk>? Risks,
    int Columns = 2,
    IReadOnlyList<GameCard>? Cards = null);

public sealed record LibraryGameModule(GameModule Module, int UsageCount);

/// <summary>Places a game module in the course track after the given number of videos (0 = before the first).</summary>
public sealed record CourseModulePlacement(Guid ModuleId, int AfterVideoCount);

/// <summary>Pauses a video at the given time to show a game module.</summary>
public sealed record VideoCheckpoint(long TimeMilliseconds, Guid ModuleId);
