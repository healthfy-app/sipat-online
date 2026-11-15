namespace SipatOnline.Learning.Application.Quality;

[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
public enum QualityLevel
{
    Good,
    Attention,
    Poor
}

public sealed record QualityIndicator(double? Value, QualityLevel? Level);

/// <summary>What the database adds up for a group of sessions. Percentages are worked out from these, never stored.</summary>
public sealed record QualityTotals(
    int Sessions,
    int NeverStarted,
    int StalledSessions,
    long StallMilliseconds,
    long WatchedMilliseconds,
    double? AverageStartupMilliseconds);

public sealed record QualityIndicators(
    int Sessions,
    int StartedSessions,
    QualityIndicator NeverStartedPercent,
    QualityIndicator StalledSessionsPercent,
    QualityIndicator AverageStartupMilliseconds,
    QualityIndicator StalledTimePercent);

/// <summary>The traffic-light limits live here and nowhere else. The boundary values are "Attention".</summary>
public static class PlaybackQualityThresholds
{
    public static QualityIndicators Evaluate(QualityTotals totals)
    {
        ArgumentNullException.ThrowIfNull(totals);
        var started = totals.Sessions - totals.NeverStarted;
        var playedMilliseconds = totals.WatchedMilliseconds + totals.StallMilliseconds;

        return new QualityIndicators(
            totals.Sessions,
            started,
            Indicator(totals.Sessions > 0 ? totals.NeverStarted * 100d / totals.Sessions : null, NeverStarted),
            Indicator(started > 0 ? totals.StalledSessions * 100d / started : null, StalledSessions),
            Indicator(totals.AverageStartupMilliseconds, Startup),
            Indicator(playedMilliseconds > 0 ? totals.StallMilliseconds * 100d / playedMilliseconds : null, StalledTime));
    }

    public static QualityLevel StalledTime(double percent) => Classify(percent, 1, 3);

    public static QualityLevel StalledSessions(double percent) => Classify(percent, 10, 25);

    public static QualityLevel Startup(double milliseconds) => Classify(milliseconds, 2000, 5000);

    public static QualityLevel NeverStarted(double percent) => Classify(percent, 1, 3);

    private static QualityLevel Classify(double value, double attentionFrom, double poorAfter) =>
        value < attentionFrom ? QualityLevel.Good
        : value <= poorAfter ? QualityLevel.Attention
        : QualityLevel.Poor;

    private static QualityIndicator Indicator(double? value, Func<double, QualityLevel> classify) =>
        value is null ? new QualityIndicator(null, null) : new QualityIndicator(value, classify(value.Value));
}

public sealed record HourBucket(int Hour, int Sessions, int StalledSessions);

/// <summary>A group of sessions. The key is lower case; null means the browser gave no value.</summary>
public sealed record QualityBucket(string? Key, QualityTotals Totals);

public sealed record VideoQualityRow(Guid? VideoId, string Title, QualityTotals Totals);

public sealed record ProblemParticipant(
    Guid ParticipantId,
    string DisplayName,
    string LoginIdentifier,
    int Sessions,
    int NeverStarted,
    double StalledTimePercent);

public sealed record SipatOption(Guid Id, string Title, DateTimeOffset StartsAt);

public sealed record CompanyQualityScope(
    Guid CompanyId,
    string CompanyName,
    string CompanyKey,
    IReadOnlyList<SipatOption> Sipats,
    Guid? DefaultSipatId);

public sealed record QualityAggregate(
    QualityTotals Totals,
    IReadOnlyList<HourBucket> ByHour,
    IReadOnlyList<QualityBucket> ByConnection,
    IReadOnlyList<QualityBucket> ByDevice,
    IReadOnlyList<QualityBucket> ByQuality,
    IReadOnlyList<QualityBucket> ByDay,
    IReadOnlyList<VideoQualityRow> Videos,
    IReadOnlyList<ProblemParticipant> People,
    IReadOnlyList<int> Days);

public sealed record CompanyQualityTotals(Guid CompanyId, string Name, QualityTotals Totals);

public interface IPlaybackQualityDashboardStore
{
    Task<CompanyQualityScope?> FindScopeAsync(Guid companyId, CancellationToken cancellationToken);

    Task<QualityAggregate> AggregateAsync(Guid companyId, Guid sipatId, int? day, CancellationToken cancellationToken);

    Task<IReadOnlyList<CompanyQualityTotals>> CompareAsync(
        DateTimeOffset from, DateTimeOffset toExclusive, CancellationToken cancellationToken);
}

public sealed record QualityBreakdownItem(string? Key, QualityIndicators Indicators);

public sealed record VideoQualityItem(Guid? VideoId, string Title, QualityIndicators Indicators);

public sealed record CompanyQualityItem(Guid CompanyId, string Name, QualityIndicators Indicators);

public sealed record CompanyPlaybackQuality(
    Guid CompanyId,
    string CompanyName,
    string CompanyKey,
    IReadOnlyList<SipatOption> Sipats,
    Guid? SipatId,
    int? Day,
    IReadOnlyList<int> Days,
    QualityIndicators Indicators,
    IReadOnlyList<HourBucket> ByHour,
    IReadOnlyList<QualityBreakdownItem> ByConnection,
    IReadOnlyList<QualityBreakdownItem> ByDevice,
    IReadOnlyList<QualityBreakdownItem> ByQuality,
    IReadOnlyList<QualityBreakdownItem> ByDay,
    IReadOnlyList<VideoQualityItem> Videos,
    IReadOnlyList<ProblemParticipant> People);

public sealed record CompanyQualityComparison(DateOnly From, DateOnly To, IReadOnlyList<CompanyQualityItem> Companies);
