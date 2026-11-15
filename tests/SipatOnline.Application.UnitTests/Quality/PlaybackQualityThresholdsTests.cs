using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Application.UnitTests.Quality;

public sealed class PlaybackQualityThresholdsTests
{
    [Theory]
    [InlineData(0.99, QualityLevel.Good)]
    [InlineData(1.0, QualityLevel.Attention)]
    [InlineData(3.0, QualityLevel.Attention)]
    [InlineData(3.01, QualityLevel.Poor)]
    public void Classifies_stalled_time(double percent, QualityLevel expected) =>
        Assert.Equal(expected, PlaybackQualityThresholds.StalledTime(percent));

    [Theory]
    [InlineData(9.99, QualityLevel.Good)]
    [InlineData(10, QualityLevel.Attention)]
    [InlineData(25, QualityLevel.Attention)]
    [InlineData(25.01, QualityLevel.Poor)]
    public void Classifies_stalled_sessions(double percent, QualityLevel expected) =>
        Assert.Equal(expected, PlaybackQualityThresholds.StalledSessions(percent));

    [Theory]
    [InlineData(1999, QualityLevel.Good)]
    [InlineData(2000, QualityLevel.Attention)]
    [InlineData(5000, QualityLevel.Attention)]
    [InlineData(5001, QualityLevel.Poor)]
    public void Classifies_startup(double milliseconds, QualityLevel expected) =>
        Assert.Equal(expected, PlaybackQualityThresholds.Startup(milliseconds));

    [Theory]
    [InlineData(0.99, QualityLevel.Good)]
    [InlineData(1, QualityLevel.Attention)]
    [InlineData(3, QualityLevel.Attention)]
    [InlineData(3.01, QualityLevel.Poor)]
    public void Classifies_never_started(double percent, QualityLevel expected) =>
        Assert.Equal(expected, PlaybackQualityThresholds.NeverStarted(percent));

    [Fact]
    public void Evaluates_the_four_indicators_from_totals()
    {
        var result = PlaybackQualityThresholds.Evaluate(new QualityTotals(4, 1, 2, 18_000, 202_000, 2000));

        Assert.Equal(4, result.Sessions);
        Assert.Equal(3, result.StartedSessions);
        Assert.Equal(25, result.NeverStartedPercent.Value);
        Assert.Equal(QualityLevel.Poor, result.NeverStartedPercent.Level);
        Assert.Equal(66.67, result.StalledSessionsPercent.Value!.Value, 2);
        Assert.Equal(QualityLevel.Poor, result.StalledSessionsPercent.Level);
        Assert.Equal(2000, result.AverageStartupMilliseconds.Value);
        Assert.Equal(QualityLevel.Attention, result.AverageStartupMilliseconds.Level);
        Assert.Equal(8.18, result.StalledTimePercent.Value!.Value, 2);
        Assert.Equal(QualityLevel.Poor, result.StalledTimePercent.Level);
    }

    [Fact]
    public void Has_no_value_or_level_without_sessions()
    {
        var result = PlaybackQualityThresholds.Evaluate(new QualityTotals(0, 0, 0, 0, 0, null));

        foreach (var indicator in new[]
        {
            result.NeverStartedPercent, result.StalledSessionsPercent,
            result.AverageStartupMilliseconds, result.StalledTimePercent
        })
        {
            Assert.Null(indicator.Value);
            Assert.Null(indicator.Level);
        }
    }
}
