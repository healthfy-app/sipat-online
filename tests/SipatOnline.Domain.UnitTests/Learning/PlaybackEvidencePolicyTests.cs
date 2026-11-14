using SipatOnline.Learning.Domain.Progress;

namespace SipatOnline.Domain.UnitTests.Learning;

public sealed class PlaybackEvidencePolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 14, 12, 0, 0, TimeSpan.Zero);
    private const long Duration = 600_000;

    private static IReadOnlyList<WatchedRange>? Accept(
        IReadOnlyList<WatchedRange> accepted,
        long start,
        long end,
        DateTimeOffset? startedAt = null,
        DateTimeOffset? expiresAt = null) =>
        PlaybackEvidencePolicy.Accept(
            accepted,
            start,
            end,
            Duration,
            startedAt ?? Now.AddSeconds(-10),
            expiresAt ?? Now.AddMinutes(30),
            Now);

    [Fact]
    public void Accepts_a_plausible_range_and_merges_it()
    {
        var result = Accept([new WatchedRange(0, 5000)], 4000, 9000);

        Assert.Equal([new WatchedRange(0, 9000)], result);
    }

    [Fact]
    public void Rejects_after_expiry()
    {
        Assert.Null(Accept([], 0, 1000, expiresAt: Now.AddMilliseconds(-1)));
    }

    [Theory]
    [InlineData(-1, 1000)]
    [InlineData(1000, 1000)]
    [InlineData(2000, 1000)]
    [InlineData(0, Duration + 1)]
    public void Rejects_negative_empty_or_beyond_duration(long start, long end)
    {
        Assert.Null(Accept([], start, end));
    }

    [Fact]
    public void Rejects_more_coverage_than_twice_the_elapsed_time_plus_two_seconds()
    {
        Assert.Null(Accept([], 0, 22_001));
        Assert.Equal([new WatchedRange(0, 22_000)], Accept([], 0, 22_000));
    }

    [Fact]
    public void Merges_touching_ranges()
    {
        var result = Accept([new WatchedRange(0, 1000)], 1000, 2000);

        Assert.Equal([new WatchedRange(0, 2000)], result);
    }
}
