using SipatOnline.BuildingBlocks.Domain;
using SipatOnline.Learning.Domain.Quality;

namespace SipatOnline.Domain.UnitTests.Learning;

public sealed class PlaybackQualityReportTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 14, 12, 0, 0, TimeSpan.Zero);

    private static Result<PlaybackQualityReport> Create(
        Guid? id = null,
        Guid? lessonId = null,
        Guid? sessionId = null,
        DateTimeOffset? startedAt = null,
        int timezone = -180,
        long? startup = 1200,
        bool neverStarted = false,
        int stallCount = 2,
        long stallMs = 3000,
        long watchedMs = 120_000,
        PlaybackErrorKind? error = null,
        string quality = "720p",
        int switches = 1,
        string? connection = "4g",
        double? downlink = 8.5,
        PlaybackDevice device = PlaybackDevice.Phone) =>
        PlaybackQualityReport.Create(
            id ?? Guid.NewGuid(),
            lessonId ?? Guid.NewGuid(),
            sessionId ?? Guid.NewGuid(),
            startedAt ?? Now.AddMinutes(-5),
            timezone,
            startup,
            neverStarted,
            stallCount,
            stallMs,
            watchedMs,
            error,
            quality,
            switches,
            connection,
            downlink,
            device,
            Now);

    [Fact]
    public void Accepts_a_typical_report()
    {
        var result = Create();

        Assert.True(result.IsSuccess);
        Assert.Equal("720p", result.Value.Quality);
        Assert.Equal(PlaybackDevice.Phone, result.Value.Device);
    }

    [Fact]
    public void Accepts_nullable_fields_left_empty()
    {
        var result = Create(startup: null, neverStarted: true, connection: null, downlink: null,
            error: PlaybackErrorKind.Network);

        Assert.True(result.IsSuccess);
    }

    [Fact]
    public void Accepts_every_limit_inclusively()
    {
        Assert.True(Create(startedAt: Now.AddDays(-7)).IsSuccess);
        Assert.True(Create(startedAt: Now.AddMinutes(5)).IsSuccess);
        Assert.True(Create(timezone: -840).IsSuccess);
        Assert.True(Create(timezone: 840).IsSuccess);
        Assert.True(Create(startup: 0).IsSuccess);
        Assert.True(Create(startup: 600_000).IsSuccess);
        Assert.True(Create(stallCount: 10_000).IsSuccess);
        Assert.True(Create(stallMs: 21_600_000).IsSuccess);
        Assert.True(Create(watchedMs: 21_600_000).IsSuccess);
        Assert.True(Create(switches: 1000).IsSuccess);
        Assert.True(Create(downlink: 0).IsSuccess);
        Assert.True(Create(downlink: 10_000).IsSuccess);
    }

    public static TheoryData<string, Result<PlaybackQualityReport>> OutOfBounds => new()
    {
        { "empty id", Create(id: Guid.Empty) },
        { "empty lesson", Create(lessonId: Guid.Empty) },
        { "empty session", Create(sessionId: Guid.Empty) },
        { "too old", Create(startedAt: Now.AddDays(-7).AddTicks(-1)) },
        { "too far in the future", Create(startedAt: Now.AddMinutes(5).AddTicks(1)) },
        { "timezone low", Create(timezone: -841) },
        { "timezone high", Create(timezone: 841) },
        { "startup negative", Create(startup: -1) },
        { "startup too high", Create(startup: 600_001) },
        { "stall count negative", Create(stallCount: -1) },
        { "stall count too high", Create(stallCount: 10_001) },
        { "stall ms negative", Create(stallMs: -1) },
        { "stall ms too high", Create(stallMs: 21_600_001) },
        { "watched negative", Create(watchedMs: -1) },
        { "watched too high", Create(watchedMs: 21_600_001) },
        { "unknown quality", Create(quality: "1080p") },
        { "quality case", Create(quality: "720P") },
        { "empty quality", Create(quality: "") },
        { "switches negative", Create(switches: -1) },
        { "switches too high", Create(switches: 1001) },
        { "unknown connection", Create(connection: "5g") },
        { "connection case", Create(connection: "4G") },
        { "downlink negative", Create(downlink: -0.1) },
        { "downlink too high", Create(downlink: 10_000.1) },
        { "downlink NaN", Create(downlink: double.NaN) },
        { "undefined device", Create(device: (PlaybackDevice)99) },
        { "undefined error kind", Create(error: (PlaybackErrorKind)99) },
    };

    [Theory]
    [MemberData(nameof(OutOfBounds))]
    public void Rejects_values_out_of_bounds(string _, Result<PlaybackQualityReport> result)
    {
        Assert.False(result.IsSuccess);
        Assert.Equal("learning.playback_quality_invalid", result.Error.Code);
        Assert.Equal("O resumo de qualidade do vídeo é inválido.", result.Error.Message);
    }
}
