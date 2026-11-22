using SipatOnline.Learning.Application.Quality;

namespace SipatOnline.Application.UnitTests.Quality;

public sealed class PlaybackQualityConclusionTests
{
    [Fact]
    public void Says_there_is_no_data_yet()
    {
        var text = PlaybackQualityConclusion.For(Indicators(0, null, null, null, null), Hours());

        Assert.Equal("Ainda não há sessões de vídeo registradas neste treinamento.", text);
    }

    [Fact]
    public void Says_all_good()
    {
        var text = PlaybackQualityConclusion.For(Indicators(10, 0, 5, 1000, 0.2), Hours());

        Assert.Equal("A entrega de vídeo funcionou bem: os quatro indicadores ficaram na faixa boa.", text);
    }

    [Fact]
    public void Lists_the_attention_points()
    {
        var text = PlaybackQualityConclusion.For(Indicators(10, 0, 15, 3000, 0.2), Hours());

        Assert.Equal("A entrega de vídeo funcionou, com pontos de atenção em sessões com travamento e tempo para começar.", text);
    }

    [Fact]
    public void Names_the_poor_indicators_and_the_worst_hour()
    {
        var hours = Hours();
        hours[17] = hours[17] with { StalledSessions = 3 };
        hours[10] = hours[10] with { StalledSessions = 3 };

        var text = PlaybackQualityConclusion.For(Indicators(10, 0, 40, 3000, 5), hours);

        Assert.Equal(
            "Houve problemas na entrega de vídeo: sessões com travamento e tempo travado ficaram acima do limite. O horário com mais travamentos foi às 10h.",
            text);
    }

    [Fact]
    public void Leaves_out_the_hour_when_nothing_stalled()
    {
        var text = PlaybackQualityConclusion.For(Indicators(10, 5, 0, 1000, 0), Hours());

        Assert.Equal("Houve problemas na entrega de vídeo: sessões que não começaram ficaram acima do limite.", text);
    }

    private static HourBucket[] Hours() => Enumerable.Range(0, 24).Select(hour => new HourBucket(hour, 0, 0)).ToArray();

    private static QualityIndicators Indicators(int sessions, double? never, double? stalledSessions, double? startup, double? stalledTime) =>
        new(sessions, sessions,
            Indicator(never, PlaybackQualityThresholds.NeverStarted),
            Indicator(stalledSessions, PlaybackQualityThresholds.StalledSessions),
            Indicator(startup, PlaybackQualityThresholds.Startup),
            Indicator(stalledTime, PlaybackQualityThresholds.StalledTime));

    private static QualityIndicator Indicator(double? value, Func<double, QualityLevel> classify) =>
        value is null ? new QualityIndicator(null, null) : new QualityIndicator(value, classify(value.Value));
}
