using SipatOnline.BuildingBlocks.Domain;

namespace SipatOnline.Learning.Domain.Quality;

public enum PlaybackErrorKind
{
    Network,
    Decode,
    Source,
    Unknown,
}

public enum PlaybackDevice
{
    Phone,
    Tablet,
    Desktop,
}

/// <summary>Summary of one video playback session, sent by the browser. The limits are the server's input validation.</summary>
public sealed record PlaybackQualityReport(
    Guid Id,
    Guid LessonId,
    Guid PlaybackSessionId,
    DateTimeOffset StartedAt,
    int TimezoneOffsetMinutes,
    long? StartupMilliseconds,
    bool NeverStarted,
    int StallCount,
    long StallMilliseconds,
    long WatchedMilliseconds,
    PlaybackErrorKind? ErrorKind,
    string Quality,
    int QualitySwitches,
    string? ConnectionType,
    double? DownlinkMbps,
    PlaybackDevice Device)
{
    public const string InvalidCode = "learning.playback_quality_invalid";

    private const long MaxStartupMilliseconds = 600_000;
    private const int MaxStallCount = 10_000;
    private const long MaxDurationMilliseconds = 21_600_000;
    private const int MaxQualitySwitches = 1000;
    private const double MaxDownlinkMbps = 10_000;

    private static readonly string[] Qualities = ["single", "1080p", "720p", "480p"];
    private static readonly string[] ConnectionTypes = ["slow-2g", "2g", "3g", "4g"];

    public static Result<PlaybackQualityReport> Create(
        Guid id,
        Guid lessonId,
        Guid playbackSessionId,
        DateTimeOffset startedAt,
        int timezoneOffsetMinutes,
        long? startupMilliseconds,
        bool neverStarted,
        int stallCount,
        long stallMilliseconds,
        long watchedMilliseconds,
        PlaybackErrorKind? errorKind,
        string quality,
        int qualitySwitches,
        string? connectionType,
        double? downlinkMbps,
        PlaybackDevice device,
        DateTimeOffset now)
    {
        var valid =
            id != Guid.Empty
            && lessonId != Guid.Empty
            && playbackSessionId != Guid.Empty
            && startedAt >= now.AddDays(-7)
            && startedAt <= now.AddMinutes(5)
            && timezoneOffsetMinutes is >= -840 and <= 840
            && (startupMilliseconds is null or (>= 0 and <= MaxStartupMilliseconds))
            && stallCount is >= 0 and <= MaxStallCount
            && stallMilliseconds is >= 0 and <= MaxDurationMilliseconds
            && watchedMilliseconds is >= 0 and <= MaxDurationMilliseconds
            && (errorKind is null || Enum.IsDefined(errorKind.Value))
            && quality is not null && Qualities.Contains(quality, StringComparer.Ordinal)
            && qualitySwitches is >= 0 and <= MaxQualitySwitches
            && (connectionType is null || ConnectionTypes.Contains(connectionType, StringComparer.Ordinal))
            && (downlinkMbps is null || downlinkMbps is >= 0 and <= MaxDownlinkMbps)
            && Enum.IsDefined(device);

        if (!valid)
        {
            return Result<PlaybackQualityReport>.Failure(
                new DomainError(InvalidCode, "O resumo de qualidade do vídeo é inválido."));
        }

        return Result<PlaybackQualityReport>.Success(new PlaybackQualityReport(
            id,
            lessonId,
            playbackSessionId,
            startedAt.ToUniversalTime(),
            timezoneOffsetMinutes,
            startupMilliseconds,
            neverStarted,
            stallCount,
            stallMilliseconds,
            watchedMilliseconds,
            errorKind,
            quality!,
            qualitySwitches,
            connectionType,
            downlinkMbps,
            device));
    }
}
